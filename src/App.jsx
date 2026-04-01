import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Legend } from "recharts";

// ==========================================
// SUPABASE CONNECTION
// ==========================================
const supabase = createClient(
  "https://lgorvuqlehnljuaqtlet.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxnb3J2dXFsZWhubGp1YXF0bGV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2ODYyNzcsImV4cCI6MjA4OTI2MjI3N30.xnkFU8Eo9-XRnVtiDghlyHi-ENl3cd1Iak1f8x60lLw"
);

// Helper to call Claude API through our serverless function
async function askClaude(message, dataContext, chatType = "general") {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, dataContext, chatType })
    });
    const data = await res.json();
    if (data.error) return "Error: " + data.error;
    return data.response;
  } catch (err) {
    return "Error de conexión. Inténtalo de nuevo.";
  }
}

// Build data context string from Supabase data
function buildDataContext(data) {
  if (!data) return "";
  const lines = [];
  
  // CRITICAL: Complete list of valid crotals — Claude MUST NOT mention any crotal not in this list
  const allCrotals = data.cabras.map(c => c.crotal).sort();
  lines.push(`⚠️ CROTALES VÁLIDOS EN EL SISTEMA (${allCrotals.length} cabras). Si un crotal NO está en esta lista, NO EXISTE:`);
  // Send in compact format to save tokens
  lines.push(allCrotals.join(", "));
  
  lines.push(`\nTotal cabras: ${data.cabras.length}`);
  
  // Lotes with counts AND estado
  const loteCounts = {};
  data.cabras.forEach(c => {
    const lote = data.lotes.find(l => l.id === c.lote_id);
    if (lote) loteCounts[lote.nombre] = (loteCounts[lote.nombre] || 0) + 1;
  });
  lines.push("Lotes: " + Object.entries(loteCounts).map(([n, c]) => `${n}: ${c}`).join(", "));
  
  // Lote estados
  const loteEstados = data.lotes.filter(l => l.estado && l.estado !== 'produccion').map(l => `${l.nombre}: ${l.estado}`);
  if (loteEstados.length > 0) lines.push(`Lotes NO en producción: ${loteEstados.join(", ")}`);
  
  lines.push(`Partos registrados: ${data.partos.length}`);
  lines.push(`Ecografías: ${data.ecografias.length}`);
  lines.push(`Tratamientos: ${data.tratamientos.length}`);
  lines.push(`Cubriciones: ${data.cubriciones.length}`);
  lines.push(`Crías hembra: ${data.crias.length}`);
  lines.push(`Parideras: ${data.parideras.map(p => p.nombre).join(", ")}`);
  lines.push(`Reglas activas: ${data.reglas.length}`);
  
  // Production data — multi-day summary
  const prod = data.produccion || [];
  const allDates = [...new Set(prod.map(p => p.fecha))].sort((a, b) => b.localeCompare(a));
  if (allDates.length > 0) {
    lines.push(`\nDías de producción importados: ${allDates.length} (${allDates[allDates.length - 1]} a ${allDates[0]})`);
    allDates.slice(0, 5).forEach(fecha => {
      const dayProd = prod.filter(p => p.fecha === fecha);
      const totalL = dayProd.reduce((s, p) => s + (p.litros || 0), 0);
      lines.push(`  ${fecha}: ${dayProd.length} cabras, ${totalL.toFixed(1)}L total, ${(totalL / dayProd.length).toFixed(2)}L/cabra`);
    });
  }
  
  // Double vacías
  const vaciasByC = {};
  data.ecografias.filter(e => e.resultado === "vacia").forEach(e => {
    const cr = e.cabra?.crotal;
    if (cr) vaciasByC[cr] = (vaciasByC[cr] || 0) + 1;
  });
  const dobleVacias = Object.entries(vaciasByC).filter(([, c]) => c >= 2).map(([cr]) => cr);
  if (dobleVacias.length > 0) lines.push(`Cabras vacías en 2+ ecografías: ${dobleVacias.join(", ")}`);
  
  // Anotaciones veterinarias recientes
  const anotaciones = data.anotaciones || [];
  if (anotaciones.length > 0) {
    lines.push(`\nAnotaciones veterinarias: ${anotaciones.length} total`);
    anotaciones.slice(0, 5).forEach(a => {
      lines.push(`  [${a.fecha}] ${a.cabra?.crotal || "General"}: ${a.texto.substring(0, 80)}`);
    });
  }
  
  // Alertas sanitarias activas
  const alertasActivas = (data.alertasSanitarias || []).filter(a => a.estado === "activa");
  if (alertasActivas.length > 0) {
    lines.push(`\n⚠️ Alertas sanitarias activas: ${alertasActivas.length}`);
    alertasActivas.forEach(a => {
      lines.push(`  ${a.fecha}: ${a.titulo} (${a.severidad})`);
    });
  }
  
  // =============================================
  // DETECTOR DE ANOMALÍAS — Errores humanos y datos sospechosos
  // Se envía SIEMPRE para que la IA esté al tanto
  // =============================================
  const anomalias = [];
  const latestDate2 = [...new Set(prod.map(p => p.fecha))].sort((a, b) => b.localeCompare(a))[0];
  const todayProd2 = latestDate2 ? prod.filter(p => p.fecha === latestDate2) : [];
  const prodById = {};
  todayProd2.forEach(p => { prodById[p.cabra_id] = p; });

  // Calcular DEL medio por lote
  const loteDEL = {};
  data.cabras.forEach(c => {
    const lote = data.lotes.find(l => l.id === c.lote_id);
    if (!lote) return;
    const p = prodById[c.id];
    const del = p?.dia_lactacion || c.dias_en_leche || 0;
    if (!loteDEL[lote.nombre]) loteDEL[lote.nombre] = { dels: [], lote };
    loteDEL[lote.nombre].dels.push({ crotal: c.crotal, del, litros: p?.litros || 0, cabra_id: c.id, conductividad: p?.conductividad || 0 });
  });

  // Parametros configurables (data-driven en vez de hardcoded)
  const UMBRAL_DEL_DIFF = 100;
  const UMBRAL_SECADO_LITROS = 3.0;
  const UMBRAL_RECIEN_PARIDAS_DEL = 150;
  const UMBRAL_PARIENDO_DEL = 100;
  const UMBRAL_GESTANTE_DEL_SECADO = 250;
  const UMBRAL_ECO_OBSOLETA_DIAS = 90;

  Object.entries(loteDEL).forEach(([loteName, info]) => {
    if (info.dels.length < 3) return;
    const avgDEL = info.dels.reduce((s, d) => s + d.del, 0) / info.dels.length;
    const estado = info.lote.estado || 'produccion';
    const tipo = info.lote.tipo || '';

    info.dels.forEach(d => {
      // 1. DEL muy fuera de rango del lote
      if (Math.abs(d.del - avgDEL) > UMBRAL_DEL_DIFF && d.del > 0) {
        anomalias.push(`🔍 ${d.crotal} en ${loteName}: DEL=${d.del} (media lote=${Math.round(avgDEL)}). Diferencia de ${Math.abs(Math.round(d.del - avgDEL))} dias — deberia estar en otro lote?`);
      }

      // 2. Cabra en lote secandose pero con produccion alta (data-driven: usa lote.estado)
      if (estado === 'secandose' && d.litros > UMBRAL_SECADO_LITROS) {
        anomalias.push(`🔍 ${d.crotal} en ${loteName} (SECANDOSE) pero produce ${d.litros.toFixed(1)}L — seguro que debe secarse?`);
      }

      // 3. Cabra en lote de recien paridas con muchos DEL (data-driven: usa lote.tipo o estado)
      if ((tipo === 'recien_paridas' || estado === 'recien_paridas') && d.del > UMBRAL_RECIEN_PARIDAS_DEL) {
        anomalias.push(`🔍 ${d.crotal} en ${loteName} (recien paridas) pero DEL=${d.del} — deberia pasar a cubricion`);
      }

      // 4. Cabra en lote pariendo con muchos DEL (data-driven: usa lote.estado)
      if (estado === 'pariendo' && d.del > UMBRAL_PARIENDO_DEL) {
        anomalias.push(`🔍 ${d.crotal} en ${loteName} (pariendo) pero DEL=${d.del} — ya pario y no se movio de lote?`);
      }
    });
  });

  // 5. Vacias con ultima eco vacia que no se han movido a cubricion (data-driven: busca por eco resultado, no por nombre lote)
  data.cabras.forEach(c => {
    if (!c.lote_id || c.estado === "muerta" || c.estado === "baja") return;
    const ecos = data.ecografias.filter(e => e.cabra_id === c.id || e.cabra?.crotal === c.crotal);
    if (ecos.length === 0) return;
    const lastEco = ecos.sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    if (lastEco.resultado === 'vacia') {
      const lote = data.lotes.find(l => l.id === c.lote_id);
      // Si esta en un lote que NO es de cubricion, deberia moverse
      if (lote && lote.estado !== 'cubricion' && lote.tipo !== 'cubricion') {
        anomalias.push(`⚠️ ${c.crotal} en ${lote.nombre}: ultima eco fue VACIA (${lastEco.fecha}) — deberia ir a cubricion`);
      }
    }
  });

  // 6. Gestantes en lotes de produccion con DEL alto — necesitan secado
  data.cabras.forEach(c => {
    const ecos = data.ecografias.filter(e => e.cabra_id === c.id || e.cabra?.crotal === c.crotal);
    if (ecos.length === 0) return;
    const lastEco = ecos.sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    const lote = data.lotes.find(l => l.id === c.lote_id);
    // Data-driven: cualquier lote en estado "produccion" (no solo Lote 1/4)
    if (lastEco.resultado === 'gestante' && lote && (lote.estado === 'produccion' || !lote.estado)) {
      const p = prodById[c.id];
      const del = p?.dia_lactacion || c.dias_en_leche || 0;
      if (del > UMBRAL_GESTANTE_DEL_SECADO) {
        anomalias.push(`⚠️ ${c.crotal} es GESTANTE (eco ${lastEco.fecha}) y sigue en ${lote.nombre} con DEL=${del} — deberia estar en proceso de secado`);
      }
    }
  });

  // 7. Cabras sin lote asignado pero con produccion
  data.cabras.filter(c => !c.lote_id && c.estado !== "muerta" && c.estado !== "baja").forEach(c => {
    const p = prodById[c.id];
    if (p && p.litros > 0) {
      anomalias.push(`🔍 ${c.crotal} produce ${p.litros.toFixed(1)}L pero NO tiene lote asignado — asignar lote`);
    }
  });

  // 8. NUEVO: Ecografia obsoleta — ultima eco hace >90 dias en cabras activas
  data.cabras.forEach(c => {
    if (c.estado === "muerta" || c.estado === "baja" || !c.lote_id) return;
    const ecos = data.ecografias.filter(e => e.cabra_id === c.id || e.cabra?.crotal === c.crotal);
    if (ecos.length === 0) return;
    const lastEco = ecos.sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    const diasDesdeEco = Math.floor((new Date() - new Date(lastEco.fecha)) / 86400000);
    if (diasDesdeEco > UMBRAL_ECO_OBSOLETA_DIAS) {
      const lote = data.lotes.find(l => l.id === c.lote_id);
      anomalias.push(`🔍 ${c.crotal} (${lote?.nombre || "Sin lote"}): ultima eco hace ${diasDesdeEco} dias (${lastEco.fecha}, resultado: ${lastEco.resultado}) — dato posiblemente obsoleto`);
    }
  });

  if (anomalias.length > 0) {
    lines.push(`\n🔍 ANOMALÍAS DETECTADAS (${anomalias.length}) — posibles errores humanos o de gestión:`);
    anomalias.forEach(a => lines.push(`  ${a}`));
  }

  // === INTELIGENCIA FASE 2 ===

  // Tendencias de produccion
  const { tendencias, resumen: resTendencias } = analizarTendencias(data);
  if (tendencias.length > 0) {
    lines.push(`\n📈 TENDENCIAS DE PRODUCCION (${tendencias.length} alertas):`);
    if (resTendencias) {
      lines.push(`  Rebano: ${resTendencias.cambioGlobal >= 0 ? '+' : ''}${resTendencias.cambioGlobal.toFixed(1)}% vs dia anterior. ${resTendencias.cabrasEnDeclive} en declive. ${resTendencias.mastitisProbable} mastitis probables.`);
    }
    tendencias.slice(0, 15).forEach(t => {
      lines.push(`  ${t.severidad === "alta" ? "🔴" : t.severidad === "media" ? "🟡" : "🟢"} ${t.tipo} ${t.crotal} (${t.lote}): ${t.detalle}${t.conductividad > 6.0 ? ` [cond: ${t.conductividad}]` : ""}`);
    });
  }

  // Evaluacion de tratamientos
  const { porProducto } = evaluarTratamientos(data);
  const prodEntries = Object.values(porProducto).filter(p => p.total >= 2);
  if (prodEntries.length > 0) {
    lines.push(`\n💊 EFECTIVIDAD DE TRATAMIENTOS:`);
    prodEntries.forEach(p => {
      lines.push(`  ${p.tipo}/${p.producto}: ${p.tasaEfectividad}% efectivo (${p.efectivo}/${p.total} casos)`);
    });
  }

  // Timeline reproductivo
  const { alertas: alertasRepro, proximos } = calcularTimelineReproductivo(data);
  if (alertasRepro.length > 0 || proximos.length > 0) {
    lines.push(`\n🔄 TIMELINE REPRODUCTIVO:`);
    if (alertasRepro.length > 0) {
      lines.push(`  ⚠️ Alertas (${alertasRepro.length}):`);
      alertasRepro.slice(0, 10).forEach(a => {
        lines.push(`    ${a.severidad === "alta" ? "🔴" : "🟡"} ${a.tipo} ${a.crotal} (${a.lote}): ${a.detalle}`);
      });
    }
    if (proximos.length > 0) {
      lines.push(`  📅 Proximos eventos (${proximos.length}):`);
      proximos.slice(0, 10).forEach(p => {
        lines.push(`    ${p.tipo} ${p.crotal} (${p.lote}): ${p.detalle}`);
      });
    }
  }

  return lines.join("\n");
}

// ==========================================
// MOTOR DE INTELIGENCIA — Fase 2
// ==========================================

// 2.1 Analisis de tendencias de produccion
function analizarTendencias(data) {
  if (!data || !data.produccion || data.produccion.length === 0) return { tendencias: [], resumen: null };

  const prod = data.produccion;
  const fechas = [...new Set(prod.map(p => p.fecha))].sort((a, b) => b.localeCompare(a));
  if (fechas.length < 2) return { tendencias: [], resumen: null };

  const tendencias = [];

  // Agrupar produccion por cabra
  const porCabra = {};
  prod.forEach(p => {
    if (!porCabra[p.cabra_id]) porCabra[p.cabra_id] = [];
    porCabra[p.cabra_id].push(p);
  });

  // Para cada cabra con 3+ dias de datos
  Object.entries(porCabra).forEach(([cabraId, registros]) => {
    const sorted = registros.sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (sorted.length < 3) return;

    const cabra = data.cabras.find(c => c.id === parseInt(cabraId));
    if (!cabra) return;
    const lote = data.lotes.find(l => l.id === cabra.lote_id);
    if (lote && lote.estado === "secandose") return; // Ignorar lotes secandose

    const ultimos7 = sorted.slice(-7);
    const ultimo = ultimos7[ultimos7.length - 1];
    const penultimo = ultimos7.length >= 2 ? ultimos7[ultimos7.length - 2] : null;
    const antepenultimo = ultimos7.length >= 3 ? ultimos7[ultimos7.length - 3] : null;

    // Caida brusca: >25% en un dia, con produccion previa >0.5L
    if (penultimo && penultimo.litros > 0.5 && ultimo.litros > 0) {
      const cambio = ((ultimo.litros - penultimo.litros) / penultimo.litros) * 100;
      if (cambio < -25) {
        const condAlta = ultimo.conductividad > 6.0;
        tendencias.push({
          tipo: condAlta ? "MASTITIS_PROBABLE" : "CAIDA_BRUSCA",
          crotal: cabra.crotal,
          lote: lote?.nombre || "Sin lote",
          detalle: `${penultimo.litros.toFixed(1)}L -> ${ultimo.litros.toFixed(1)}L (${cambio.toFixed(0)}%)`,
          conductividad: ultimo.conductividad,
          severidad: condAlta ? "alta" : "media",
          fechas: `${penultimo.fecha} -> ${ultimo.fecha}`,
        });
      }
    }

    // Declive progresivo: caida >15% en ultimos 3 registros
    if (antepenultimo && antepenultimo.litros > 0.5) {
      const cambio3d = ((ultimo.litros - antepenultimo.litros) / antepenultimo.litros) * 100;
      if (cambio3d < -15 && ultimo.litros < penultimo.litros && penultimo.litros < antepenultimo.litros) {
        const yaDetectada = tendencias.some(t => t.crotal === cabra.crotal && (t.tipo === "CAIDA_BRUSCA" || t.tipo === "MASTITIS_PROBABLE"));
        if (!yaDetectada) {
          tendencias.push({
            tipo: "DECLIVE",
            crotal: cabra.crotal,
            lote: lote?.nombre || "Sin lote",
            detalle: `${antepenultimo.litros.toFixed(1)}L -> ${penultimo.litros.toFixed(1)}L -> ${ultimo.litros.toFixed(1)}L (${cambio3d.toFixed(0)}% en 3 dias)`,
            conductividad: ultimo.conductividad,
            severidad: "media",
            fechas: `${antepenultimo.fecha} -> ${ultimo.fecha}`,
          });
        }
      }
    }

    // Subida post-tratamiento: >30% subida + tratamiento en ultimos 7 dias
    if (penultimo && penultimo.litros > 0.3) {
      const subida = ((ultimo.litros - penultimo.litros) / penultimo.litros) * 100;
      if (subida > 30) {
        const tratReciente = (data.tratamientos || []).find(t =>
          t.cabra_id === parseInt(cabraId) &&
          t.fecha >= ultimos7[0].fecha
        );
        if (tratReciente) {
          tendencias.push({
            tipo: "RESPUESTA_TRATAMIENTO",
            crotal: cabra.crotal,
            lote: lote?.nombre || "Sin lote",
            detalle: `${penultimo.litros.toFixed(1)}L -> ${ultimo.litros.toFixed(1)}L (+${subida.toFixed(0)}%) tras ${tratReciente.tipo}: ${tratReciente.producto || "s/n"}`,
            conductividad: ultimo.conductividad,
            severidad: "info",
            fechas: `${penultimo.fecha} -> ${ultimo.fecha}`,
          });
        }
      }
    }
  });

  // Tendencia global del rebano
  const resumen = {};
  if (fechas.length >= 2) {
    const dia1 = prod.filter(p => p.fecha === fechas[0]);
    const dia2 = prod.filter(p => p.fecha === fechas[1]);
    const total1 = dia1.reduce((s, p) => s + (p.litros || 0), 0);
    const total2 = dia2.reduce((s, p) => s + (p.litros || 0), 0);
    const media1 = dia1.length > 0 ? total1 / dia1.length : 0;
    const media2 = dia2.length > 0 ? total2 / dia2.length : 0;
    resumen.mediaHoy = media1;
    resumen.mediaAyer = media2;
    resumen.cambioGlobal = media2 > 0 ? ((media1 - media2) / media2 * 100) : 0;
    resumen.cabrasEnDeclive = tendencias.filter(t => t.tipo === "DECLIVE" || t.tipo === "CAIDA_BRUSCA").length;
    resumen.mastitisProbable = tendencias.filter(t => t.tipo === "MASTITIS_PROBABLE").length;
    resumen.respuestasTratamiento = tendencias.filter(t => t.tipo === "RESPUESTA_TRATAMIENTO").length;
  }

  return { tendencias: tendencias.sort((a, b) => (a.severidad === "alta" ? 0 : 1) - (b.severidad === "alta" ? 0 : 1)), resumen };
}

// 2.2 Correlacion tratamiento -> resultado
function evaluarTratamientos(data) {
  if (!data || !data.tratamientos || data.tratamientos.length === 0) return { evaluaciones: [], porProducto: {} };

  const prod = data.produccion || [];
  const evaluaciones = [];

  data.tratamientos.forEach(trat => {
    if (!trat.cabra_id || !trat.fecha) return;
    const cabra = data.cabras.find(c => c.id === trat.cabra_id);
    if (!cabra) return;

    const prodCabra = prod.filter(p => p.cabra_id === trat.cabra_id).sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (prodCabra.length < 3) return;

    // Produccion 7 dias antes del tratamiento
    const antes = prodCabra.filter(p => p.fecha < trat.fecha).slice(-7);
    // Produccion 7 dias despues del tratamiento
    const despues = prodCabra.filter(p => p.fecha > trat.fecha).slice(0, 7);

    if (antes.length < 2 || despues.length < 2) return;

    const mediaAntes = antes.reduce((s, p) => s + (p.litros || 0), 0) / antes.length;
    const mediaDespues = despues.reduce((s, p) => s + (p.litros || 0), 0) / despues.length;
    const condAntes = antes.reduce((s, p) => s + (p.conductividad || 0), 0) / antes.length;
    const condDespues = despues.reduce((s, p) => s + (p.conductividad || 0), 0) / despues.length;

    const cambioProd = mediaAntes > 0 ? ((mediaDespues - mediaAntes) / mediaAntes * 100) : 0;
    const cambioCond = condAntes > 0 ? ((condDespues - condAntes) / condAntes * 100) : 0;

    let resultado = "sin_cambio";
    if (cambioProd > 10 || cambioCond < -10) resultado = "efectivo";
    else if (cambioProd < -10 || cambioCond > 10) resultado = "ineficaz";

    evaluaciones.push({
      crotal: cabra.crotal,
      tipo: trat.tipo,
      producto: trat.producto || "Sin especificar",
      fecha: trat.fecha,
      mediaAntes: mediaAntes.toFixed(2),
      mediaDespues: mediaDespues.toFixed(2),
      cambioProd: cambioProd.toFixed(1),
      condAntes: condAntes.toFixed(2),
      condDespues: condDespues.toFixed(2),
      cambioCond: cambioCond.toFixed(1),
      resultado,
    });
  });

  // Agregar por producto
  const porProducto = {};
  evaluaciones.forEach(e => {
    const key = `${e.tipo}:${e.producto}`;
    if (!porProducto[key]) porProducto[key] = { tipo: e.tipo, producto: e.producto, total: 0, efectivo: 0, ineficaz: 0, sin_cambio: 0 };
    porProducto[key].total++;
    porProducto[key][e.resultado]++;
  });

  // Calcular tasa de efectividad
  Object.values(porProducto).forEach(p => {
    p.tasaEfectividad = p.total > 0 ? Math.round(p.efectivo / p.total * 100) : 0;
  });

  return { evaluaciones, porProducto };
}

// 2.3 Timeline reproductivo automatico
function calcularTimelineReproductivo(data) {
  if (!data) return { alertas: [], proximos: [] };

  const hoy = new Date();
  const hoyStr = hoy.toISOString().split("T")[0];
  const alertas = [];
  const proximos = [];

  // Para cada cubricion, calcular fechas esperadas
  (data.cubriciones || []).forEach(cub => {
    if (!cub.fecha_entrada) return;
    const cabra = data.cabras.find(c => c.id === cub.cabra_id);
    if (!cabra || cabra.estado === "muerta" || cabra.estado === "baja") return;

    const fechaCub = new Date(cub.fecha_entrada);
    const fechaEcoEsperada = new Date(fechaCub); fechaEcoEsperada.setDate(fechaEcoEsperada.getDate() + 65);
    const fechaPartoEsperado = new Date(fechaCub); fechaPartoEsperado.setDate(fechaPartoEsperado.getDate() + 150);
    const fechaSecado = new Date(fechaPartoEsperado); fechaSecado.setDate(fechaSecado.getDate() - 60);

    const fechaEcoStr = fechaEcoEsperada.toISOString().split("T")[0];
    const fechaPartoStr = fechaPartoEsperado.toISOString().split("T")[0];
    const fechaSecadoStr = fechaSecado.toISOString().split("T")[0];

    // Verificar si ya tiene ecografia posterior a la cubricion
    const tieneEco = (data.ecografias || []).some(e =>
      e.cabra_id === cub.cabra_id && e.fecha >= cub.fecha_entrada
    );

    // Verificar si ya tiene parto posterior a la cubricion
    const tieneParto = (data.partos || []).some(p =>
      p.cabra_id === cub.cabra_id && p.fecha >= cub.fecha_entrada
    );

    const lote = data.lotes.find(l => l.id === cabra.lote_id);
    const crotal = cabra.crotal;
    const loteNombre = lote?.nombre || "Sin lote";

    // Ecografia pendiente
    if (!tieneEco && hoyStr >= fechaEcoStr) {
      const diasRetraso = Math.floor((hoy - fechaEcoEsperada) / 86400000);
      alertas.push({
        tipo: "ECO_PENDIENTE",
        crotal,
        lote: loteNombre,
        detalle: `Cubricion ${cub.fecha_entrada}, eco esperada ${fechaEcoStr} (${diasRetraso} dias de retraso)`,
        severidad: diasRetraso > 15 ? "alta" : "media",
        fechaEsperada: fechaEcoStr,
      });
    }

    // Ecografia proxima (en los proximos 15 dias)
    if (!tieneEco && hoyStr < fechaEcoStr) {
      const diasHasta = Math.floor((fechaEcoEsperada - hoy) / 86400000);
      if (diasHasta <= 15) {
        proximos.push({ tipo: "ECO_PROXIMA", crotal, lote: loteNombre, fecha: fechaEcoStr, diasHasta, detalle: `Eco en ${diasHasta} dias` });
      }
    }

    // Secado urgente — verificar si ya paso la fecha y sigue en produccion
    if (!tieneParto && hoyStr >= fechaSecadoStr) {
      const enProduccion = lote && (lote.estado === "produccion" || !lote.estado);
      if (enProduccion) {
        const diasRetraso = Math.floor((hoy - fechaSecado) / 86400000);
        alertas.push({
          tipo: "SECADO_URGENTE",
          crotal,
          lote: loteNombre,
          detalle: `Parto esperado ${fechaPartoStr}, secado debio empezar ${fechaSecadoStr} (${diasRetraso} dias de retraso)`,
          severidad: "alta",
          fechaEsperada: fechaSecadoStr,
        });
      }
    }

    // Parto proximo (en los proximos 30 dias)
    if (!tieneParto && hoyStr < fechaPartoStr) {
      const diasHasta = Math.floor((fechaPartoEsperado - hoy) / 86400000);
      if (diasHasta <= 30) {
        proximos.push({ tipo: "PARTO_PROXIMO", crotal, lote: loteNombre, fecha: fechaPartoStr, diasHasta, detalle: `Parto en ~${diasHasta} dias` });
      }
    }

    // Parto no registrado — deberia haber parido pero no hay registro
    if (!tieneParto && hoyStr > fechaPartoStr) {
      const diasRetraso = Math.floor((hoy - fechaPartoEsperado) / 86400000);
      if (diasRetraso > 7) {
        alertas.push({
          tipo: "PARTO_NO_REGISTRADO",
          crotal,
          lote: loteNombre,
          detalle: `Parto esperado ${fechaPartoStr}, ${diasRetraso} dias sin registro. Posible parto no registrado o aborto.`,
          severidad: diasRetraso > 20 ? "alta" : "media",
          fechaEsperada: fechaPartoStr,
        });
      }
    }
  });

  return {
    alertas: alertas.sort((a, b) => (a.severidad === "alta" ? 0 : 1) - (b.severidad === "alta" ? 0 : 1)),
    proximos: proximos.sort((a, b) => a.diasHasta - b.diasHasta)
  };
}

// ==========================================
// MESSAGE PARSING & EXPORT UTILITIES
// ==========================================

function extractMarkdownTables(text) {
  const lines = text.split("\n");
  const tables = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.startsWith("|") && line.endsWith("|")) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }
      if (tableLines.length >= 2) {
        const parseRow = (row) => row.split("|").slice(1, -1).map(c => c.trim());
        const headers = parseRow(tableLines[0]);
        const isSep = (row) => parseRow(row).every(c => /^[-:]+$/.test(c));
        const startIdx = isSep(tableLines[1]) ? 2 : 1;
        const rows = tableLines.slice(startIdx).map(parseRow);
        if (rows.length > 0) tables.push({ headers, rows });
      }
    } else {
      i++;
    }
  }
  return tables;
}

function parseMessageStructure(text) {
  if (!text) return [];
  const lines = text.split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Table block
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }
      if (tableLines.length >= 2) {
        const parseRow = (row) => row.split("|").slice(1, -1).map(c => c.trim());
        const headers = parseRow(tableLines[0]);
        const isSep = (row) => parseRow(row).every(c => /^[-:]+$/.test(c));
        const startIdx = isSep(tableLines[1]) ? 2 : 1;
        const rows = tableLines.slice(startIdx).map(parseRow);
        if (rows.length > 0) blocks.push({ type: "table", headers, rows });
      }
      continue;
    }

    // Collapsible block
    if (trimmed === "<details>" || trimmed.startsWith("<details>")) {
      i++;
      let summary = "";
      if (i < lines.length) {
        const sumLine = lines[i].trim();
        const sumMatch = sumLine.match(/<summary>(.*?)<\/summary>/);
        if (sumMatch) { summary = sumMatch[1]; i++; }
      }
      const innerLines = [];
      while (i < lines.length && !lines[i].trim().startsWith("</details>")) {
        innerLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip </details>
      blocks.push({ type: "collapsible", summary, children: parseMessageStructure(innerLines.join("\n")) });
      continue;
    }

    // Section header
    if (trimmed.startsWith("## ")) {
      const title = trimmed.replace(/^## /, "");
      const children = [];
      i++;
      while (i < lines.length) {
        const next = lines[i].trim();
        if (next.startsWith("## ") || next === "<details>" || next.startsWith("<details>")) break;
        if (next.startsWith("|") && next.endsWith("|")) break;
        if (next === "") { i++; continue; }
        const isList = next.startsWith("- ") || next.startsWith("\u2022 ");
        const lineText = isList ? next.replace(/^[-\u2022]\s+/, "") : next;
        children.push({
          type: "line", text: lineText, isList,
          isAlert: /[\u26A0\uFE0F]|\uD83D\uDD34|ALERTA|URGENTE/.test(next),
          isPositive: /\u2705|ESTRELLA|IDEAL/.test(next),
        });
        i++;
      }
      blocks.push({ type: "section", title, children });
      continue;
    }

    // Regular line
    if (trimmed !== "") {
      const isList = trimmed.startsWith("- ") || trimmed.startsWith("\u2022 ");
      const lineText = isList ? trimmed.replace(/^[-\u2022]\s+/, "") : trimmed;
      blocks.push({
        type: "line", text: lineText, isList,
        isAlert: /[\u26A0\uFE0F]|\uD83D\uDD34|ALERTA|URGENTE/.test(trimmed),
        isPositive: /\u2705|ESTRELLA|IDEAL/.test(trimmed),
      });
    }
    i++;
  }
  return blocks;
}

// PDF generation
function generatePrintableHTML(text, queryTitle) {
  const blocks = parseMessageStructure(text);
  const fecha = new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

  function renderBold(str) {
    return str.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  }

  function blocksToHTML(blks) {
    return blks.map(b => {
      if (b.type === "section") {
        return `<h2 style="color:#1E293B;border-bottom:2px solid #E8950A;padding-bottom:6px;margin-top:18px;font-size:16px;">${renderBold(b.title)}</h2>` +
          blocksToHTML(b.children);
      }
      if (b.type === "table") {
        let html = '<div style="overflow-x:auto;margin:10px 0;"><table style="width:100%;border-collapse:collapse;font-size:13px;">';
        html += "<tr>" + b.headers.map(h => `<th style="background:#E8950A;color:#FFF;padding:8px 10px;text-align:left;font-size:12px;white-space:nowrap;">${renderBold(h)}</th>`).join("") + "</tr>";
        b.rows.forEach((row, ri) => {
          const bg = ri % 2 === 0 ? "#FFF" : "#F8FAFC";
          html += "<tr>" + row.map(c => {
            const isNum = /^\d/.test(c.trim());
            return `<td style="border:1px solid #E2E8F0;padding:6px 10px;background:${bg};${isNum ? "text-align:right;font-family:monospace;" : ""}">${renderBold(c)}</td>`;
          }).join("") + "</tr>";
        });
        html += "</table></div>";
        return html;
      }
      if (b.type === "collapsible") {
        return `<div style="margin:10px 0;border:1px solid #E2E8F0;border-radius:6px;padding:10px 14px;"><h3 style="color:#E8950A;font-size:14px;margin:0 0 8px 0;">${renderBold(b.summary)}</h3>` +
          blocksToHTML(b.children) + "</div>";
      }
      if (b.type === "line") {
        let style = "font-size:13px;line-height:1.6;margin:2px 0;";
        if (b.isAlert) style += "background:#FEF2F2;border-left:3px solid #DC2626;padding:4px 10px;color:#991B1B;border-radius:4px;";
        else if (b.isPositive) style += "background:#F0FDF4;border-left:3px solid #059669;padding:4px 10px;color:#065F46;border-radius:4px;";
        else if (b.isList) style += "padding-left:16px;";
        const prefix = b.isList ? '<span style="color:#E8950A;margin-right:6px;">\u203A</span>' : "";
        return `<div style="${style}">${prefix}${renderBold(b.text)}</div>`;
      }
      return "";
    }).join("\n");
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>PE\u00d1AS CERCADAS - ${queryTitle.substring(0, 60)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; margin: 40px; color: #1E293B; }
  @media print {
    body { margin: 20px; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
    h2 { page-break-after: avoid; }
  }
</style></head><body>
<div style="text-align:center;border-bottom:3px solid #E8950A;padding-bottom:16px;margin-bottom:20px;">
  <div style="font-size:26px;font-weight:bold;color:#1E293B;">PE\u00d1AS CERCADAS</div>
  <div style="font-size:13px;color:#64748B;">Ganader\u00eda Caprina Murciano-Granadina</div>
  <div style="font-size:12px;color:#94A3B8;margin-top:4px;">${fecha}</div>
</div>
<div style="background:#FEF9EE;border:1px solid #FDE68A;border-radius:8px;padding:10px 16px;margin-bottom:20px;">
  <div style="font-size:11px;color:#92400E;font-weight:600;">CONSULTA:</div>
  <div style="font-size:14px;color:#1E293B;">${queryTitle.length > 200 ? queryTitle.substring(0, 200) + "..." : queryTitle}</div>
</div>
${blocksToHTML(blocks)}
<div style="margin-top:30px;border-top:1px solid #E2E8F0;padding-top:10px;font-size:10px;color:#94A3B8;text-align:center;">
  Generado por PE\u00d1AS CERCADAS \u2014 Sistema de Gesti\u00f3n Ganadera Inteligente \u2014 ${fecha}
</div>
</body></html>`;
}

function downloadPDF(messageText, queryTitle) {
  const html = generatePrintableHTML(messageText, queryTitle);
  const w = window.open("", "_blank", "width=800,height=600");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.print(); }, 400);
}

function downloadExcel(messageText, queryTitle) {
  const tables = extractMarkdownTables(messageText);
  const fecha = new Date().toLocaleDateString("es-ES");
  let content, filename, mimeType;

  if (tables.length > 0) {
    let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>';
    html += `<h2>PE\u00d1AS CERCADAS</h2><p>${fecha} \u2014 ${queryTitle.substring(0, 100)}</p>`;
    tables.forEach((t, ti) => {
      if (ti > 0) html += "<br/>";
      html += '<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;">';
      html += "<tr>" + t.headers.map(h => `<th style="background:#E8950A;color:#FFF;font-weight:bold;">${h}</th>`).join("") + "</tr>";
      t.rows.forEach(row => {
        html += "<tr>" + row.map(c => {
          const isLeadingZero = /^0\d+$/.test(c.trim());
          const style = isLeadingZero ? ' style="mso-number-format:\'\\@\'"' : '';
          return `<td${style}>${c}</td>`;
        }).join("") + "</tr>";
      });
      html += "</table>";
    });
    html += "</body></html>";
    content = html;
    filename = `penas-cercadas-${fecha.replace(/\//g, "-")}.xls`;
    mimeType = "application/vnd.ms-excel";
  } else {
    // CSV fallback for text-only responses
    const blocks = parseMessageStructure(messageText);
    let csv = "\uFEFF"; // BOM for Excel UTF-8
    csv += `"PE\u00d1AS CERCADAS - ${fecha}"\n`;
    csv += `"Consulta: ${queryTitle.replace(/"/g, '""').substring(0, 200)}"\n\n`;
    csv += '"Seccion","Contenido"\n';
    let currentSection = "General";
    blocks.forEach(b => {
      if (b.type === "section") {
        currentSection = b.title.replace(/"/g, '""');
        b.children.forEach(c => {
          if (c.type === "line") csv += `"${currentSection}","${c.text.replace(/\*\*/g, "").replace(/"/g, '""')}"\n`;
        });
      } else if (b.type === "line") {
        csv += `"${currentSection}","${b.text.replace(/\*\*/g, "").replace(/"/g, '""')}"\n`;
      }
    });
    content = csv;
    filename = `penas-cercadas-${fecha.replace(/\//g, "-")}.csv`;
    mimeType = "text/csv;charset=utf-8";
  }

  const blob = new Blob([content], { type: mimeType });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

// ==========================================
// LOGIN PAGE
// ==========================================
function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true); setError("");
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (err) { setError("Email o contraseña incorrectos"); setLoading(false); }
    else onLogin(data.user);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FA", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Outfit', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap');`}</style>
      <div style={{ background: "#FFF", borderRadius: 24, padding: "48px 40px", width: 400, boxShadow: "0 8px 40px rgba(0,0,0,0.08)", textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: "linear-gradient(135deg, #E8950A, #CA8106)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, margin: "0 auto 20px" }}>🐐</div>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-.02em", marginBottom: 4 }}>
          <span style={{ color: "#E8950A" }}>PEÑAS</span> <span style={{ color: "#1E293B" }}>CERCADAS</span>
        </div>
        <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 32, letterSpacing: ".08em", textTransform: "uppercase" }}>Sistema de Gestión Ganadera</div>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email"
          style={{ width: "100%", padding: "14px 18px", borderRadius: 12, border: "2px solid #E2E8F0", fontSize: 14, color: "#1E293B", marginBottom: 12, outline: "none", background: "#F8FAFC", boxSizing: "border-box" }}
          onFocus={e => e.target.style.borderColor = "#E8950A"} onBlur={e => e.target.style.borderColor = "#E2E8F0"} />
        <input value={pass} onChange={e => setPass(e.target.value)} placeholder="Contraseña" type="password"
          onKeyDown={e => e.key === "Enter" && handleLogin()}
          style={{ width: "100%", padding: "14px 18px", borderRadius: 12, border: "2px solid #E2E8F0", fontSize: 14, color: "#1E293B", marginBottom: 20, outline: "none", background: "#F8FAFC", boxSizing: "border-box" }}
          onFocus={e => e.target.style.borderColor = "#E8950A"} onBlur={e => e.target.style.borderColor = "#E2E8F0"} />
        {error && <div style={{ color: "#DC2626", fontSize: 13, marginBottom: 14 }}>{error}</div>}
        <button onClick={handleLogin} disabled={loading}
          style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #E8950A, #CA8106)", color: "#FFF", fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </div>
    </div>
  );
}

// ==========================================
// DATA HOOK — Fetch real data from Supabase
// ==========================================
function useSupabaseData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        supabase.from("cabra").select("id, crotal, estado, raza, fecha_nacimiento, num_lactaciones, dias_en_leche, edad_meses, estado_ginecologico, lote_id, notas, lote:lote_id(nombre), riia, id_electronico"),
        supabase.from("lote").select("*"),
        supabase.from("parto").select("*, cabra:cabra_id(crotal), paridera:paridera_id(nombre)"),
        supabase.from("ecografia").select("*, ronda, cabra:cabra_id(crotal), paridera:paridera_id(nombre)"),
        supabase.from("tratamiento").select("*, cabra:cabra_id(crotal)"),
        supabase.from("cubricion").select("*, cabra:cabra_id(crotal), paridera:paridera_id(nombre), macho:macho_id(crotal)"),
        supabase.from("cria").select("*, madre:madre_id(crotal)"),
        supabase.from("regla").select("id, nombre, categoria, tipo, severidad"),
        supabase.from("paridera").select("*"),
        supabase.from("muerte").select("*, cabra:cabra_id(crotal)"),
        supabase.from("protocolo_veterinario").select("*"),
        supabase.from("evento_calendario").select("*").order("fecha", { ascending: true }),
        supabase.from("produccion_leche").select("*").order("fecha", { ascending: false }).limit(15000),
        supabase.from("resumen_diario").select("*").order("fecha", { ascending: false }).limit(30),
        supabase.from("anotacion_veterinaria").select("*, cabra:cabra_id(crotal)").order("fecha", { ascending: false }).limit(200),
        supabase.from("alerta_sanitaria").select("*").order("fecha", { ascending: false }).limit(200),
        supabase.from("chat_guardado").select("*").order("fecha", { ascending: false }).limit(50),
        supabase.from("anomalia_detectada").select("*").order("fecha", { ascending: false }).limit(300),
      ]);

      const safeGet = (idx) => results[idx].status === "fulfilled" ? (results[idx].value.data || []) : [];
      const failedTables = results.map((r, i) => r.status === "rejected" ? i : null).filter(i => i !== null);
      if (failedTables.length > 0) console.warn("Tablas que fallaron al cargar:", failedTables);

      // Process lotes with counts
      const cabras = safeGet(0);
      const lotes = safeGet(1).map(l => ({
        ...l,
        cabras: cabras.filter(c => c.lote_id === l.id).length
      }));

      setData({
        cabras,
        lotes,
        partos: safeGet(2),
        ecografias: safeGet(3),
        tratamientos: safeGet(4),
        cubriciones: safeGet(5),
        crias: safeGet(6),
        reglas: safeGet(7),
        parideras: safeGet(8),
        muertes: safeGet(9),
        protocolos: safeGet(10),
        eventos: safeGet(11),
        produccion: safeGet(12),
        resumenes: safeGet(13),
        anotaciones: safeGet(14),
        alertasSanitarias: safeGet(15),
        chatsGuardados: safeGet(16),
        anomalias: safeGet(17),
      });
    } catch (err) {
      console.error("Error fetching data:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  return { data, loading, refresh: fetchAll };
}

// ==========================================
// SHARED COMPONENTS (same as before)
// ==========================================
function Badge({ text, color }) {
  return <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: `${color}14`, color, fontWeight: 600 }}>{text}</span>;
}
function Card({ children, style = {} }) {
  return <div style={{ background: "#FFF", border: "1px solid #EEF2F6", borderRadius: 16, padding: 22, boxShadow: "0 1px 4px rgba(0,0,0,0.03)", ...style }}>{children}</div>;
}
function SectionTitle({ icon, text, color = "#1E293B" }) {
  return <div style={{ fontSize: 15, fontWeight: 700, color, marginBottom: 16, fontFamily: "'Outfit', sans-serif", display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 18 }}>{icon}</span>{text}</div>;
}
function KPI({ icon, label, value, sub, accent, onClick }) {
  return (
    <div style={{ background: "#FFF", border: "1px solid #EEF2F6", borderRadius: 14, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 5, position: "relative", overflow: "hidden", transition: "all .25s", cursor: onClick ? "pointer" : "default", boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}
      onClick={onClick}
      onMouseEnter={e => { e.currentTarget.style.borderColor = `${accent}50`; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 6px 20px ${accent}15`; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "#EEF2F6"; e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.03)"; }}>
      <div style={{ position: "absolute", top: -16, right: -12, fontSize: 64, opacity: 0.04 }}>{icon}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11.5, color: "#94A3B8", letterSpacing: ".04em", textTransform: "uppercase", fontWeight: 600 }}>{label}</span>
        {onClick && <span style={{ fontSize: 13, opacity: 0.3 }}>🔍</span>}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color: accent, fontFamily: "'Space Mono', monospace", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: "#94A3B8" }}>{sub}</div>}
    </div>
  );
}
function DataModal({ title, icon, accent, data, columns, onClose, searchPH, folders, onRowClick, subfolders }) {
  const [s, setS] = useState("");
  const [activeFolder, setActiveFolder] = useState(folders ? null : "__all__");
  const [activeSubfolder, setActiveSubfolder] = useState(null);

  const currentData = activeFolder === "__all__" ? data :
    folders ? data.filter(r => r.__folder === activeFolder && (!subfolders || !activeSubfolder || r.__subfolder === activeSubfolder)) : data;
  const f = currentData.filter(r => Object.values(r).some(v => String(v || "").toLowerCase().includes(s.toLowerCase())));

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.25)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn .2s" }} onClick={onClose}>
      <div style={{ background: "#FFF", borderRadius: 20, width: "90%", maxWidth: 1000, maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 50px rgba(0,0,0,0.12)", animation: "slideUp .3s" }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: "18px 26px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: `${accent}12`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>{icon}</div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: "#1E293B" }}>{title}</span>
                {activeFolder && activeFolder !== "__all__" && (
                  <span style={{ fontSize: 13, color: "#94A3B8" }}>{"\u203A"} {activeFolder}{activeSubfolder ? ` \u203A ${activeSubfolder}` : ""}</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "#94A3B8" }}>{activeFolder && (activeSubfolder || !subfolders) ? `${f.length} registros${onRowClick ? " \u00B7 Haz clic en una fila para ver historial" : ""}` : activeFolder && subfolders && !activeSubfolder ? `${subfolders.filter(sf => sf.parent === activeFolder).length} subcarpetas` : `${folders.length} carpetas`}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {activeFolder && folders && (
              <button onClick={() => { if (activeSubfolder) { setActiveSubfolder(null); setS(""); } else { setActiveFolder(null); setS(""); } }} style={{ padding: "7px 14px", borderRadius: 9, border: "1px solid #E2E8F0", background: "#F8FAFC", cursor: "pointer", fontSize: 12, color: "#64748B", fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                {"\u2190"} Volver
              </button>
            )}
            <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 9, border: "1px solid #E2E8F0", background: "#F8FAFC", cursor: "pointer", fontSize: 17, color: "#94A3B8", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          </div>
        </div>

        {/* Folder view */}
        {!activeFolder && folders && (
          <div style={{ flex: 1, overflow: "auto", padding: "20px 26px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
              {folders.map((folder, i) => (
                <div key={i} onClick={() => setActiveFolder(folder.name)}
                  style={{
                    background: "#FAFAFA", border: "1px solid #EEF2F6", borderRadius: 14,
                    padding: "20px", cursor: "pointer", transition: "all .2s",
                    display: "flex", alignItems: "center", gap: 14,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = `${accent}50`; e.currentTarget.style.background = `${accent}06`; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 4px 16px ${accent}12`; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#EEF2F6"; e.currentTarget.style.background = "#FAFAFA"; e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "none"; }}
                >
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: `${accent}10`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                    📁
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1E293B" }}>{folder.name}</div>
                    <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{folder.count} registros</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Subfolder view */}
        {activeFolder && subfolders && !activeSubfolder && (() => {
          const subs = subfolders.filter(sf => sf.parent === activeFolder);
          return subs.length > 0 ? (
            <div style={{ flex: 1, overflow: "auto", padding: "20px 26px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                {subs.map((sf, i) => (
                  <div key={i} onClick={() => setActiveSubfolder(sf.name)}
                    style={{
                      background: "#FAFAFA", border: "1px solid #EEF2F6", borderRadius: 14,
                      padding: "20px", cursor: "pointer", transition: "all .2s",
                      display: "flex", alignItems: "center", gap: 14,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = `${accent}50`; e.currentTarget.style.background = `${accent}06`; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 4px 16px ${accent}12`; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "#EEF2F6"; e.currentTarget.style.background = "#FAFAFA"; e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "none"; }}
                  >
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: `${accent}10`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                      {sf.icon || "\uD83D\uDCC2"}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#1E293B" }}>{sf.name}</div>
                      <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{sf.count} registros</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null;
        })()}

        {/* Data view */}
        {activeFolder && (!subfolders || activeSubfolder) && <>
          <div style={{ padding: "14px 26px", borderBottom: "1px solid #F1F5F9" }}>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", fontSize: 15 }}>🔍</span>
              <input value={s} onChange={e => setS(e.target.value)} placeholder={searchPH || "Buscar..."} style={{ width: "100%", padding: "11px 15px 11px 40px", borderRadius: 11, border: "2px solid #E2E8F0", fontSize: 13, color: "#1E293B", outline: "none", background: "#F8FAFC", boxSizing: "border-box" }} onFocus={e => e.target.style.borderColor = accent} onBlur={e => e.target.style.borderColor = "#E2E8F0"} />
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "0 26px 18px" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 3px", marginTop: 6 }}>
              <thead><tr>{columns.map((c, i) => <th key={i} style={{ textAlign: "left", padding: "9px 13px", fontSize: 10.5, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: ".06em", position: "sticky", top: 0, background: "#FFF" }}>{c.label}</th>)}</tr></thead>
              <tbody>{f.slice(0, 300).map((r, i) => <tr key={i} onClick={() => onRowClick && onRowClick(r)} style={{ cursor: onRowClick ? "pointer" : "default" }} onMouseEnter={e => e.currentTarget.style.background = onRowClick ? "#FEF9EE" : "#F8FAFC"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                {columns.map((c, j) => <td key={j} style={{ padding: "10px 13px", fontSize: 13, color: "#334155", fontFamily: c.mono ? "'Space Mono', monospace" : "'Outfit', sans-serif", fontWeight: c.bold ? 700 : 400, borderBottom: "1px solid #F5F7FA" }}>{c.render ? c.render(r[c.key], r) : (r[c.key] ?? "-")}</td>)}
              </tr>)}</tbody>
            </table>
            {f.length === 0 && <div style={{ padding: 32, textAlign: "center", color: "#94A3B8" }}>No se encontraron resultados</div>}
          </div>
        </>}
      </div>
    </div>
  );
}

// ==========================================
// CABRA HISTORIAL MODAL — Full life history
// ==========================================
function CabraHistorialModal({ crotal, data, onClose }) {
  const cabra = data.cabras.find(c => c.crotal === crotal);
  if (!cabra) return null;

  const prod = (data.produccion || []).filter(p => p.cabra_id === cabra.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const partos = data.partos.filter(p => p.cabra?.crotal === crotal);
  const ecos = data.ecografias.filter(e => e.cabra?.crotal === crotal);
  const trats = data.tratamientos.filter(t => t.cabra?.crotal === crotal);
  const cubs = data.cubriciones.filter(c => c.cabra?.crotal === crotal);
  const crias = data.crias.filter(c => c.madre?.crotal === crotal);
  const anots = (data.anotaciones || []).filter(a => a.cabra_id === cabra.id);

  const edad = cabra.fecha_nacimiento ? Math.floor((new Date() - new Date(cabra.fecha_nacimiento)) / (365.25 * 86400000)) : null;
  const vaciaCount = ecos.filter(e => e.resultado === 'vacia').length;

  // Build timeline from all events
  const timeline = [];
  partos.forEach(p => timeline.push({ fecha: p.fecha, tipo: "parto", icon: "🍼", text: `Parto ${p.tipo}${p.tipo === 'aborto' ? ' ⚠️' : ''} — ${p.num_crias} crías (${p.num_hembras || 0}H ${p.num_machos || 0}M)`, color: p.tipo === 'aborto' ? "#DC2626" : "#059669", sub: p.paridera?.nombre }));
  ecos.forEach(e => timeline.push({ fecha: e.fecha, tipo: "ecografia", icon: "🔬", text: `Ecografía: ${e.resultado}${e.resultado === 'vacia' ? ' ⚠️' : ''}`, color: e.resultado === 'vacia' ? "#DC2626" : "#7C3AED", sub: e.paridera?.nombre }));
  cubs.forEach(c => timeline.push({ fecha: c.fecha_entrada, tipo: "cubricion", icon: "🔗", text: `Cubrición: ${c.metodo || '?'}`, color: "#EA580C", sub: `${c.paridera?.nombre || ''} ${c.macho?.crotal ? '· Macho ' + c.macho.crotal : ''}` }));
  trats.forEach(t => timeline.push({ fecha: t.fecha, tipo: "tratamiento", icon: "💉", text: `${t.tipo}: ${t.producto || 'sin producto'}`, color: "#0891B2" }));
  anots.forEach(a => timeline.push({ fecha: a.fecha, tipo: "anotacion", icon: "📋", text: a.texto, color: a.tipo === 'urgente' ? "#DC2626" : "#0891B2", sub: a.autor }));
  timeline.sort((a, b) => b.fecha.localeCompare(a.fecha));

  // Alerts
  const alerts = [];
  if ((cabra.num_lactaciones || 0) >= 6) alerts.push({ icon: "🔴", text: `${cabra.num_lactaciones} lactaciones — animal viejo` });
  if (prod.length > 0 && prod[0].litros < 1.0 && (cabra.dias_en_leche || 0) > 60) alerts.push({ icon: "🔴", text: `Producción muy baja (${prod[0].litros}L) con ${cabra.dias_en_leche} DEL` });
  if (prod.length > 0 && prod[0].conductividad > 6.0) alerts.push({ icon: "🔴", text: `Conductividad alta: ${prod[0].conductividad.toFixed(2)} mS/cm` });
  if (vaciaCount >= 2) alerts.push({ icon: "🔴", text: `Doble vacía — ${vaciaCount} ecografías vacías` });
  if (partos.filter(p => p.tipo === 'aborto').length > 0) alerts.push({ icon: "⚠️", text: `Historial de aborto(s)` });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn .2s" }} onClick={onClose}>
      <div style={{ background: "#FFF", borderRadius: 20, width: "90%", maxWidth: 800, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 50px rgba(0,0,0,0.15)", animation: "slideUp .3s" }} onClick={e => e.stopPropagation()}>
        {/* Header — always visible */}
        <div style={{ padding: "22px 28px", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, background: "#FFF", borderRadius: "20px 20px 0 0" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", fontFamily: "'Space Mono', monospace" }}>{crotal}</div>
            <div style={{ fontSize: 13, color: "#94A3B8", marginTop: 2 }}>
              {cabra.lote?.nombre || "Sin lote"} · {cabra.estado} · {cabra.raza || "M-Granadina"}
              {edad !== null && ` · ${edad} años`}
              {cabra.riia && ` · RIIA: ${cabra.riia}`}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid #E2E8F0", background: "#F8FAFC", cursor: "pointer", fontSize: 18, color: "#94A3B8", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflow: "auto", padding: "20px 28px" }}>
          {/* Alerts */}
          {alerts.length > 0 && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: 14, marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#DC2626", marginBottom: 6 }}>⚡ Señales de alerta</div>
              {alerts.map((a, i) => <div key={i} style={{ fontSize: 12, color: "#7F1D1D", padding: "2px 0" }}>{a.icon} {a.text}</div>)}
            </div>
          )}

          {/* Quick stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
            <div style={{ textAlign: "center", padding: "12px 8px", background: "#F8FAFC", borderRadius: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#059669" }}>{prod.length > 0 ? `${prod[0].litros.toFixed(1)}L` : "-"}</div>
              <div style={{ fontSize: 10, color: "#94A3B8" }}>Último día</div>
            </div>
            <div style={{ textAlign: "center", padding: "12px 8px", background: "#F8FAFC", borderRadius: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#E8950A" }}>{cabra.num_lactaciones || 0}</div>
              <div style={{ fontSize: 10, color: "#94A3B8" }}>Lactaciones</div>
            </div>
            <div style={{ textAlign: "center", padding: "12px 8px", background: "#F8FAFC", borderRadius: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#7C3AED" }}>{cabra.dias_en_leche || 0}</div>
              <div style={{ fontSize: 10, color: "#94A3B8" }}>DEL</div>
            </div>
            <div style={{ textAlign: "center", padding: "12px 8px", background: "#F8FAFC", borderRadius: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: prod.length > 0 && prod[0].conductividad > 6.0 ? "#DC2626" : "#64748B" }}>{prod.length > 0 ? prod[0].conductividad?.toFixed(2) || "-" : "-"}</div>
              <div style={{ fontSize: 10, color: "#94A3B8" }}>Conductividad</div>
            </div>
            <div style={{ textAlign: "center", padding: "12px 8px", background: "#F8FAFC", borderRadius: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#0891B2" }}>{partos.length}</div>
              <div style={{ fontSize: 10, color: "#94A3B8" }}>Partos</div>
            </div>
          </div>

          {/* Intelligence Scores */}
          {(() => {
            // Score de salud: conductividad media + tratamientos recientes
            const condMedia = prod.length > 0 ? prod.slice(0, 10).reduce((s, p) => s + (p.conductividad || 0), 0) / Math.min(prod.length, 10) : 0;
            const tratRecientes = trats.filter(t => { const d = new Date(t.fecha); return (new Date() - d) < 90 * 86400000; }).length;
            const scoreSalud = Math.max(0, Math.min(100, 100 - (condMedia > 6.5 ? 40 : condMedia > 6.0 ? 20 : 0) - (tratRecientes * 10)));

            // Score reproductivo: tasa gestacion, intervalos, abortos
            const totalEcos = ecos.length;
            const gestantes = ecos.filter(e => e.resultado === "gestante" || e.resultado === "prenada").length;
            const tasaGest = totalEcos > 0 ? (gestantes / totalEcos * 100) : null;
            const abortos = partos.filter(p => p.tipo === "aborto").length;
            const scoreRepro = tasaGest !== null ? Math.max(0, Math.min(100, tasaGest - (abortos * 20) - (vaciaCount >= 2 ? 30 : 0))) : null;

            // Score economico: litros totales / dias produccion
            const litrosTotales = prod.reduce((s, p) => s + (p.litros || 0), 0);
            const diasProd = prod.length;
            const eficiencia = diasProd > 0 ? litrosTotales / diasProd : 0;
            const precioLeche = 1.31;
            const valorGenerado = litrosTotales * precioLeche;
            const scoreEconomico = Math.max(0, Math.min(100, eficiencia > 3.0 ? 95 : eficiencia > 2.5 ? 80 : eficiencia > 2.0 ? 65 : eficiencia > 1.5 ? 45 : eficiencia > 1.0 ? 25 : 10));

            const colorScore = (s) => s >= 70 ? "#059669" : s >= 40 ? "#E8950A" : "#DC2626";
            const labelScore = (s) => s >= 70 ? "Bueno" : s >= 40 ? "Vigilar" : "Critico";

            // Madre en el rebano?
            const madre = cabra.madre_id ? data.cabras.find(c => c.id === cabra.madre_id) : null;
            const madreProd = madre ? (data.produccion || []).filter(p => p.cabra_id === madre.id).slice(0, 5) : [];
            const madreLitros = madreProd.length > 0 ? madreProd.reduce((s, p) => s + (p.litros || 0), 0) / madreProd.length : null;

            return (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1E293B", marginBottom: 10 }}>🧠 Inteligencia</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 10 }}>
                  <div style={{ textAlign: "center", padding: "10px 8px", background: `${colorScore(scoreSalud)}10`, borderRadius: 10, border: `1px solid ${colorScore(scoreSalud)}30` }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: colorScore(scoreSalud), fontFamily: "'Space Mono', monospace" }}>{scoreSalud}</div>
                    <div style={{ fontSize: 10, color: "#64748B" }}>Salud</div>
                    <div style={{ fontSize: 9, color: colorScore(scoreSalud), fontWeight: 600 }}>{labelScore(scoreSalud)}</div>
                  </div>
                  <div style={{ textAlign: "center", padding: "10px 8px", background: scoreRepro !== null ? `${colorScore(scoreRepro)}10` : "#F8FAFC", borderRadius: 10, border: `1px solid ${scoreRepro !== null ? colorScore(scoreRepro) + "30" : "#E2E8F0"}` }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: scoreRepro !== null ? colorScore(scoreRepro) : "#94A3B8", fontFamily: "'Space Mono', monospace" }}>{scoreRepro !== null ? scoreRepro.toFixed(0) : "-"}</div>
                    <div style={{ fontSize: 10, color: "#64748B" }}>Reproductivo</div>
                    <div style={{ fontSize: 9, color: scoreRepro !== null ? colorScore(scoreRepro) : "#94A3B8", fontWeight: 600 }}>{scoreRepro !== null ? labelScore(scoreRepro) : "Sin datos"}</div>
                  </div>
                  <div style={{ textAlign: "center", padding: "10px 8px", background: `${colorScore(scoreEconomico)}10`, borderRadius: 10, border: `1px solid ${colorScore(scoreEconomico)}30` }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: colorScore(scoreEconomico), fontFamily: "'Space Mono', monospace" }}>{scoreEconomico}</div>
                    <div style={{ fontSize: 10, color: "#64748B" }}>Economico</div>
                    <div style={{ fontSize: 9, color: colorScore(scoreEconomico), fontWeight: 600 }}>{eficiencia.toFixed(1)}L/dia</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 11, color: "#64748B", background: "#F8FAFC", padding: "4px 10px", borderRadius: 8 }}>Valor generado: <strong style={{ color: "#059669" }}>{valorGenerado.toFixed(0)}\u20AC</strong> ({diasProd} dias)</div>
                  {crias.length > 0 && <div style={{ fontSize: 11, color: "#64748B", background: "#F8FAFC", padding: "4px 10px", borderRadius: 8 }}>Crias: <strong>{crias.length}</strong> ({crias.filter(c => c.sexo === "hembra").length}H)</div>}
                  {madre && <div style={{ fontSize: 11, color: "#7C3AED", background: "#F5F3FF", padding: "4px 10px", borderRadius: 8 }}>Madre: <strong>{madre.crotal}</strong>{madreLitros ? ` (${madreLitros.toFixed(1)}L/dia)` : ""}</div>}
                </div>
              </div>
            );
          })()}

          {/* Production history */}
          {prod.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1E293B", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>🥛 Producción ({prod.length} registros)</div>
              <div style={{ maxHeight: 180, overflow: "auto", borderRadius: 10, border: "1px solid #F1F5F9" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr style={{ background: "#F8FAFC" }}>
                    <th style={{ padding: "8px 12px", textAlign: "left", color: "#94A3B8", fontWeight: 600, fontSize: 10.5 }}>Fecha</th>
                    <th style={{ padding: "8px 12px", textAlign: "right", color: "#94A3B8", fontWeight: 600, fontSize: 10.5 }}>Litros</th>
                    <th style={{ padding: "8px 12px", textAlign: "right", color: "#94A3B8", fontWeight: 600, fontSize: 10.5 }}>Cond.</th>
                    <th style={{ padding: "8px 12px", textAlign: "right", color: "#94A3B8", fontWeight: 600, fontSize: 10.5 }}>Flujo</th>
                    <th style={{ padding: "8px 12px", textAlign: "right", color: "#94A3B8", fontWeight: 600, fontSize: 10.5 }}>DEL</th>
                  </tr></thead>
                  <tbody>{prod.map((p, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #F5F7FA" }}>
                      <td style={{ padding: "6px 12px", color: "#475569", fontFamily: "'Space Mono', monospace" }}>{p.fecha}</td>
                      <td style={{ padding: "6px 12px", textAlign: "right", fontWeight: 600, color: "#059669", fontFamily: "'Space Mono', monospace" }}>{p.litros?.toFixed(2)}</td>
                      <td style={{ padding: "6px 12px", textAlign: "right", color: (p.conductividad || 0) > 6.0 ? "#DC2626" : "#64748B", fontFamily: "'Space Mono', monospace" }}>{p.conductividad?.toFixed(2) || "-"}</td>
                      <td style={{ padding: "6px 12px", textAlign: "right", color: "#64748B", fontFamily: "'Space Mono', monospace" }}>{p.flujo?.toFixed(3) || "-"}</td>
                      <td style={{ padding: "6px 12px", textAlign: "right", color: "#64748B", fontFamily: "'Space Mono', monospace" }}>{p.dia_lactacion || "-"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1E293B", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>📜 Historial de vida ({timeline.length} eventos)</div>
          {timeline.length === 0 && <div style={{ color: "#94A3B8", fontSize: 12, padding: 10 }}>Sin eventos registrados aún.</div>}
          <div style={{ position: "relative", paddingLeft: 24 }}>
            {timeline.length > 0 && <div style={{ position: "absolute", left: 9, top: 4, bottom: 4, width: 2, background: "#E2E8F0" }} />}
            {timeline.map((ev, i) => (
              <div key={i} style={{ position: "relative", paddingBottom: 14 }}>
                <div style={{ position: "absolute", left: -20, top: 2, width: 18, height: 18, borderRadius: "50%", background: `${ev.color}15`, border: `2px solid ${ev.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9 }}>{ev.icon}</div>
                <div style={{ paddingLeft: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "#94A3B8", fontFamily: "'Space Mono', monospace", fontWeight: 600 }}>{ev.fecha}</span>
                    <span style={{ fontSize: 12.5, color: "#1E293B", fontWeight: 500 }}>{ev.text}</span>
                  </div>
                  {ev.sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{ev.sub}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
function ChatBox({ messages, input, setInput, onSend, examples, onExample, placeholder, height = 460, onSave, pageName }) {
  const [expanded, setExpanded] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState("");
  const msgsEnd = useRef(null);
  useEffect(() => { msgsEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleSave = async () => {
    if (!saveName.trim() || messages.length <= 1) return;
    if (onSave) await onSave(saveName, messages, pageName || "general");
    setSaveName("");
    setShowSaveDialog(false);
  };

  const chatContent = (
    <div style={{ background: "#FFF", border: expanded ? "none" : "1px solid #EEF2F6", borderRadius: expanded ? 0 : 16, display: "flex", flexDirection: "column", height: expanded ? "100%" : height, boxShadow: expanded ? "none" : "0 1px 4px rgba(0,0,0,0.03)" }}>
      <div style={{ padding: "13px 18px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#059669", animation: "pulse 2s infinite" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#1E293B" }}>Asistente Peñas Cercadas</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setExpanded(!expanded)} title={expanded ? "Reducir" : "Ampliar chat"} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer", color: "#64748B", fontWeight: 600 }}>
            {expanded ? "✕ Cerrar" : "⛶ Ampliar"}
          </button>
          {onSave && messages.length > 1 && (
            <button onClick={() => setShowSaveDialog(!showSaveDialog)} title="Guardar chat" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer", color: "#059669", fontWeight: 600 }}>
              💾 Guardar
            </button>
          )}
        </div>
      </div>
      {showSaveDialog && (
        <div style={{ padding: "10px 18px", borderBottom: "1px solid #F1F5F9", background: "#F0FDF4", display: "flex", gap: 8, alignItems: "center" }}>
          <input value={saveName} onChange={e => setSaveName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSave()} placeholder="Nombre del chat..." style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "2px solid #BBF7D0", fontSize: 12, outline: "none", background: "#FFF", boxSizing: "border-box" }} autoFocus />
          <button onClick={handleSave} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#059669", color: "#FFF", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Guardar</button>
          <button onClick={() => setShowSaveDialog(false)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#FFF", color: "#94A3B8", fontSize: 12, cursor: "pointer" }}>×</button>
        </div>
      )}
      <div style={{ flex: 1, overflow: "auto", padding: expanded ? "20px 28px" : 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: m.role === "user" ? "85%" : "95%" }}>
            <div style={{ background: m.role === "user" ? "#FEF9EE" : "#F8FAFC", border: `1px solid ${m.role === "user" ? "#FDE68A" : "#F1F5F9"}`, borderRadius: 12, padding: expanded ? "14px 20px" : "10px 15px", fontSize: expanded ? 14 : 13, color: "#334155", lineHeight: 1.5 }}>
              {m.role === "assistant" ? <FormattedMessage text={m.text} /> : m.text}
            </div>
            {m.role === "assistant" && (
              <div style={{ display: "flex", gap: 6, marginTop: 4, justifyContent: "flex-end" }}>
                <button onClick={() => downloadPDF(m.text, messages[i - 1]?.text || "Consulta")} title="Descargar PDF"
                  style={{ background: "transparent", border: "1px solid #E2E8F0", borderRadius: 6, padding: "3px 8px", fontSize: 10.5, color: "#94A3B8", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#E8950A"; e.currentTarget.style.color = "#E8950A"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.color = "#94A3B8"; }}>
                  {"📄"} PDF
                </button>
                <button onClick={() => downloadExcel(m.text, messages[i - 1]?.text || "Consulta")} title="Descargar Excel"
                  style={{ background: "transparent", border: "1px solid #E2E8F0", borderRadius: 6, padding: "3px 8px", fontSize: 10.5, color: "#94A3B8", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#059669"; e.currentTarget.style.color = "#059669"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.color = "#94A3B8"; }}>
                  {"📊"} Excel
                </button>
              </div>
            )}
          </div>
        ))}
        <div ref={msgsEnd} />
      </div>
      {examples && !expanded && <div style={{ padding: "0 16px 8px", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {examples.slice(0, 3).map((ex, i) => <div key={i} onClick={() => onExample(ex)} style={{ fontSize: 11, color: "#94A3B8", padding: "5px 10px", background: "#F8FAFC", border: "1px solid #F1F5F9", borderRadius: 7, cursor: "pointer" }} onMouseEnter={e => { e.currentTarget.style.color = "#E8950A"; e.currentTarget.style.borderColor = "#FDE68A"; }} onMouseLeave={e => { e.currentTarget.style.color = "#94A3B8"; e.currentTarget.style.borderColor = "#F1F5F9"; }}>{ex}</div>)}
      </div>}
      <div style={{ padding: expanded ? "14px 28px" : "11px 14px", borderTop: "1px solid #F1F5F9", display: "flex", gap: 9 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && onSend()} placeholder={placeholder}
          style={{ flex: 1, background: "#F8FAFC", border: "2px solid #E2E8F0", borderRadius: 10, padding: expanded ? "14px 18px" : "10px 15px", color: "#1E293B", fontSize: expanded ? 15 : 13, outline: "none", boxSizing: "border-box" }}
          onFocus={e => e.target.style.borderColor = "#E8950A"} onBlur={e => e.target.style.borderColor = "#E2E8F0"} />
        <button onClick={onSend} style={{ background: "linear-gradient(135deg, #E8950A, #CA8106)", border: "none", borderRadius: 10, padding: expanded ? "14px 24px" : "10px 18px", color: "#FFF", fontWeight: 700, fontSize: expanded ? 15 : 13, cursor: "pointer" }}>Enviar</button>
      </div>
    </div>
  );

  if (expanded) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn .2s" }}>
        <div style={{ width: "90%", maxWidth: 900, height: "85vh", borderRadius: 20, overflow: "hidden", boxShadow: "0 20px 50px rgba(0,0,0,0.15)", animation: "slideUp .3s" }}>
          {chatContent}
        </div>
      </div>
    );
  }
  return chatContent;
}
function CustomTooltip({ active, payload, label, formatter }) {
  if (!active || !payload) return null;
  return (
    <div style={{ background: "#FFF", border: "1px solid #E2E8F0", borderRadius: 10, padding: "10px 14px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)", fontSize: 12 }}>
      <div style={{ fontWeight: 700, color: "#1E293B", marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />
        <span style={{ color: "#64748B" }}>{p.name}:</span>
        <span style={{ fontWeight: 600, color: "#1E293B" }}>{formatter ? formatter(p.value) : p.value}</span>
      </div>)}
    </div>
  );
}

// ==========================================
// FORMATTED MESSAGE — Renders structured responses as cards
// ==========================================
function FormattedLine({ line }) {
  let l = line;
  const isList = l.startsWith('- ') || l.startsWith('• ');
  if (isList) l = l.replace(/^[-•]\s*/, '');
  const isAlert = l.includes('⚠️') || l.includes('🔴') || l.includes('ALERTA');
  const isPositive = l.includes('✅');
  
  const parts = [];
  const regex = /\*\*(.*?)\*\*/g;
  let lastIdx = 0; let match;
  while ((match = regex.exec(l)) !== null) {
    if (match.index > lastIdx) parts.push({ text: l.slice(lastIdx, match.index), bold: false });
    parts.push({ text: match[1], bold: true });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < l.length) parts.push({ text: l.slice(lastIdx), bold: false });
  if (parts.length === 0) parts.push({ text: l, bold: false });
  
  const bg = isAlert ? "#FEF2F2" : isPositive ? "#F0FDF4" : isList ? "#FAFAFA" : "transparent";
  const border = isAlert ? "1px solid #FECACA" : isPositive ? "1px solid #BBF7D0" : isList ? "1px solid #F1F5F9" : "none";
  
  return (
    <div style={{ fontSize: 12.5, color: isAlert ? "#991B1B" : "#334155", lineHeight: 1.5, padding: isList || isAlert || isPositive ? "5px 10px" : "2px 0", background: bg, border, borderRadius: 7, marginBottom: 2, display: "flex", alignItems: "flex-start", gap: 6 }}>
      {isList && <span style={{ color: "#E8950A", fontWeight: 700, flexShrink: 0 }}>›</span>}
      <span>{parts.map((p, i) => p.bold ? <span key={i} style={{ fontWeight: 700, color: "#1E293B", fontFamily: "'Space Mono', monospace", fontSize: 12 }}>{p.text}</span> : <span key={i}>{p.text}</span>)}</span>
    </div>
  );
}

function FormattedTable({ headers, rows }) {
  const isNumeric = (val) => /^\d/.test((val || "").trim());
  return (
    <div style={{ overflowX: "auto", margin: "8px 0", borderRadius: 10, border: "1px solid #E2E8F0" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{ background: "#E8950A", color: "#FFF", padding: "8px 10px", textAlign: "left", fontWeight: 700, fontSize: 11.5, whiteSpace: "nowrap", borderBottom: "2px solid #CA8106" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? "#FFF" : "#F8FAFC" }}
              onMouseEnter={e => e.currentTarget.style.background = "#FEF9EE"}
              onMouseLeave={e => e.currentTarget.style.background = ri % 2 === 0 ? "#FFF" : "#F8FAFC"}>
              {row.map((cell, ci) => (
                <td key={ci} style={{
                  padding: "6px 10px", borderBottom: "1px solid #F1F5F9",
                  fontFamily: isNumeric(cell) ? "'Space Mono', monospace" : "inherit",
                  textAlign: isNumeric(cell) ? "right" : "left",
                  fontSize: 12, color: "#334155", whiteSpace: "nowrap",
                }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CollapsibleSection({ summary, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: "1px solid #E2E8F0", borderRadius: 11, marginBottom: 8, overflow: "hidden" }}>
      <div onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", cursor: "pointer", background: "#FFF", userSelect: "none" }}
        onMouseEnter={e => e.currentTarget.style.background = "#FEF9EE"}
        onMouseLeave={e => e.currentTarget.style.background = "#FFF"}>
        <span style={{ fontSize: 11, color: "#E8950A", transition: "transform .2s", transform: open ? "rotate(90deg)" : "none" }}>{"▶"}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#E8950A" }}>{summary}</span>
        <span style={{ fontSize: 10, color: "#94A3B8", marginLeft: "auto" }}>{open ? "Cerrar" : "Ver mas"}</span>
      </div>
      {open && (
        <div style={{ padding: "8px 14px 14px", borderTop: "1px solid #F1F5F9", background: "#FAFAFA" }}>
          {children}
        </div>
      )}
    </div>
  );
}

function RenderBlocks({ blocks }) {
  return blocks.map((b, idx) => {
    if (b.type === "section") {
      return (
        <div key={idx} style={{ background: "#FFF", border: "1px solid #EEF2F6", borderRadius: 12, padding: "14px 18px", marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#E8950A", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #F1F5F9" }}>{b.title}</div>
          <RenderBlocks blocks={b.children} />
        </div>
      );
    }
    if (b.type === "table") {
      return <FormattedTable key={idx} headers={b.headers} rows={b.rows} />;
    }
    if (b.type === "collapsible") {
      return (
        <CollapsibleSection key={idx} summary={b.summary}>
          <RenderBlocks blocks={b.children} />
        </CollapsibleSection>
      );
    }
    if (b.type === "line") {
      return <FormattedLine key={idx} line={(b.isList ? "- " : "") + b.text} />;
    }
    return null;
  });
}

function FormattedMessage({ text }) {
  if (!text) return null;
  const blocks = parseMessageStructure(text);
  return <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><RenderBlocks blocks={blocks} /></div>;
}

// ==========================================
// LOADING SPINNER
// ==========================================
function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FA", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg, #E8950A, #CA8106)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, animation: "pulse 1.5s infinite" }}>🐐</div>
      <div style={{ fontSize: 14, color: "#94A3B8", fontFamily: "'Outfit', sans-serif" }}>Cargando datos de la granja...</div>
    </div>
  );
}

// ==========================================
// DASHBOARD PAGE — REAL DATA
// ==========================================
function DashboardPage({ data }) {
  const [modal, setModal] = useState(null);
  const [cabraHistorial, setCabraHistorial] = useState(null);
  const [searchCrotal, setSearchCrotal] = useState("");
  const LOTE_COLORS = { "Lote 1": "#E8950A", "Lote 2": "#DB2777", "Lote 3": "#7C3AED", "Lote 4": "#DC2626", "Lote 5": "#0891B2", "Lote 6": "#EA580C", "Lote 13": "#059669" };

  // Search suggestions
  const searchResults = searchCrotal.length >= 3 ? data.cabras.filter(c => c.crotal.includes(searchCrotal)).slice(0, 8) : [];

  const lotesSorted = [...data.lotes].filter(l => l.cabras > 0).sort((a, b) => b.cabras - a.cabras);
  const totalCabras = data.cabras.length;

  // Build modal data from real records
  const partosModal = data.partos.map(p => ({
    crotal: p.cabra?.crotal || "-",
    fecha: p.fecha ? new Date(p.fecha).toLocaleDateString("es-ES") : "-",
    crias: p.num_crias ?? 0,
    machos: p.num_machos ?? 0,
    hembras: p.num_hembras ?? 0,
    tipo: p.tipo || "normal",
    paridera: p.paridera?.nombre || "-",
  }));
  const ecosModal = data.ecografias.map(e => ({
    crotal: e.cabra?.crotal || "-",
    fecha: e.fecha ? new Date(e.fecha).toLocaleDateString("es-ES") : "-",
    resultado: e.resultado || "-",
    paridera: e.paridera?.nombre || "-",
    ronda: e.ronda || null,
  }));
  const tratsModal = data.tratamientos.map(t => ({
    crotal: t.cabra?.crotal || "-",
    fecha: t.fecha ? new Date(t.fecha).toLocaleDateString("es-ES") : "-",
    tipo: t.tipo || "-",
    producto: t.producto || "-",
  }));
  const cubsModal = data.cubriciones.map(c => ({
    crotal: c.cabra?.crotal || "-",
    fecha: c.fecha_entrada ? new Date(c.fecha_entrada).toLocaleDateString("es-ES") : "-",
    metodo: c.metodo || "-",
    macho: c.macho?.crotal || "-",
    paridera: c.paridera?.nombre || "-",
  }));
  const criasModal = data.crias.map(c => ({
    peseta: c.peseta ?? "-",
    madre: c.madre?.crotal || "-",
    fecha: c.fecha_nacimiento ? new Date(c.fecha_nacimiento).toLocaleDateString("es-ES") : "-",
    sexo: c.sexo || "-",
  }));

  // Alertas from real data
  const alertas = [];
  // Check double vacías
  const vaciasByC = {};
  data.ecografias.filter(e => e.resultado === "vacia").forEach(e => {
    const cr = e.cabra?.crotal;
    if (cr) vaciasByC[cr] = (vaciasByC[cr] || 0) + 1;
  });
  const dobleVacias = Object.entries(vaciasByC).filter(([, c]) => c >= 2).map(([cr]) => cr);
  if (dobleVacias.length > 0) alertas.push({ tipo: "alta", msg: `${dobleVacias.length} cabras vacías en dos o más ecografías`, detalle: dobleVacias.join(", "), icon: "🔴" });

  // More alerts based on farm knowledge
  const cabrasLote3 = data.cabras.filter(c => c.lote_id && data.lotes.find(l => l.id === c.lote_id && l.nombre.includes("Lote 3")));
  if (cabrasLote3.length > 0) alertas.push({ tipo: "alta", msg: `Paridera Mayo: vacunar enterotoxemias`, detalle: `${cabrasLote3.length} cabras del Lote 3 necesitan Polibascol antes del parto`, icon: "💉" });
  if (cabrasLote3.length > 0) alertas.push({ tipo: "alta", msg: `Paridera Mayo: desparasitación pendiente`, detalle: `${cabrasLote3.length} cabras del Lote 3 necesitan desparasitación`, icon: "💊" });

  const cabrasLote6 = data.cabras.filter(c => c.lote_id && data.lotes.find(l => l.id === c.lote_id && l.nombre.includes("Lote 6")));
  if (cabrasLote6.length > 0) alertas.push({ tipo: "media", msg: `${cabrasLote6.length} cabras en Lote 6 con machos`, detalle: "Machos entraron el 20 de febrero, retirar el 20 de marzo", icon: "📅" });

  if (data.crias.length > 0) alertas.push({ tipo: "media", msg: `${data.crias.length} crías: programar coccidiosis pre-destete`, detalle: "Crías de la paridera de febrero, destete próximamente", icon: "🐐" });

  const inseminaciones = data.cubriciones.filter(c => c.metodo === "inseminacion");
  if (inseminaciones.length > 0) alertas.push({ tipo: "info", msg: `${inseminaciones.length} inseminaciones pendientes de seguimiento`, detalle: "Verificar resultados en próxima ecografía", icon: "📋" });

  // Calendario from Supabase
  const calendario = (data.eventos || []).filter(e => !e.completado).slice(0, 8).map(e => ({
    fecha: new Date(e.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }),
    evento: e.titulo,
    tipo: e.tipo || "general",
    urgente: e.urgente || false,
  }));

  // Parideras info
  const parideraCards = data.parideras.map(p => {
    const now = new Date();
    const fechaPartos = p.fecha_partos_estimada ? new Date(p.fecha_partos_estimada) : null;
    const fechaMachos = new Date(p.fecha_entrada_machos);
    let progreso = 0;
    if (fechaPartos) {
      const total = fechaPartos - fechaMachos;
      const elapsed = now - fechaMachos;
      progreso = Math.min(100, Math.max(0, Math.round(elapsed / total * 100)));
    }
    const estado = progreso > 80 ? "En curso" : progreso > 40 ? "Gestación" : "Cubrición";
    const colors = ["#059669", "#7C3AED", "#EA580C", "#E8950A"];
    return {
      nombre: p.nombre,
      machos: fechaMachos.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }),
      partos: fechaPartos ? fechaPartos.toLocaleDateString("es-ES", { month: "short", year: "numeric" }) : "-",
      estado, progreso,
      color: colors[data.parideras.indexOf(p) % colors.length],
    };
  });

  const partoCols = [
    { key: "crotal", label: "Crotal", mono: true, bold: true },
    { key: "fecha", label: "Fecha", mono: true },
    { key: "crias", label: "Crías" },
    { key: "machos", label: "♂" },
    { key: "hembras", label: "♀" },
    { key: "tipo", label: "Tipo", render: v => <Badge text={v} color={v === "normal" ? "#059669" : v === "aborto" ? "#DC2626" : "#94A3B8"} /> },
    { key: "paridera", label: "Paridera" },
  ];
  const ecoCols = [
    { key: "crotal", label: "Crotal", mono: true, bold: true },
    { key: "fecha", label: "Fecha", mono: true },
    { key: "resultado", label: "Resultado", render: v => <Badge text={v} color={v === "vacia" ? "#DC2626" : "#059669"} /> },
    { key: "paridera", label: "Paridera" },
  ];
  const tratCols = [
    { key: "crotal", label: "Crotal", mono: true, bold: true },
    { key: "fecha", label: "Fecha", mono: true },
    { key: "tipo", label: "Tipo" },
    { key: "producto", label: "Producto" },
  ];
  const cubCols = [
    { key: "crotal", label: "Crotal", mono: true, bold: true },
    { key: "fecha", label: "Fecha", mono: true },
    { key: "metodo", label: "Método", render: v => <Badge text={v} color={v === "inseminacion" ? "#7C3AED" : "#EA580C"} /> },
    { key: "macho", label: "Macho" },
    { key: "paridera", label: "Paridera" },
  ];
  const criasCols = [
    { key: "peseta", label: "Peseta", mono: true, bold: true },
    { key: "madre", label: "Madre", mono: true },
    { key: "fecha", label: "Nacimiento", mono: true },
    { key: "sexo", label: "Sexo", render: v => <Badge text={v} color="#DB2777" /> },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <KPI icon="🐐" label="Cabras" value={totalCabras} sub={`en ${lotesSorted.length} lotes`} accent="#E8950A" onClick={() => setModal("cabras")} />
        <KPI icon="🍼" label="Partos" value={data.partos.length} sub="registrados" accent="#059669" onClick={() => setModal("partos")} />
        <KPI icon="🔬" label="Ecografías" value={data.ecografias.length} sub={`${dobleVacias.length} doble vacías`} accent="#7C3AED" onClick={() => setModal("eco")} />
        <KPI icon="💉" label="Tratamientos" value={data.tratamientos.length} sub="registrados" accent="#0891B2" onClick={() => setModal("trat")} />
        <KPI icon="🐣" label="Crías" value={data.crias.length} sub="hembras con peseta" accent="#DB2777" onClick={() => setModal("crias")} />
        <KPI icon="🔗" label="Cubriciones" value={data.cubriciones.length} sub={`${data.parideras.length} parideras`} accent="#EA580C" onClick={() => setModal("cubs")} />
      </div>

      {/* Quick goat search */}
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 400 }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16 }}>🔍</span>
            <input value={searchCrotal} onChange={e => setSearchCrotal(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && searchResults.length > 0) { setCabraHistorial(searchResults[0].crotal); setSearchCrotal(""); } }}
              placeholder="Buscar cabra por crotal..."
              style={{ width: "100%", padding: "12px 16px 12px 42px", borderRadius: 12, border: "2px solid #E2E8F0", fontSize: 14, color: "#1E293B", outline: "none", background: "#FFF", boxSizing: "border-box", fontFamily: "'Space Mono', monospace" }}
              onFocus={e => e.target.style.borderColor = "#E8950A"} onBlur={e => { setTimeout(() => setSearchCrotal(""), 200); e.target.style.borderColor = "#E2E8F0"; }} />
          </div>
          <div style={{ fontSize: 12, color: "#94A3B8" }}>Escribe mínimo 3 dígitos del crotal</div>
        </div>
        {searchResults.length > 0 && (
          <div style={{ position: "absolute", top: "100%", left: 0, width: 400, marginTop: 4, background: "#FFF", border: "1px solid #E2E8F0", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.1)", zIndex: 50, overflow: "hidden" }}>
            {searchResults.map((c, i) => (
              <div key={i} onClick={() => { setCabraHistorial(c.crotal); setSearchCrotal(""); }}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", cursor: "pointer", borderBottom: "1px solid #F5F7FA" }}
                onMouseEnter={e => e.currentTarget.style.background = "#FEF9EE"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "#1E293B" }}>{c.crotal}</span>
                  <span style={{ fontSize: 11, color: "#94A3B8", marginLeft: 8 }}>{c.lote?.nombre || "Sin lote"}</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Badge text={c.estado || "-"} color={c.estado === "lactacion" ? "#059669" : "#94A3B8"} />
                  {c.num_lactaciones && <span style={{ fontSize: 11, color: "#64748B" }}>L{c.num_lactaciones}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* === INTELIGENCIA DEL DIA === */}
      {(() => {
        const tendencias = analizarTendencias(data);
        const repro = calcularTimelineReproductivo(data);
        const trats = evaluarTratamientos(data);
        const ultimoResumen = (data.resumenes || []).find(r => r.hallazgos);

        const criticas = tendencias.tendencias.filter(t => t.severidad === "alta");
        const declives = tendencias.tendencias.filter(t => t.tipo === "DECLIVE");
        const respuestas = tendencias.tendencias.filter(t => t.tipo === "RESPUESTA_TRATAMIENTO");
        const secadosUrg = repro.alertas.filter(a => a.tipo === "SECADO_URGENTE");
        const ecosPend = repro.alertas.filter(a => a.tipo === "ECO_PENDIENTE");
        const partosNR = repro.alertas.filter(a => a.tipo === "PARTO_NO_REGISTRADO");
        const proxEventos = repro.proximos.slice(0, 5);
        const tratsBajos = Object.values(trats.porProducto).filter(p => p.tasaEfectividad < 50 && p.total >= 2);

        const hayAlgo = criticas.length > 0 || declives.length > 0 || secadosUrg.length > 0 || ecosPend.length > 0 || partosNR.length > 0 || proxEventos.length > 0 || respuestas.length > 0 || tratsBajos.length > 0;
        if (!hayAlgo && !tendencias.resumen) return null;

        return (
          <Card>
            <SectionTitle icon="🧠" text="Inteligencia del Día" color="#7C3AED" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>

              {/* Tendencia global */}
              {tendencias.resumen && (
                <div style={{ background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 11, padding: "13px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#7C3AED", marginBottom: 8 }}>{"📈"} Tendencia del Rebaño</div>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: tendencias.resumen.cambioGlobal >= 0 ? "#059669" : "#DC2626", fontFamily: "'Space Mono', monospace" }}>
                      {tendencias.resumen.cambioGlobal >= 0 ? "+" : ""}{tendencias.resumen.cambioGlobal.toFixed(1)}%
                    </div>
                    <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.5 }}>
                      Media: {tendencias.resumen.mediaHoy?.toFixed(2)}L/cabra<br />
                      vs {tendencias.resumen.mediaAyer?.toFixed(2)}L dia anterior
                    </div>
                  </div>
                </div>
              )}

              {/* Alertas criticas */}
              {criticas.length > 0 && (
                <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 11, padding: "13px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#DC2626", marginBottom: 8 }}>{"🔴"} Criticas ({criticas.length})</div>
                  {criticas.slice(0, 5).map((t, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#1E293B", padding: "4px 0", borderBottom: i < Math.min(criticas.length, 5) - 1 ? "1px solid #FEE2E2" : "none" }}>
                      <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, color: "#DC2626" }}>{t.crotal}</span>
                      <span style={{ marginLeft: 8, color: "#64748B" }}>{t.tipo === "MASTITIS_PROBABLE" ? "Posible mastitis" : t.tipo} — {t.detalle}</span>
                    </div>
                  ))}
                  {criticas.length > 5 && <div style={{ fontSize: 11, color: "#DC2626", marginTop: 4 }}>+ {criticas.length - 5} mas</div>}
                </div>
              )}

              {/* Reproductivo */}
              {(secadosUrg.length > 0 || ecosPend.length > 0 || partosNR.length > 0) && (
                <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 11, padding: "13px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#EA580C", marginBottom: 8 }}>{"🔄"} Reproductivo</div>
                  {secadosUrg.length > 0 && (
                    <div style={{ fontSize: 12, color: "#1E293B", padding: "4px 0" }}>
                      {"⚠️"} <strong>{secadosUrg.length}</strong> secados urgentes: {secadosUrg.slice(0, 4).map(a => a.crotal).join(", ")}{secadosUrg.length > 4 ? "..." : ""}
                    </div>
                  )}
                  {ecosPend.length > 0 && (
                    <div style={{ fontSize: 12, color: "#1E293B", padding: "4px 0" }}>
                      {"🔬"} <strong>{ecosPend.length}</strong> ecografias pendientes: {ecosPend.slice(0, 4).map(a => a.crotal).join(", ")}{ecosPend.length > 4 ? "..." : ""}
                    </div>
                  )}
                  {partosNR.length > 0 && (
                    <div style={{ fontSize: 12, color: "#DC2626", padding: "4px 0" }}>
                      {"🚨"} <strong>{partosNR.length}</strong> partos sin registrar: {partosNR.slice(0, 4).map(a => a.crotal).join(", ")}{partosNR.length > 4 ? "..." : ""}
                    </div>
                  )}
                </div>
              )}

              {/* Proximos eventos */}
              {proxEventos.length > 0 && (
                <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 11, padding: "13px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#2563EB", marginBottom: 8 }}>{"📅"} Proximos Eventos</div>
                  {proxEventos.map((e, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#1E293B", padding: "3px 0" }}>
                      <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 600 }}>{e.crotal}</span>
                      <span style={{ marginLeft: 8, color: "#64748B" }}>{e.detalle}</span>
                      <span style={{ marginLeft: 6, fontSize: 10, color: "#2563EB", fontWeight: 600 }}>en {e.diasHasta}d</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Declives + respuestas tratamiento */}
              {(declives.length > 0 || respuestas.length > 0) && (
                <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 11, padding: "13px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#059669", marginBottom: 8 }}>{"📊"} Tendencias Individuales</div>
                  {declives.length > 0 && (
                    <div style={{ fontSize: 12, color: "#1E293B", padding: "4px 0" }}>
                      {"📉"} <strong>{declives.length}</strong> cabras en declive: {declives.slice(0, 4).map(t => t.crotal).join(", ")}{declives.length > 4 ? "..." : ""}
                    </div>
                  )}
                  {respuestas.length > 0 && (
                    <div style={{ fontSize: 12, color: "#059669", padding: "4px 0" }}>
                      {"✅"} <strong>{respuestas.length}</strong> respondiendo a tratamiento: {respuestas.slice(0, 4).map(t => t.crotal).join(", ")}{respuestas.length > 4 ? "..." : ""}
                    </div>
                  )}
                </div>
              )}

              {/* Tratamientos con baja efectividad */}
              {tratsBajos.length > 0 && (
                <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 11, padding: "13px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#D97706", marginBottom: 8 }}>{"💊"} Tratamientos a Revisar</div>
                  {tratsBajos.map((t, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#1E293B", padding: "3px 0" }}>
                      <strong>{t.producto}</strong> ({t.tipo}): {t.tasaEfectividad}% efectividad ({t.efectivo}/{t.total} casos)
                    </div>
                  ))}
                </div>
              )}

              {/* Ultimo resumen guardado */}
              {ultimoResumen && (
                <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 11, padding: "13px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 8 }}>{"💾"} Ultima Importacion</div>
                  <div style={{ fontSize: 12, color: "#64748B" }}>
                    {new Date(ultimoResumen.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })} — {ultimoResumen.total_cabras} cabras, {ultimoResumen.litros_totales?.toFixed(0)}L totales
                  </div>
                  {ultimoResumen.tendencias_criticas > 0 && <div style={{ fontSize: 11, color: "#DC2626", marginTop: 3 }}>{ultimoResumen.tendencias_criticas} alertas criticas detectadas</div>}
                  {ultimoResumen.timeline_alertas > 0 && <div style={{ fontSize: 11, color: "#EA580C", marginTop: 2 }}>{ultimoResumen.timeline_alertas} alertas reproductivas</div>}
                </div>
              )}
            </div>
          </Card>
        );
      })()}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Card>
          <SectionTitle icon="⚠️" text="Alertas y Advertencias" color="#DC2626" />
          {alertas.length === 0 && <div style={{ color: "#94A3B8", fontSize: 13, padding: 16, textAlign: "center" }}>Sin alertas activas</div>}
          {alertas.map((a, i) => {
            const bg = { alta: "#FEF2F2", media: "#FFFBEB", info: "#EFF6FF" }[a.tipo] || "#F8FAFC";
            const bd = { alta: "#FECACA", media: "#FDE68A", info: "#BFDBFE" }[a.tipo] || "#E2E8F0";
            return <div key={i} style={{ background: bg, border: `1px solid ${bd}`, borderRadius: 11, padding: "11px 15px", display: "flex", gap: 11, marginBottom: 8 }}>
              <span style={{ fontSize: 19 }}>{a.icon}</span>
              <div><div style={{ fontSize: 13, fontWeight: 600, color: "#1E293B" }}>{a.msg}</div><div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{a.detalle}</div></div>
            </div>;
          })}
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Card>
            <SectionTitle icon="📅" text="Próximos Eventos" color="#0891B2" />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {calendario.map((c, i) => {
                const col = { cubricion: "#EA580C", sanidad: "#DC2626", ecografia: "#7C3AED", parto: "#059669", identificacion: "#0891B2" }[c.tipo];
                return <div key={i} style={{ display: "flex", gap: 11, alignItems: "center", padding: "9px 13px", borderRadius: 9, background: c.urgente ? "#FEF2F2" : "#FAFAFA", border: `1px solid ${c.urgente ? "#FECACA" : "#F1F5F9"}` }}>
                  <div style={{ width: 3.5, height: 30, borderRadius: 2, background: col, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}><div style={{ fontSize: 12.5, fontWeight: 600, color: "#1E293B" }}>{c.evento}</div><div style={{ fontSize: 11, color: "#94A3B8" }}>{c.fecha}</div></div>
                  {c.urgente && <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 5, background: "#FEE2E2", color: "#DC2626", fontWeight: 700 }}>URGENTE</span>}
                </div>;
              })}
            </div>
          </Card>
          <Card>
            <SectionTitle icon="📊" text={`Distribución por Lotes (${totalCabras} cabras)`} />
            {lotesSorted.map((l, i) => {
              const color = LOTE_COLORS[l.nombre] || "#64748B";
              return <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "7px 0" }}>
                <div style={{ width: 9, height: 9, borderRadius: "50%", background: color }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: "#475569" }}>{l.nombre}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color, fontFamily: "'Space Mono', monospace" }}>{l.cabras}</span>
                  </div>
                  <div style={{ height: 4.5, background: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 3, background: color, width: `${(l.cabras / totalCabras * 100)}%`, transition: "width 1s" }} />
                  </div>
                </div>
              </div>;
            })}
          </Card>
          <Card>
            <SectionTitle icon="📏" text={`Reglas Activas (${data.reglas.length})`} />
            {(() => {
              const cats = {};
              data.reglas.forEach(r => { cats[r.categoria] = (cats[r.categoria] || 0) + 1; });
              const catColors = { sanidad: "#DC2626", reproduccion: "#7C3AED", produccion: "#059669", identificacion: "#0891B2", muertes: "#94A3B8" };
              return Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([cat, count], i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #F8FAFC" }}>
                  <span style={{ fontSize: 12.5, color: "#475569", textTransform: "capitalize" }}>{cat}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: catColors[cat] || "#E8950A", fontFamily: "'Space Mono', monospace" }}>{count}</span>
                </div>
              ));
            })()}
          </Card>
        </div>
      </div>

      {parideraCards.length > 0 && <div>
        <SectionTitle icon="🗓️" text="Estado de Parideras" />
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(parideraCards.length, 3)}, 1fr)`, gap: 14 }}>
          {parideraCards.map((p, i) => <Card key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 11 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1E293B" }}>{p.nombre}</div>
              <Badge text={p.estado} color={p.color} />
            </div>
            <div style={{ display: "flex", gap: 14, marginBottom: 11, fontSize: 11.5, color: "#64748B" }}>
              <div>Machos: {p.machos}</div><div>Partos: {p.partos}</div>
            </div>
            <div style={{ height: 5, background: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 3, background: p.color, width: `${p.progreso}%`, transition: "width 2s" }} />
            </div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4, textAlign: "right" }}>{p.progreso}%</div>
          </Card>)}
        </div>
      </div>}

      {modal === "cabras" && (() => {
        const cabrasModal = data.cabras.map(c => {
          const lote = data.lotes.find(l => l.id === c.lote_id);
          const loteName = lote?.nombre || "Sin lote";
          const promedio = (c.dias_en_leche && c.dias_en_leche > 0) ? ((c.dias_en_leche * 2.2) / c.dias_en_leche).toFixed(1) : "-";
          return {
            crotal: c.crotal,
            edad: c.edad_meses ? `${Math.round(c.edad_meses)} m` : "-",
            lactaciones: c.num_lactaciones ?? "-",
            del: c.dias_en_leche ?? "-",
            estado: c.estado || "-",
            estado_gine: c.estado_ginecologico || "-",
            lote: loteName,
            __folder: loteName,
          };
        });
        const cabraFolders = [...new Set(cabrasModal.map(c => c.__folder))].map(f => ({
          name: f,
          count: cabrasModal.filter(c => c.__folder === f).length,
        })).sort((a, b) => b.count - a.count);
        const cabraCols = [
          { key: "crotal", label: "Crotal", mono: true, bold: true },
          { key: "edad", label: "Edad", mono: true },
          { key: "lactaciones", label: "Lact.", mono: true },
          { key: "del", label: "DEL", mono: true },
          { key: "estado", label: "Estado", render: v => <Badge text={v} color={v === "lactacion" ? "#059669" : v === "gestante" ? "#7C3AED" : v === "cubricion" ? "#EA580C" : v === "preparto" ? "#DB2777" : "#94A3B8"} /> },
          { key: "estado_gine", label: "Est. Gine." },
        ];
        return <DataModal title="Cabras" icon="🐐" accent="#E8950A" data={cabrasModal} columns={cabraCols} onClose={() => setModal(null)} searchPH="Buscar crotal, estado, lote..." folders={cabraFolders} onRowClick={(r) => setCabraHistorial(r.crotal)} />;
      })()}

      {cabraHistorial && <CabraHistorialModal crotal={cabraHistorial} data={data} onClose={() => setCabraHistorial(null)} />}

      {modal === "partos" && (() => {
        const d = partosModal.map(p => ({ ...p, __folder: p.paridera || "Sin paridera" }));
        const folders = [...new Set(d.map(r => r.__folder))].map(f => ({ name: f, count: d.filter(r => r.__folder === f).length }));
        return <DataModal title="Partos" icon="🍼" accent="#059669" data={d} columns={partoCols} onClose={() => setModal(null)} searchPH="Buscar crotal, tipo..." folders={folders} />;
      })()}

      {modal === "eco" && (() => {
        // Group ecografias by paridera + ronda (stored in DB, not inferred)
        const d = ecosModal.map(e => {
          const p = e.paridera || "Sin paridera";
          const rondaLabel = e.ronda === "segunda" ? "2a Ecograf\u00EDa (repaso)" : e.ronda === "primera" ? "1a Ecograf\u00EDa" : "Ecograf\u00EDas";
          return { ...e, __folder: p, __subfolder: rondaLabel };
        });
        const folders = [...new Set(d.map(r => r.__folder))].map(f => ({ name: f, count: d.filter(r => r.__folder === f).length }));
        // Build subfolders: for each paridera, show 1a and/or 2a ronda
        const subs = [];
        folders.forEach(f => {
          const rondas = [...new Set(d.filter(r => r.__folder === f.name).map(r => r.__subfolder))].sort();
          rondas.forEach(r => {
            subs.push({ parent: f.name, name: r, count: d.filter(x => x.__folder === f.name && x.__subfolder === r).length, icon: r.includes("1a") ? "\uD83D\uDD2C" : r.includes("2a") ? "\uD83D\uDD04" : "\uD83D\uDCC1" });
          });
        });
        const ecColsWithRonda = [
          { key: "crotal", label: "Crotal", mono: true, bold: true },
          { key: "fecha", label: "Fecha", mono: true },
          { key: "resultado", label: "Resultado", render: v => <Badge text={v} color={v === "vacia" ? "#DC2626" : v === "hidrometra" ? "#E8950A" : "#059669"} /> },
          { key: "paridera", label: "Paridera" },
        ];
        // Only use subfolders if there are multiple rondas in at least one paridera, or if ronda data exists
        const hasRondaData = d.some(e => e.ronda);
        return <DataModal title="Ecograf\u00EDas" icon="\uD83D\uDD2C" accent="#7C3AED" data={d} columns={ecColsWithRonda} onClose={() => setModal(null)} searchPH="Buscar crotal, resultado..." folders={folders} subfolders={hasRondaData ? subs : undefined} />;
      })()}

      {modal === "trat" && (() => {
        const d = tratsModal.map(t => ({ ...t, __folder: t.tipo || "Sin tipo" }));
        const folders = [...new Set(d.map(r => r.__folder))].map(f => ({ name: f, count: d.filter(r => r.__folder === f).length }));
        return <DataModal title="Tratamientos" icon="💉" accent="#0891B2" data={d} columns={tratCols} onClose={() => setModal(null)} searchPH="Buscar crotal, tipo..." folders={folders} />;
      })()}

      {modal === "cubs" && (() => {
        const d = cubsModal.map(c => ({ ...c, __folder: c.paridera || "Sin paridera" }));
        const folders = [...new Set(d.map(r => r.__folder))].map(f => ({ name: f, count: d.filter(r => r.__folder === f).length }));
        return <DataModal title="Cubriciones" icon="🔗" accent="#EA580C" data={d} columns={cubCols} onClose={() => setModal(null)} searchPH="Buscar crotal, método..." folders={folders} />;
      })()}

      {modal === "crias" && (() => {
        const d = criasModal.map(c => {
          const parto = data.partos.find(p => data.crias.find(cr => cr.madre?.crotal === c.madre && cr.peseta == c.peseta)?.parto_id === p.id);
          const parideraName = parto?.paridera?.nombre || "Paridera Febrero 2026";
          return { ...c, __folder: parideraName };
        });
        const folders = [...new Set(d.map(r => r.__folder))].map(f => ({ name: f, count: d.filter(r => r.__folder === f).length }));
        return <DataModal title="Crías Hembra" icon="🐣" accent="#DB2777" data={d} columns={criasCols} onClose={() => setModal(null)} searchPH="Buscar peseta, madre..." folders={folders} />;
      })()}
    </div>
  );
}

// ==========================================
// RENTABILIDAD (demo data - finance tables pending)
// ==========================================
const MONTHLY_FINANCE = [
  { mes: "Oct 25", ingresos: 38200, gastos: 22100, leche: 35800 },
  { mes: "Nov 25", ingresos: 36800, gastos: 21800, leche: 34500 },
  { mes: "Dic 25", ingresos: 33500, gastos: 23200, leche: 31200 },
  { mes: "Ene 26", ingresos: 31200, gastos: 24100, leche: 28900 },
  { mes: "Feb 26", ingresos: 35600, gastos: 23500, leche: 33100 },
  { mes: "Mar 26", ingresos: 39800, gastos: 22800, leche: 37200 },
];
const PRODUCTION_FORECAST = [
  { mes: "Mar 26", litros: 950, cabrasO: 420, ingresoEst: 37345 },
  { mes: "Abr", litros: 1020, cabrasO: 440, ingresoEst: 40086 },
  { mes: "May", litros: 1180, cabrasO: 490, ingresoEst: 46375 },
  { mes: "Jun", litros: 1280, cabrasO: 510, ingresoEst: 50323 },
  { mes: "Jul", litros: 1350, cabrasO: 530, ingresoEst: 53064 },
  { mes: "Ago", litros: 1250, cabrasO: 505, ingresoEst: 49125 },
  { mes: "Sep", litros: 1100, cabrasO: 460, ingresoEst: 43230 },
  { mes: "Oct", litros: 980, cabrasO: 410, ingresoEst: 38514 },
  { mes: "Nov", litros: 1050, cabrasO: 435, ingresoEst: 41266 },
  { mes: "Dic", litros: 1150, cabrasO: 470, ingresoEst: 45196 },
  { mes: "Ene 27", litros: 1220, cabrasO: 495, ingresoEst: 47946 },
  { mes: "Feb 27", litros: 1300, cabrasO: 520, ingresoEst: 51090 },
];

function RentabilidadPage({ data, saveChat }) {
  const [finMsg, setFinMsg] = useState("");
  const [finMsgs, setFinMsgs] = useState([{ role: "assistant", text: "Soy el asistente financiero. Puedo registrar gastos e ingresos y hacer previsiones. Dime qué necesitas." }]);
  const [tab, setTab] = useState("general");
  const examples = ["He pagado 3.200€ de pienso", "Vendidos 45 cabritos a 38€", "Previsión de ingresos 3 meses", "¿Cuánto cuesta producir un litro?"];
  const dataCtx = buildDataContext(data);
  const send = async () => {
    if (!finMsg.trim()) return;
    const userMsg = finMsg;
    setFinMsgs(p => [...p, { role: "user", text: userMsg }]); setFinMsg("");
    const response = await askClaude(userMsg, dataCtx, "finance");
    setFinMsgs(p => [...p, { role: "assistant", text: response }]);
  };
  const totalCabras = data.cabras.length;

  // Compute doble vacías for recommendations
  const vaciasByC = {};
  data.ecografias.filter(e => e.resultado === "vacia").forEach(e => {
    const cr = e.cabra?.crotal;
    if (cr) vaciasByC[cr] = (vaciasByC[cr] || 0) + 1;
  });
  const dobleVacias = Object.entries(vaciasByC).filter(([, c]) => c >= 2).map(([cr]) => cr);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
        <KPI icon="💰" label="Ingresos Mar" value="39.800€" sub="+11.8% vs feb" accent="#059669" />
        <KPI icon="📉" label="Gastos Mar" value="22.800€" sub="pienso+personal+vet" accent="#DC2626" />
        <KPI icon="✅" label="Balance" value="+17.000€" sub="beneficio neto" accent="#059669" />
        <KPI icon="🥛" label="Margen/L" value="0,58€" sub="ingreso - coste" accent="#E8950A" />
        <KPI icon="📊" label="Coste/L" value="0,73€" sub="gastos ÷ litros" accent="#7C3AED" />
        <KPI icon="🐐" label="Rent./Cabra" value={`${Math.round(17000 / totalCabras)}€`} sub={`÷ ${totalCabras} cabras`} accent="#0891B2" />
      </div>

      <div style={{ display: "flex", gap: 4, background: "#F1F5F9", borderRadius: 12, padding: 4, width: "fit-content" }}>
        {[{ id: "general", l: "📈 Rentabilidad" }, { id: "prevision", l: "🔮 Previsión 12M" }, { id: "reposicion", l: "🐣 Reposición" }].map(t =>
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "8px 18px", borderRadius: 9, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", background: tab === t.id ? "#FFF" : "transparent", color: tab === t.id ? "#E8950A" : "#64748B", boxShadow: tab === t.id ? "0 1px 4px rgba(0,0,0,0.06)" : "none" }}>{t.l}</button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {tab === "general" && <>
            <Card>
              <SectionTitle icon="💶" text="Ingresos vs Gastos — Últimos 6 Meses" />
              <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 12, color: "#78590A" }}>
                ⚠️ Datos de ejemplo. Cuando registres facturas reales desde el chat, estas gráficas se actualizarán automáticamente.
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={MONTHLY_FINANCE}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#94A3B8" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip formatter={v => `${v.toLocaleString("es-ES")}€`} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="ingresos" name="Ingresos" fill="#059669" radius={[6, 6, 0, 0]} barSize={30} />
                  <Bar dataKey="gastos" name="Gastos" fill="#F87171" radius={[6, 6, 0, 0]} barSize={30} />
                  <Line dataKey="leche" name="Leche" stroke="#E8950A" strokeWidth={2.5} dot={{ r: 4, fill: "#E8950A" }} />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
            <Card>
              <SectionTitle icon="🧾" text="Desglose Gastos — Marzo 2026" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                {[{ l: "Pienso", v: 12800, p: 56, c: "#E8950A", i: "🌾" }, { l: "Personal", v: 5200, p: 23, c: "#7C3AED", i: "👷" }, { l: "Veterinario", v: 1900, p: 8, c: "#DC2626", i: "🏥" }, { l: "Otros", v: 2900, p: 13, c: "#64748B", i: "📦" }].map((g, i) =>
                  <div key={i} style={{ background: "#FAFAFA", border: "1px solid #F1F5F9", borderRadius: 12, padding: 16, textAlign: "center" }}>
                    <div style={{ fontSize: 24, marginBottom: 6 }}>{g.i}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8" }}>{g.l}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: g.c, fontFamily: "'Space Mono', monospace" }}>{g.v.toLocaleString("es-ES")}€</div>
                    <div style={{ height: 4, background: "#F1F5F9", borderRadius: 2, marginTop: 8, overflow: "hidden" }}><div style={{ height: "100%", background: g.c, width: `${g.p}%`, borderRadius: 2 }} /></div>
                    <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 3 }}>{g.p}%</div>
                  </div>
                )}
              </div>
            </Card>
          </>}
          {tab === "prevision" && <Card>
            <SectionTitle icon="🔮" text="Previsión de Producción — 12 Meses" />
            <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
              <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "10px 16px", flex: 1 }}>
                <div style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>Pico estimado</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#059669", fontFamily: "'Space Mono', monospace" }}>1.350 L/día</div>
                <div style={{ fontSize: 11, color: "#64748B" }}>Julio 2026</div>
              </div>
              <div style={{ background: "#FEF9EE", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 16px", flex: 1 }}>
                <div style={{ fontSize: 11, color: "#E8950A", fontWeight: 600 }}>Ingresos est. 12m</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#E8950A", fontFamily: "'Space Mono', monospace" }}>543k€</div>
                <div style={{ fontSize: 11, color: "#64748B" }}>a 1,31€/litro</div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={PRODUCTION_FORECAST}>
                <defs>
                  <linearGradient id="gL" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#059669" stopOpacity={.15} /><stop offset="95%" stopColor="#059669" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94A3B8" }} />
                <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="litros" name="L/día" stroke="#059669" fill="url(#gL)" strokeWidth={2.5} dot={{ r: 4, fill: "#059669" }} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>}
          {tab === "reposicion" && <Card>
            <SectionTitle icon="🐣" text="Plan de Reposición" />
            <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 12, padding: 18, marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.7 }}>
                <b style={{ color: "#059669" }}>Proyección:</b> Con {data.crias.length} crías hembra registradas y un promedio de 2,6L/día en primera lactación, las chotas aportarán ~<b>{Math.round(data.crias.length * 2.6)} litros/día adicionales</b> cuando entren en producción (16 meses desde nacimiento).
              </div>
            </div>
            <div style={{ background: "#FEF9EE", border: "1px solid #FDE68A", borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.7 }}>
                <b style={{ color: "#E8950A" }}>Consejo:</b> Para mantener {totalCabras} cabras, necesitas reponer ~{Math.round(totalCabras * 0.09)} bajas/año. Con {data.crias.length} crías cubres reposición + posible crecimiento.
              </div>
            </div>
          </Card>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ChatBox messages={finMsgs} input={finMsg} setInput={setFinMsg} onSend={send} examples={examples} onExample={setFinMsg} placeholder="Registra gastos o pregunta..." height={520} onSave={saveChat} pageName="rentabilidad" />
          <Card style={{ background: "linear-gradient(135deg, #FEF9EE, #FFF7ED)", border: "1px solid #FDE68A" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#E8950A", marginBottom: 10 }}>💡 Recomendaciones</div>
            {["El pienso supone el 56% de gastos. Un 5% de ahorro = 640€/mes", `Las ${dobleVacias.length} doble vacías generan 0€ con coste de mantenimiento`, `Jul 2026 será el pico: preparar capacidad de ordeño`].map((c, i) =>
              <div key={i} style={{ fontSize: 12, color: "#78590A", lineHeight: 1.45, padding: "5px 0", borderBottom: i < 2 ? "1px solid #FDE68A40" : "none", display: "flex", gap: 7 }}>
                <span style={{ color: "#E8950A" }}>→</span>{c}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// IMPORTADOR & CONSULTAS & CONFIG
// ==========================================
function ImportadorPage({ data, refresh, saveChat }) {
  const [dO, setDO] = useState(false);
  const [m, setM] = useState("");
  const [ms, setMs] = useState([{ role: "assistant", text: "Sube un CSV o dime lo que has hecho y lo registro directamente en la base de datos.\n\n**Por chat puedo registrar:**\n• Vacunaciones por lote: \"He vacunado al Lote 3 de enterotoxemias\"\n• Desparasitaciones: \"He desparasitado el Lote 6 entero\"\n• Tratamientos individuales: \"He tratado la 057717 con antibiótico\"\n• Muertes: \"Se ha muerto la cabra 057600\"\n• Cambios de lote: \"Mueve la 056749 al Lote 4\"\n\n**Por CSV:** Producción FLM, Paridera, Tratamientos, Anotaciones" }]);
  const [ld, setLd] = useState(false);
  const [fileName, setFileName] = useState(null);
  const [fileData, setFileData] = useState(null);
  const [rawRows, setRawRows] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [csvType, setCsvType] = useState(null); // "produccion" | "anotaciones" | "paridera" | "tratamiento" | "inseminacion" | "ecografia" | null
  const [pendingAction, setPendingAction] = useState(null); // { type, description, execute }
  const [ecoOptions, setEcoOptions] = useState({ paridera_id: null, lote: null, ronda: null });
  const fileRef = useRef(null);
  const dataCtx = buildDataContext(data);

  // Helper: parse number handling both comma and dot decimals
  const parseNum = (val) => {
    if (val === null || val === undefined || val === "") return 0;
    const clean = String(val).trim().replace(",", ".");
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  };

  // Helper: normalize text for accent-agnostic comparison
  const normalizeText = (text) => {
    return (text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  };

  // Helper: read file with encoding detection (UTF-8 → Windows-1252 fallback)
  const readFileText = async (file) => {
    // Try UTF-8 first
    let text = await file.text();
    // Remove BOM if present
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    // Check for encoding corruption markers
    const hasCorruption = /\u00C3[\u0080-\u00BF]|\u00E2\u0080|\uFFFD/.test(text.substring(0, 500));
    if (hasCorruption) {
      // Re-read as Windows-1252
      const buffer = await file.arrayBuffer();
      const decoder = new TextDecoder("windows-1252");
      text = decoder.decode(buffer);
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    }
    return text;
  };

  const parseCSV = (text) => {
    const firstLine = text.split("\n")[0] || "";
    let delimiter = ";";
    if (firstLine.split(";").length < 3 && firstLine.split(",").length > 2) delimiter = ",";
    if (firstLine.split(";").length < 3 && firstLine.split("\t").length > 2) delimiter = "\t";
    const lines = text.split("\n").filter(l => l.trim());
    return lines.map(line => {
      const result = []; let current = ""; let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') inQ = !inQ;
        else if (ch === delimiter && !inQ) { result.push(current.trim()); current = ""; }
        else current += ch;
      }
      result.push(current.trim());
      return result;
    });
  };

  // Accent-agnostic detection of FLM production CSV
  const isProductionCSV = (header) => {
    const h = normalizeText(header.join(" "));
    return (h.includes("produccion diaria") || h.includes("litros totales")) || (h.includes("del") && h.includes("lactacion"));
  };

  // Build column map from header: maps normalized names → column index
  const buildColumnMap = (header) => {
    const map = {};
    const aliases = {
      "identificador del animal": "crotal",
      "identificador": "crotal",
      "animal": "crotal",
      "grupo": "grupo",
      "del": "del",
      "produccion diaria": "prod_diaria",
      "ultima produccion": "ultima_prod",
      "promedio 10 dias": "prom_10d",
      "promedio 10 d": "prom_10d",
      "lactacion": "lactacion",
      "litros totales": "litros_totales",
      "promedio total": "promedio_total",
      "media conductividad": "conductividad",
      "conductividad": "conductividad",
      "tiempo de ordeno": "tiempo_ordeno",
      "tiempo ordeno": "tiempo_ordeno",
      "flujo": "flujo",
    };
    header.forEach((col, idx) => {
      const norm = normalizeText(col);
      // Try exact match first
      if (aliases[norm]) { map[aliases[norm]] = idx; return; }
      // Try partial match
      for (const [pattern, key] of Object.entries(aliases)) {
        if (norm.includes(pattern) && !map[key]) { map[key] = idx; }
      }
    });
    return map;
  };

  const importProduction = async (rows) => {
    setImporting(true);
    setImportResult(null);
    const header = rows[0];
    const colMap = buildColumnMap(header);

    // Validate required columns exist
    const required = ["crotal", "prod_diaria"];
    const missing = required.filter(k => colMap[k] === undefined);
    if (missing.length > 0) {
      setMs(p => [...p, { role: "assistant", text: `🔴 Error: No se encontraron columnas obligatorias: ${missing.join(", ")}. Columnas detectadas: ${JSON.stringify(colMap, null, 2)}` }]);
      setImporting(false);
      return;
    }

    // Show diagnostic in chat
    const diagLines = Object.entries(colMap).map(([key, idx]) => `  ${key} → columna ${idx} ("${header[idx]}")`).join("\n");
    setMs(p => [...p, { role: "assistant", text: `🔍 Diagnóstico de columnas:\n${diagLines}\n\n⏳ Importando...` }]);

    const dataRows = rows.slice(1).filter(r => {
      const first = (r[colMap.crotal] || r[0] || "").trim();
      return first && first[0] >= '0' && first[0] <= '9' && !first.startsWith('Contar') && !first.startsWith('Suma');
    });

    // Extract date from filename (e.g. "INFORME APP DIARIO_2026-03-23 12_51_11.csv")
    // Fallback to today if not found
    const dateMatch = fileName ? fileName.match(/(\d{4}-\d{2}-\d{2})/) : null;
    const reportDate = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];
    const dateSource = dateMatch ? "del archivo" : "de hoy (no se encontró fecha en el nombre)";
    
    // Notify user which date is being used
    setMs(p => [...p, { role: "assistant", text: `📅 Fecha del informe: **${reportDate}** (extraída ${dateSource})` }]);
    
    let imported = 0, errors = 0, newCabras = 0, loteChanges = 0;
    let totalLitros = 0;
    const alertas = [];
    const errorList = [];

    // Extract lote number from first digits of grupo name
    const mapGrupo = (g) => {
      if (!g) return null;
      const match = g.match(/^(\d+)/);
      if (!match) return null;
      return `Lote ${match[1]}`;
    };

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      try {
        // Read values using column map (fallback to positional for safety)
        const crotal = (row[colMap.crotal ?? 0] || "").trim();
        if (!crotal) continue;
        const grupo = row[colMap.grupo ?? 1] || "";
        const del_dias = parseNum(row[colMap.del ?? 2]);
        const prod_diaria = parseNum(row[colMap.prod_diaria ?? 3]);
        const ultima_prod = parseNum(row[colMap.ultima_prod ?? 4]);
        const prom_10d = parseNum(row[colMap.prom_10d ?? 5]);
        const lactacion = parseInt(row[colMap.lactacion ?? 6]) || 0;
        const litros_totales = parseNum(row[colMap.litros_totales ?? 7]);
        const promedio_total = parseNum(row[colMap.promedio_total ?? 8]);
        const conductividad = parseNum(row[colMap.conductividad ?? 9]);
        const tiempo_ordeno = parseNum(row[colMap.tiempo_ordeno ?? 10]);
        const flujo_raw = row[colMap.flujo ?? 11];
        const flujo = flujo_raw ? parseNum(flujo_raw) : null;

        totalLitros += prod_diaria;

        // Find cabra in existing data
        let cabra = data.cabras.find(c => c.crotal === crotal);
        
        // If not found, DON'T create — skip and warn
        // New cabras should come through censo import, not FLM
        if (!cabra) {
          errorList.push(`${crotal}: no existe en el sistema (no se crea automáticamente — actualiza el censo si es nueva)`);
          continue;
        }

        // Check if lote changed
        const loteName = mapGrupo(grupo);
        if (loteName) {
          let newLote = data.lotes.find(l => l.nombre === loteName);
          if (!newLote) {
            const { data: created } = await supabase.from("lote").insert([{
              nombre: loteName, tipo: "alta_produccion", descripcion: grupo
            }]).select().single();
            if (created) {
              newLote = created;
              data.lotes.push({ ...created, cabras: 0 });
            }
          }
          if (newLote && cabra.lote_id !== newLote.id) {
            const loteOrigenId = cabra.lote_id;
            const { error: errU } = await supabase.from("cabra").update({ lote_id: newLote.id, dias_en_leche: del_dias, num_lactaciones: lactacion }).eq("id", cabra.id);
            if (errU) { errorList.push(`${crotal}: error actualizando lote — ${errU.message}`); }
            else {
              loteChanges++;
              await supabase.from("cambio_lote").insert([{ cabra_id: cabra.id, lote_origen_id: loteOrigenId, lote_destino_id: newLote.id, fecha: reportDate, motivo: "CSV produccion" }]);
            }
          } else {
            const { error: errU } = await supabase.from("cabra").update({ dias_en_leche: del_dias, num_lactaciones: lactacion }).eq("id", cabra.id);
            if (errU) { errorList.push(`${crotal}: error actualizando cabra — ${errU.message}`); }
          }
        }

        // Insert production record (upsert to avoid duplicates)
        const { error: errP } = await supabase.from("produccion_leche").upsert([{
          cabra_id: cabra.id, fecha: reportDate, litros: prod_diaria,
          dia_lactacion: del_dias, media_10d: prom_10d,
          litros_totales_lactacion: litros_totales, media_total: promedio_total,
          lactacion_num: lactacion, lote_nombre: grupo,
          ultima_produccion: ultima_prod, conductividad,
          tiempo_ordeno, flujo, promedio_10d: prom_10d, promedio_total,
        }], { onConflict: "cabra_id,fecha" });
        
        if (errP) { errors++; errorList.push(`${crotal}: ${errP.message}`); }
        else imported++;

        // Check alerts
        if (conductividad > 6.0) alertas.push({ tipo: "alta", msg: `🔴 ${crotal}: conductividad ${conductividad.toFixed(2)} mS/cm — posible mastitis` });
        if (prom_10d > 0 && prod_diaria < prom_10d * 0.7) alertas.push({ tipo: "media", msg: `⚠️ ${crotal}: producción ${prod_diaria.toFixed(1)}L (prom10d: ${prom_10d.toFixed(1)}L) — caída del ${((1 - prod_diaria / prom_10d) * 100).toFixed(0)}%` });
        if (flujo !== null && flujo < 0.1) alertas.push({ tipo: "media", msg: `⚠️ ${crotal}: flujo ${flujo.toFixed(3)} L/min — muy bajo` });
        if (tiempo_ordeno > 14) alertas.push({ tipo: "baja", msg: `ℹ️ ${crotal}: tiempo ordeño ${tiempo_ordeno.toFixed(1)} min — excesivo` });

      } catch (err) {
        errors++;
        errorList.push(`${row[colMap.crotal ?? 0] || "???"}: ${err.message}`);
      }
    }

    // Create daily summary
    // === ANALISIS DIARIO AUTOMATICO POST-IMPORTACION ===
    // Refrescar datos antes del analisis para tener los nuevos registros
    const freshData = { ...data };
    // Ejecutar motores de inteligencia
    const analisisTendencias = analizarTendencias(freshData);
    const analisisTratamientos = evaluarTratamientos(freshData);
    const analisisRepro = calcularTimelineReproductivo(freshData);

    const hallazgos = {
      tendencias: analisisTendencias.tendencias.slice(0, 20),
      resumenTendencias: analisisTendencias.resumen,
      tratamientosEfectividad: Object.values(analisisTratamientos.porProducto),
      alertasReproductivas: analisisRepro.alertas.slice(0, 20),
      proximosEventos: analisisRepro.proximos.slice(0, 20),
      timestamp: new Date().toISOString(),
    };

    const tendCriticas = analisisTendencias.tendencias.filter(t => t.severidad === "alta").length;
    const reproAlertas = analisisRepro.alertas.length;

    await supabase.from("resumen_diario").upsert([{
      fecha: reportDate, total_cabras: dataRows.length,
      litros_totales: Math.round(totalLitros * 100) / 100,
      media_litros: Math.round(totalLitros / dataRows.length * 1000) / 1000,
      cabras_alta_conductividad: alertas.filter(a => a.msg.includes("conductividad")).length,
      archivo_origen: fileName,
      hallazgos,
      tendencias_criticas: tendCriticas,
      timeline_alertas: reproAlertas,
      anomalias_nuevas: analisisTendencias.tendencias.length,
    }], { onConflict: "fecha" });

    setImportResult({
      imported, errors, newCabras, loteChanges, totalLitros, alertas, errorList, total: dataRows.length,
      // Inteligencia
      hallazgos,
      tendenciasCriticas: tendCriticas,
      reproAlertas,
      tendenciasTotal: analisisTendencias.tendencias.length,
      proximosEventos: analisisRepro.proximos.length,
    });
    await supabase.from("importacion").insert([{ nombre_archivo: fileName || "produccion.csv", tipo: "produccion", registros_procesados: imported, registros_con_error: errors, errores: errorList.length > 0 ? errorList.slice(0, 50) : null }]);
    setImporting(false);
    refresh();

    // Add result to chat — ahora con inteligencia
    let chatMsg = `✅ Importación completada:\n• ${imported}/${dataRows.length} registros de producción importados\n• ${totalLitros.toFixed(1)} litros totales hoy\n• ${loteChanges} cambios de lote detectados`;
    if (newCabras > 0) chatMsg += `\n• ${newCabras} cabras nuevas creadas`;
    if (errors > 0) chatMsg += `\n• 🔴 ${errors} errores:\n${errorList.slice(0, 10).map(e => `  - ${e}`).join("\n")}`;
    if (alertas.length > 0) chatMsg += `\n\n🚨 ALERTAS (${alertas.length}):\n${alertas.slice(0, 10).map(a => a.msg).join("\n")}`;

    // Resumen de inteligencia automatica
    chatMsg += `\n\n🧠 **ANÁLISIS AUTOMÁTICO:**`;
    if (analisisTendencias.resumen) {
      const r = analisisTendencias.resumen;
      chatMsg += `\n📈 Producción: ${r.cambioGlobal >= 0 ? '+' : ''}${r.cambioGlobal.toFixed(1)}% vs día anterior`;
      if (r.cabrasEnDeclive > 0) chatMsg += `\n⚠️ ${r.cabrasEnDeclive} cabras en declive`;
      if (r.mastitisProbable > 0) chatMsg += `\n🔴 ${r.mastitisProbable} posibles mastitis (caída + conductividad alta)`;
      if (r.respuestasTratamiento > 0) chatMsg += `\n✅ ${r.respuestasTratamiento} cabras respondiendo bien a tratamiento`;
    }
    if (analisisRepro.alertas.length > 0) {
      chatMsg += `\n🔄 ${analisisRepro.alertas.length} alertas reproductivas`;
      const secados = analisisRepro.alertas.filter(a => a.tipo === "SECADO_URGENTE");
      const ecosPend = analisisRepro.alertas.filter(a => a.tipo === "ECO_PENDIENTE");
      if (secados.length > 0) chatMsg += ` (${secados.length} secados urgentes)`;
      if (ecosPend.length > 0) chatMsg += ` (${ecosPend.length} ecos pendientes)`;
    }
    if (analisisRepro.proximos.length > 0) {
      chatMsg += `\n📅 ${analisisRepro.proximos.length} eventos próximos`;
    }
    setMs(p => [...p, { role: "assistant", text: chatMsg }]);
  };

  // Import veterinary annotations (2 columns: Crotal + Anotación)
  const importAnotaciones = async (rows) => {
    setImporting(true);
    setImportResult(null);
    const header = rows[0];
    // Detect which column is crotal and which is text
    const h0 = normalizeText(header[0] || "");
    const h1 = normalizeText(header[1] || "");
    const crotalCol = (h0.includes("crotal") || h0.includes("identificador") || h0.includes("animal") || h0.includes("id")) ? 0 : 1;
    const textoCol = crotalCol === 0 ? 1 : 0;

    setMs(p => [...p, { role: "assistant", text: `📋 Importando anotaciones...\nColumna crotal: "${header[crotalCol]}"\nColumna texto: "${header[textoCol]}"` }]);

    const dataRows = rows.slice(1).filter(r => r[crotalCol]?.trim() && r[textoCol]?.trim());
    const today = new Date().toISOString().split("T")[0];
    let imported = 0, errors = 0;
    const errorList = [];

    for (const row of dataRows) {
      try {
        const crotal = row[crotalCol].trim();
        const texto = row[textoCol].trim();
        if (!texto) continue;

        // Find cabra
        const cabra = data.cabras.find(c => c.crotal === crotal);

        const { error } = await supabase.from("anotacion_veterinaria").insert([{
          cabra_id: cabra?.id || null,
          fecha: today,
          texto: texto,
          tipo: cabra ? "individual" : "rebaño",
          autor: "Veterinario (CSV)",
        }]);

        if (error) { errors++; errorList.push(`${crotal}: ${error.message}`); }
        else imported++;
      } catch (err) {
        errors++;
        errorList.push(`${row[crotalCol]}: ${err.message}`);
      }
    }

    setImportResult({ imported, errors, errorList, total: dataRows.length, tipo: "anotaciones" });
    await supabase.from("importacion").insert([{ nombre_archivo: fileName || "anotaciones.csv", tipo: "anotaciones", registros_procesados: imported, registros_con_error: errors, errores: errorList.length > 0 ? errorList.slice(0, 50) : null }]);
    setImporting(false);
    refresh();

    let chatMsg = `✅ Anotaciones importadas:\n• ${imported}/${dataRows.length} anotaciones guardadas`;
    if (errors > 0) chatMsg += `\n• 🔴 ${errors} errores:\n${errorList.slice(0, 5).map(e => `  - ${e}`).join("\n")}`;
    const sinCabra = dataRows.filter(r => !data.cabras.find(c => c.crotal === r[crotalCol].trim())).length;
    if (sinCabra > 0) chatMsg += `\n• ⚠️ ${sinCabra} crotales no encontrados en la base de datos (se guardaron como anotación general)`;
    setMs(p => [...p, { role: "assistant", text: chatMsg }]);
  };

  // Import Paridera CSV — Format: FECHA;CROTAL;CABRITOS;MACHOS;HEMBRAS;PESETA;OBSERVACIONES
  const importParidera = async (rows) => {
    setImporting(true);
    setImportResult(null);
    
    // Find header row
    const headerIdx = rows.findIndex(r => normalizeText(r.join(" ")).includes("crotal") || normalizeText(r.join(" ")).includes("fecha"));
    const dataRows = headerIdx >= 0 ? rows.slice(headerIdx + 1) : rows.filter(r => r[1] && /\d{5,6}/.test(r[1].trim()));
    
    setMs(p => [...p, { role: "assistant", text: `📋 Importando paridera...\n${dataRows.length} filas detectadas` }]);

    // Find or create paridera
    const parideraName = fileName ? fileName.replace(/\.csv$/i, "").replace(/_/g, " ").trim() : "Paridera importada";
    let paridera = data.parideras.find(p => normalizeText(p.nombre).includes(normalizeText(parideraName.split(" ")[1] || parideraName)));
    if (!paridera) {
      const { data: created } = await supabase.from("paridera").insert([{ nombre: parideraName }]).select().single();
      paridera = created;
    }

    let partos = 0, abortos = 0, vacias = 0, crias = 0, errors = 0, skipped = 0;
    const errorList = [];

    for (const row of dataRows) {
      try {
        const fechaRaw = (row[0] || "").trim();
        const crotal = (row[1] || "").trim();
        if (!crotal || !/\d{5,6}/.test(crotal)) continue;
        
        const cabritos = parseInt(row[2]) || 0;
        const machos = parseInt(row[3]) || 0;
        const hembras = parseInt(row[4]) || 0;
        const peseta = (row[5] || "").trim();
        const obs = (row[6] || "").trim().toLowerCase();

        const cabra = data.cabras.find(c => c.crotal === crotal);
        if (!cabra) { errorList.push(`${crotal}: no existe en el sistema`); errors++; continue; }

        // Parse date (format: "DD MM YY" with variable spacing)
        let fecha = null;
        if (fechaRaw) {
          const parts = fechaRaw.trim().split(/\s+/);
          if (parts.length >= 3) {
            const d = parseInt(parts[0]);
            const mo = parseInt(parts[1]);
            let y = parseInt(parts[2]);
            if (y < 100) y += 2000;
            if (d && mo && y) fecha = `${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
          }
        }

        // Determine type
        let tipo = "normal";
        if (obs.includes("aborto") || obs.includes("prematuro")) tipo = "aborto";
        else if (obs.includes("vacia")) tipo = "vacia";

        if (tipo === "vacia") {
          // Update cabra estado_ginecologico
          await supabase.from("cabra").update({ estado_ginecologico: "vacia" }).eq("id", cabra.id);
          vacias++;
          continue;
        }

        // Check for duplicate parto (same cabra + same paridera)
        const existing = data.partos.find(p => p.cabra?.crotal === crotal && p.paridera_id === paridera?.id);
        if (existing) { skipped++; continue; }

        // Insert parto
        const { error: errP } = await supabase.from("parto").insert([{
          cabra_id: cabra.id, paridera_id: paridera?.id, fecha,
          tipo, num_crias: cabritos, num_machos: machos, num_hembras: hembras,
          observaciones: obs,
        }]);
        if (errP) { errors++; errorList.push(`${crotal}: ${errP.message}`); continue; }
        
        if (tipo === "aborto") abortos++;
        else partos++;

        // Insert crías hembra with peseta
        if (hembras > 0 && peseta && peseta !== "0") {
          const pesetas = peseta.split(/\s+/).filter(p => p && p !== "0");
          for (const pes of pesetas) {
            await supabase.from("cria").insert([{
              madre_id: cabra.id, peseta: pes.trim(), sexo: "hembra",
              fecha_nacimiento: fecha, paridera_id: paridera?.id,
            }]);
            crias++;
          }
        }
      } catch (err) {
        errors++;
        errorList.push(`${row[1]}: ${err.message}`);
      }
    }

    setImportResult({ imported: partos + abortos, errors, errorList, total: dataRows.length, tipo: "paridera" });
    await supabase.from("importacion").insert([{ nombre_archivo: fileName || "paridera.csv", tipo: "paridera", registros_procesados: partos + abortos, registros_con_error: errors, errores: errorList.length > 0 ? errorList.slice(0, 50) : null }]);
    setImporting(false);
    refresh();

    let chatMsg = `✅ Paridera importada:\n• ${partos} partos normales\n• ${abortos} abortos\n• ${vacias} vacías\n• ${crias} crías hembra registradas`;
    if (skipped > 0) chatMsg += `\n• ⏭️ ${skipped} ya existían (no duplicados)`;
    if (errors > 0) chatMsg += `\n• 🔴 ${errors} errores:\n${errorList.slice(0, 5).map(e => `  - ${e}`).join("\n")}`;
    setMs(p => [...p, { role: "assistant", text: chatMsg }]);
  };

  // Import Tratamiento CSV — Format: CROTAL;TIPO;PRODUCTO;FECHA;OBSERVACIONES (flexible)
  const importTratamiento = async (rows) => {
    setImporting(true);
    setImportResult(null);

    const header = rows[0];
    const hNorm = header.map(h => normalizeText(h));
    
    // Find columns
    const crotalCol = hNorm.findIndex(h => h.includes("crotal") || h.includes("animal"));
    const tipoCol = hNorm.findIndex(h => h.includes("tipo") || h.includes("tratamiento"));
    const productoCol = hNorm.findIndex(h => h.includes("producto") || h.includes("medicamento") || h.includes("vacuna"));
    const fechaCol = hNorm.findIndex(h => h.includes("fecha"));
    const notasCol = hNorm.findIndex(h => h.includes("nota") || h.includes("observ"));

    if (crotalCol === -1) {
      setMs(p => [...p, { role: "assistant", text: `🔴 No se encontró columna de crotal en el CSV. Columnas: ${header.join(", ")}` }]);
      setImporting(false);
      return;
    }

    const dataRows = rows.slice(1).filter(r => r[crotalCol]?.trim());
    const today = new Date().toISOString().split("T")[0];
    let imported = 0, errors = 0;
    const errorList = [];

    for (const row of dataRows) {
      try {
        const crotal = row[crotalCol].trim();
        const cabra = data.cabras.find(c => c.crotal === crotal);
        if (!cabra) { errorList.push(`${crotal}: no existe`); errors++; continue; }

        const tipo = tipoCol >= 0 ? row[tipoCol]?.trim() || "general" : "general";
        const producto = productoCol >= 0 ? row[productoCol]?.trim() || "" : "";
        const fecha = fechaCol >= 0 ? row[fechaCol]?.trim() || today : today;
        const notas = notasCol >= 0 ? row[notasCol]?.trim() || "" : "";

        const { error } = await supabase.from("tratamiento").insert([{
          cabra_id: cabra.id, fecha, tipo, producto, notas: notas || "CSV import",
        }]);
        if (error) { errors++; errorList.push(`${crotal}: ${error.message}`); }
        else imported++;
      } catch (err) {
        errors++;
      }
    }

    setImportResult({ imported, errors, errorList, total: dataRows.length, tipo: "tratamiento" });
    await supabase.from("importacion").insert([{ nombre_archivo: fileName || "tratamientos.csv", tipo: "tratamiento", registros_procesados: imported, registros_con_error: errors, errores: errorList.length > 0 ? errorList.slice(0, 50) : null }]);
    setImporting(false);
    refresh();

    let chatMsg = `✅ Tratamientos importados: ${imported}/${dataRows.length}`;
    if (errors > 0) chatMsg += `\n🔴 ${errors} errores:\n${errorList.slice(0, 5).map(e => `  - ${e}`).join("\n")}`;
    setMs(p => [...p, { role: "assistant", text: chatMsg }]);
  };

  // Import Inseminación CSV — Format: CROTAL;FECHA;MACHO/DOSIS;PARIDERA;OBSERVACIONES (flexible)
  const importInseminacion = async (rows) => {
    setImporting(true);
    setImportResult(null);

    const header = rows[0];
    const hNorm = header.map(h => normalizeText(h));

    const crotalCol = hNorm.findIndex(h => h.includes("crotal") || h.includes("animal") || h.includes("cabra"));
    const fechaCol = hNorm.findIndex(h => h.includes("fecha"));
    const machoCol = hNorm.findIndex(h => h.includes("macho") || h.includes("dosis") || h.includes("semen") || h.includes("semental"));
    const parideraCol = hNorm.findIndex(h => h.includes("paridera") || h.includes("lote") || h.includes("grupo"));
    const notasCol = hNorm.findIndex(h => h.includes("nota") || h.includes("observ"));

    if (crotalCol === -1) {
      setMs(p => [...p, { role: "assistant", text: `🔴 No se encontró columna de crotal. Columnas: ${header.join(", ")}` }]);
      setImporting(false);
      return;
    }

    setMs(p => [...p, { role: "assistant", text: `📋 Importando inseminaciones...\nColumnas detectadas: crotal=${crotalCol >= 0 ? header[crotalCol] : "?"}, fecha=${fechaCol >= 0 ? header[fechaCol] : "?"}, macho=${machoCol >= 0 ? header[machoCol] : "?"}` }]);

    const dataRows = rows.slice(1).filter(r => r[crotalCol]?.trim());
    const today = new Date().toISOString().split("T")[0];
    let imported = 0, errors = 0, skipped = 0;
    const errorList = [];

    for (const row of dataRows) {
      try {
        const crotal = row[crotalCol].trim();
        const cabra = data.cabras.find(c => c.crotal === crotal);
        if (!cabra) { errorList.push(`${crotal}: no existe`); errors++; continue; }

        const fecha = fechaCol >= 0 ? row[fechaCol]?.trim() || today : today;
        const machoInfo = machoCol >= 0 ? row[machoCol]?.trim() || "" : "";
        const parideraInfo = parideraCol >= 0 ? row[parideraCol]?.trim() || "" : "";
        const notas = notasCol >= 0 ? row[notasCol]?.trim() || "" : "";

        // Check duplicate
        const existing = data.cubriciones.find(c => c.cabra?.crotal === crotal && c.metodo === "inseminacion");
        if (existing) { skipped++; continue; }

        // Find paridera if mentioned
        let paridera_id = null;
        if (parideraInfo) {
          const par = data.parideras.find(p => normalizeText(p.nombre).includes(normalizeText(parideraInfo)));
          if (par) paridera_id = par.id;
        }

        const { error } = await supabase.from("cubricion").insert([{
          cabra_id: cabra.id, fecha_entrada: fecha, metodo: "inseminacion",
          paridera_id, notas: `${machoInfo} ${notas}`.trim() || "Inseminación CSV",
        }]);
        if (error) { errors++; errorList.push(`${crotal}: ${error.message}`); }
        else imported++;
      } catch (err) {
        errors++;
      }
    }

    setImportResult({ imported, errors, errorList, total: dataRows.length, tipo: "inseminacion" });
    await supabase.from("importacion").insert([{ nombre_archivo: fileName || "inseminacion.csv", tipo: "inseminacion", registros_procesados: imported, registros_con_error: errors, errores: errorList.length > 0 ? errorList.slice(0, 50) : null }]);
    setImporting(false);
    refresh();

    let chatMsg = `✅ Inseminaciones importadas: ${imported}/${dataRows.length}`;
    if (skipped > 0) chatMsg += `\n⏭️ ${skipped} ya existían (no duplicadas)`;
    if (errors > 0) chatMsg += `\n🔴 ${errors} errores:\n${errorList.slice(0, 5).map(e => `  - ${e}`).join("\n")}`;
    setMs(p => [...p, { role: "assistant", text: chatMsg }]);
  };

  // Import Ecografia CSV — Format: ID_ELECTRONICO;;;RESULTADO;DD/MM/YYYY;NUM (sin cabecera)
  // Resultado vacio = gestante, "VACIA" = vacia, "HIDROMETRA" = hidrometra
  const importEcografia = async (rows) => {
    setImporting(true);
    setImportResult(null);

    const parideraId = ecoOptions.paridera_id;
    const ronda = ecoOptions.ronda;
    const loteEco = ecoOptions.lote;
    const parideraNombre = data.parideras.find(p => p.id === parideraId)?.nombre || "?";

    setMs(p => [...p, { role: "assistant", text: `\uD83D\uDD2C Importando ecografias (${ronda === "primera" ? "1a ronda" : "2a ronda - repaso"}) de ${parideraNombre}${loteEco ? ` (${loteEco})` : ""}...\n${rows.length} filas detectadas` }]);

    // Detect if first row is a header (contains text like "crotal", "resultado", etc.)
    const firstRowText = normalizeText((rows[0] || []).join(" "));
    const hasHeader = firstRowText.includes("crotal") || firstRowText.includes("resultado") || firstRowText.includes("electronico") || firstRowText.includes("identificador");
    const dataRows = hasHeader ? rows.slice(1) : rows;

    // Delete existing ecografias for this paridera+ronda to allow clean re-imports
    const ecosPreviasMismaRonda = data.ecografias.filter(e => e.paridera_id === parideraId && (e.ronda === ronda || (!e.ronda && ronda)));
    if (ecosPreviasMismaRonda.length > 0) {
      const idsToDelete = ecosPreviasMismaRonda.map(e => e.id);
      for (const id of idsToDelete) {
        await supabase.from("ecografia").delete().eq("id", id);
      }
      setMs(p => [...p, { role: "assistant", text: `\uD83D\uDDD1\uFE0F Eliminadas ${idsToDelete.length} ecografias anteriores de ${parideraNombre} (${ronda === "primera" ? "1a ronda" : "2a ronda"}) para reimportar limpio.` }]);
    }

    // Get existing ecografias for this paridera (after cleanup) to detect doble vacias
    const { data: ecosRefresh } = await supabase.from("ecografia").select("*, cabra:cabra_id(crotal), paridera:paridera_id(nombre)").eq("paridera_id", parideraId);
    const ecosExistentes = ecosRefresh || [];

    let gestantes = 0, vacias = 0, hidrometras = 0, dobleVacias = 0, errors = 0, skipped = 0;
    const errorList = [];
    const dobleVaciaList = [];
    const hidrometraList = [];
    const vaciaList = [];

    for (const row of dataRows) {
      try {
        // Parse: [0]=id_electronico, [3]=resultado, [4]=fecha
        const idElecRaw = (row[0] || "").trim();
        if (!idElecRaw || idElecRaw.length < 10) continue;

        const resultadoRaw = (row[3] || "").trim().toUpperCase();
        const fechaRaw = (row[4] || "").trim();

        // Determine resultado
        let resultado = "gestante";
        if (resultadoRaw === "VACIA" || resultadoRaw === "VAC\u00CDA") resultado = "vacia";
        else if (resultadoRaw.includes("HIDROMETRA") || resultadoRaw.includes("HIDRO")) resultado = "hidrometra";
        else if (resultadoRaw !== "") resultado = resultadoRaw.toLowerCase();

        // Parse date DD/MM/YYYY
        let fecha = null;
        if (fechaRaw) {
          const parts = fechaRaw.split("/");
          if (parts.length === 3) {
            let d = parseInt(parts[0]), mo = parseInt(parts[1]), y = parseInt(parts[2]);
            if (y < 100) y += 2000;
            if (d && mo && y) fecha = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          }
        }
        if (!fecha) fecha = new Date().toISOString().split("T")[0];

        // Find cabra by last 6 digits of id_electronico (the reader gives the full number but only the last 6 identify the animal)
        const last6 = idElecRaw.slice(-6);
        const cabra = data.cabras.find(c => c.id_electronico && c.id_electronico.trim().slice(-6) === last6);
        if (!cabra) {
          errorList.push(`ID ...${last6}: no encontrada en el sistema`);
          errors++;
          continue;
        }

        // Check duplicate: same cabra + paridera + same resultado
        const existeDuplicada = ecosExistentes.find(e => e.cabra_id === cabra.id && e.resultado === resultado);
        if (existeDuplicada) { skipped++; continue; }

        // Insert ecografia (with ronda field)
        const { error: errEco } = await supabase.from("ecografia").insert([{
          cabra_id: cabra.id,
          paridera_id: parideraId,
          fecha,
          resultado,
          ronda,
        }]);
        if (errEco) { errors++; errorList.push(`${cabra.crotal}: ${errEco.message}`); continue; }

        // Cross-reference and update estado_ginecologico
        if (resultado === "vacia") {
          vacias++;
          vaciaList.push(cabra.crotal);

          // Check for doble vacia: cabra already had a vacia eco (any paridera)
          const ecosPrevias = data.ecografias.filter(e => e.cabra_id === cabra.id && e.resultado === "vacia");
          // Also check within this same import batch (previous paridera eco was vacia)
          const ecoMismaParidera = ecosExistentes.find(e => e.cabra_id === cabra.id && e.resultado === "vacia");

          if (ronda === "segunda" && ecoMismaParidera) {
            // 2nd round vacia + 1st round was also vacia = doble vacia in this paridera
            dobleVacias++;
            dobleVaciaList.push(cabra.crotal);
            await supabase.from("cabra").update({ estado_ginecologico: "doble_vacia" }).eq("id", cabra.id);
          } else if (ecosPrevias.length >= 1 && ronda === "segunda") {
            // Had previous vacias in other parideras
            dobleVacias++;
            dobleVaciaList.push(cabra.crotal);
            await supabase.from("cabra").update({ estado_ginecologico: "doble_vacia" }).eq("id", cabra.id);
          } else {
            await supabase.from("cabra").update({ estado_ginecologico: "vacia" }).eq("id", cabra.id);
          }
        } else if (resultado === "hidrometra") {
          hidrometras++;
          hidrometraList.push(cabra.crotal);
          await supabase.from("cabra").update({ estado_ginecologico: "hidrometra" }).eq("id", cabra.id);
        } else {
          gestantes++;
          // If cabra was marked vacia before and now is gestante (recovered in 2nd eco)
          if (ronda === "segunda" && cabra.estado_ginecologico === "vacia") {
            await supabase.from("cabra").update({ estado_ginecologico: "gestante" }).eq("id", cabra.id);
          }
        }
      } catch (err) {
        errors++;
        errorList.push(`Fila: ${err.message}`);
      }
    }

    const total = gestantes + vacias + hidrometras;
    setImportResult({ imported: total, errors, errorList, total: dataRows.length, tipo: "ecografia",
      detalle: { gestantes, vacias, hidrometras, dobleVacias, skipped } });
    setImporting(false);
    refresh();

    // Build detailed chat summary
    let chatMsg = `\u2705 **Ecografias importadas** (${ronda === "primera" ? "1a ronda" : "2a ronda"} - ${parideraNombre})\n\n`;
    chatMsg += `\uD83D\uDFE2 **${gestantes}** gestantes (todo correcto)\n`;
    chatMsg += `\uD83D\uDD34 **${vacias}** vacias`;
    if (vaciaList.length > 0) chatMsg += `: ${vaciaList.join(", ")}`;
    chatMsg += `\n`;
    if (hidrometras > 0) {
      chatMsg += `\u26A0\uFE0F **${hidrometras}** hidrometras: ${hidrometraList.join(", ")}\n`;
      chatMsg += `   _Hidrometra = pseudogestacion (liquido en utero sin feto). Requiere tratamiento con prostaglandinas._\n`;
    }
    if (dobleVacias > 0) {
      chatMsg += `\n\uD83D\uDEA8 **${dobleVacias} DOBLE VACIAS**: ${dobleVaciaList.join(", ")}\n`;
      chatMsg += `   _Candidatas a descarte o revision veterinaria urgente._\n`;
    }
    if (skipped > 0) chatMsg += `\n\u23ED\uFE0F ${skipped} ya existian (no duplicadas)`;
    if (errors > 0) chatMsg += `\n\uD83D\uDD34 ${errors} errores:\n${errorList.slice(0, 8).map(e => `  - ${e}`).join("\n")}`;
    setMs(p => [...p, { role: "assistant", text: chatMsg }]);
  };

  const readFile = async (file) => {
    setFileName(file.name);
    setImportResult(null);
    setCsvType(null);
    setEcoOptions({ paridera_id: null, lote: null, ronda: null });
    try {
      const text = await readFileText(file);
      const rows = parseCSV(text);
      const cleanRows = rows.filter(r => r.length > 1 && r[0]);
      setRawRows(cleanRows);
      setFileData({ "Datos": cleanRows.slice(0, 60) });
      
      setMs(p => [...p, { role: "user", text: `📎 ${file.name} subido (${cleanRows.length} filas, ${cleanRows[0]?.length || 0} columnas)` }]);
      setMs(p => [...p, { role: "assistant", text: `Archivo cargado. Selecciona el tipo de datos:\n\u2022 \uD83E\uDD5B **Producci\u00F3n** \u2014 informe diario FLM\n\u2022 \uD83C\uDF7C **Paridera** \u2014 partos, abortos, vac\u00EDas y cr\u00EDas\n\u2022 \uD83D\uDC89 **Tratamientos** \u2014 vacunas, desparasitaciones, fertilidad\n\u2022 \uD83D\uDD2C **Inseminaci\u00F3n** \u2014 registro de inseminaciones\n\u2022 \uD83D\uDCCB **Anotaciones** \u2014 observaciones veterinarias\n\u2022 \uD83D\uDD2C **Ecograf\u00EDas** \u2014 gestantes, vac\u00EDas, hidrometras\n\nUsa los botones de abajo para elegir.` }]);
    } catch (err) {
      setMs(p => [...p, { role: "assistant", text: `Error leyendo archivo: ${err.message}` }]);
    }
  };

  const handleDrop = (e) => { e.preventDefault(); setDO(false); const f = e.dataTransfer.files[0]; if (f) readFile(f); };
  const handleClick = () => { fileRef.current?.click(); };
  const handleFileChange = (e) => { const f = e.target.files[0]; if (f) readFile(f); };

  const s = async () => { 
    if (!m.trim()) return; 
    const userMsg = m;
    setMs(p => [...p, { role: "user", text: userMsg }]); setM(""); setLd(true);
    let ctx = dataCtx;
    if (rawRows) {
      const preview = rawRows.slice(0, 20).map(r => r.join(" | ")).join("\n");
      ctx += `\n\nARCHIVO: ${fileName}\n${preview}`;
    }

    // Detect bulk treatment registration (vacunación, desparasitación, etc.)
    const msgLow = userMsg.toLowerCase();
    const treatmentPatterns = [
      { keywords: ["vacuna", "vacunado", "vacunacion"], tipo: "vacunacion" },
      { keywords: ["desparasit", "desparasitado"], tipo: "desparasitacion" },
      { keywords: ["tratamiento", "tratado", "medicado"], tipo: "tratamiento" },
      { keywords: ["implante", "esponja", "melovine"], tipo: "fertilidad" },
      { keywords: ["antibiotico", "mamitis", "mastitis"], tipo: "antibiotico" },
    ];
    
    const detectedTreat = treatmentPatterns.find(tp => tp.keywords.some(k => msgLow.includes(k)));
    const loteMatch = msgLow.match(/lote\s*(\d+)/);
    
    if (detectedTreat && loteMatch) {
      const loteNum = loteMatch[1];
      const lote = data.lotes.find(l => l.nombre && l.nombre.includes(`Lote ${loteNum}`));
      
      if (lote) {
        const cabrasLote = data.cabras.filter(c => c.lote_id === lote.id);
        const producto = userMsg.replace(/[Hh]e |[Aa]l |[Dd]el |[Ee]ntero |[Ee]ntera |[Tt]odo |[Tt]oda /g, "").trim();
        const today = new Date().toISOString().split("T")[0];
        
        // Insert treatments for all cabras in the lote
        let ok = 0, err = 0;
        for (const c of cabrasLote) {
          const { error } = await supabase.from("tratamiento").insert([{
            cabra_id: c.id, fecha: today, tipo: detectedTreat.tipo, producto: producto,
            notas: `Tratamiento masivo ${lote.nombre} — registrado desde chat`,
          }]);
          if (error) err++;
          else ok++;
        }
        
        refresh();
        setMs(p => [...p, { role: "assistant", text: `✅ **Registrado en la base de datos:**\n\n- **Tipo:** ${detectedTreat.tipo}\n- **Producto:** ${producto}\n- **Lote:** ${lote.nombre}\n- **Cabras tratadas:** ${ok}/${cabrasLote.length}\n- **Fecha:** ${today}${err > 0 ? `\n- ⚠️ ${err} errores` : ""}\n\nEsto queda guardado en el historial de cada cabra y se cruzará con los datos de producción y reproducción.` }]);
        setLd(false);
        return;
      }
    }

    // Also detect individual cabra treatments
    const crotalMatch = msgLow.match(/\b(\d{5,6})\b/);
    if (detectedTreat && crotalMatch && !loteMatch) {
      const crotal = crotalMatch[1];
      const cabra = data.cabras.find(c => c.crotal === crotal);
      if (cabra) {
        const today = new Date().toISOString().split("T")[0];
        const producto = userMsg.trim();
        await supabase.from("tratamiento").insert([{
          cabra_id: cabra.id, fecha: today, tipo: detectedTreat.tipo, producto: producto,
          notas: "Registrado desde chat",
        }]);
        refresh();
        setMs(p => [...p, { role: "assistant", text: `✅ **Tratamiento registrado:**\n- Cabra: ${crotal}\n- Tipo: ${detectedTreat.tipo}\n- Fecha: ${today}\n\nGuardado en el historial de la cabra.` }]);
        setLd(false);
        return;
      }
    }

    // Detect death registration — requires confirmation
    if ((msgLow.includes("muerto") || msgLow.includes("muerta") || msgLow.includes("fallecido") || msgLow.includes("baja")) && crotalMatch) {
      const crotal = crotalMatch[1];
      const cabra = data.cabras.find(c => c.crotal === crotal);
      if (cabra) {
        const loteNombre = data.lotes.find(l => l.id === cabra.lote_id)?.nombre || "Sin lote";
        setPendingAction({
          type: "muerte",
          description: `Registrar baja/muerte de cabra ${crotal} (${loteNombre}, ${cabra.num_lactaciones || 0} lactaciones)`,
          execute: async () => {
            const today = new Date().toISOString().split("T")[0];
            await supabase.from("muerte").insert([{ cabra_id: cabra.id, fecha: today, causa: userMsg, crotal: crotal }]);
            await supabase.from("cabra").update({ estado: "muerta", lote_id: null }).eq("id", cabra.id);
            refresh();
            setMs(p => [...p, { role: "assistant", text: `✅ **Baja registrada:**\n- Cabra: ${crotal}\n- Fecha: ${today}\n- Estado cambiado a "muerta"\n- Retirada del lote\n- Registrado en historial` }]);
          }
        });
        setMs(p => [...p, { role: "assistant", text: `⚠️ **Confirmar baja:**\n\nSe va a registrar la muerte de la cabra **${crotal}**.\n- Lote actual: ${loteNombre}\n- Lactaciones: ${cabra.num_lactaciones || 0}\n- Causa: "${userMsg}"\n\n**Esta accion es irreversible.** Pulsa "Confirmar" o "Cancelar".` }]);
        setLd(false);
        return;
      }
    }

    // Detect lote change
    if ((msgLow.includes("cambia") || msgLow.includes("mueve") || msgLow.includes("pasa") || msgLow.includes("mover")) && crotalMatch && loteMatch) {
      const crotal = crotalMatch[1];
      const loteNum = loteMatch[1];
      const cabra = data.cabras.find(c => c.crotal === crotal);
      const lote = data.lotes.find(l => l.nombre && l.nombre.includes(`Lote ${loteNum}`));
      if (cabra && lote) {
        const loteOrigenId = cabra.lote_id;
        await supabase.from("cabra").update({ lote_id: lote.id }).eq("id", cabra.id);
        await supabase.from("cambio_lote").insert([{ cabra_id: cabra.id, lote_origen_id: loteOrigenId, lote_destino_id: lote.id, fecha: new Date().toISOString().split("T")[0], motivo: "Chat importador" }]);
        refresh();
        const loteOrigenNombre = data.lotes.find(l => l.id === loteOrigenId)?.nombre || "Sin lote";
        setMs(p => [...p, { role: "assistant", text: `✅ **Cambio de lote registrado:**\n- Cabra: ${crotal}\n- De: ${loteOrigenNombre}\n- A: ${lote.nombre}\n\nActualizado en la base de datos y registrado en historial.` }]);
        setLd(false);
        return;
      }
    }

    const response = await askClaude(userMsg, ctx);
    setMs(p => [...p, { role: "assistant", text: response }]);
    setLd(false);
  };

  const canImport = rawRows && csvType && (csvType !== "ecografia" || (ecoOptions.paridera_id && ecoOptions.ronda));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <div>
        <SectionTitle icon="📁" text="Subir Datos" />
        <input type="file" ref={fileRef} onChange={handleFileChange} accept=".csv,.txt" style={{ display: "none" }} />
        <div onClick={handleClick} onDragOver={e => { e.preventDefault(); setDO(true); }} onDragLeave={() => setDO(false)} onDrop={handleDrop}
          style={{ border: `2px dashed ${dO ? "#E8950A" : fileName ? "#059669" : "#E2E8F0"}`, borderRadius: 16, padding: "36px 28px", textAlign: "center", background: dO ? "#FEF9EE" : fileName ? "#F0FDF4" : "#FAFAFA", cursor: "pointer", transition: "all .3s" }}>
          {fileName ? (<>
            <div style={{ fontSize: 38, marginBottom: 10 }}>✅</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#059669" }}>{fileName}</div>
            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 3 }}>Archivo cargado — clic para cambiar</div>
          </>) : (<>
            <div style={{ fontSize: 38, marginBottom: 10 }}>📎</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1E293B" }}>Arrastra el CSV aquí</div>
            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 3 }}>o haz clic para seleccionar</div>
          </>)}
        </div>

        {/* Type selector — only shown when file is loaded */}
        {rawRows && !importResult && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 8 }}>¿Qué tipo de datos contiene?</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <button onClick={() => setCsvType("produccion")}
                style={{
                  padding: "14px", borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: "pointer",
                  border: csvType === "produccion" ? "2px solid #059669" : "2px solid #E2E8F0",
                  background: csvType === "produccion" ? "#F0FDF4" : "#FFF",
                  color: csvType === "produccion" ? "#059669" : "#64748B",
                }}>
                🥛 Producción
              </button>
              <button onClick={() => setCsvType("paridera")}
                style={{
                  padding: "14px", borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: "pointer",
                  border: csvType === "paridera" ? "2px solid #DB2777" : "2px solid #E2E8F0",
                  background: csvType === "paridera" ? "#FDF2F8" : "#FFF",
                  color: csvType === "paridera" ? "#DB2777" : "#64748B",
                }}>
                🍼 Paridera
              </button>
              <button onClick={() => setCsvType("tratamiento")}
                style={{
                  padding: "14px", borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: "pointer",
                  border: csvType === "tratamiento" ? "2px solid #7C3AED" : "2px solid #E2E8F0",
                  background: csvType === "tratamiento" ? "#F5F3FF" : "#FFF",
                  color: csvType === "tratamiento" ? "#7C3AED" : "#64748B",
                }}>
                💉 Tratamientos
              </button>
              <button onClick={() => setCsvType("inseminacion")}
                style={{
                  padding: "14px", borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: "pointer",
                  border: csvType === "inseminacion" ? "2px solid #EA580C" : "2px solid #E2E8F0",
                  background: csvType === "inseminacion" ? "#FFF7ED" : "#FFF",
                  color: csvType === "inseminacion" ? "#EA580C" : "#64748B",
                }}>
                🔬 Inseminación
              </button>
              <button onClick={() => setCsvType("anotaciones")}
                style={{
                  padding: "14px", borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: "pointer",
                  border: csvType === "anotaciones" ? "2px solid #0891B2" : "2px solid #E2E8F0",
                  background: csvType === "anotaciones" ? "#F0F9FF" : "#FFF",
                  color: csvType === "anotaciones" ? "#0891B2" : "#64748B",
                }}>
                📋 Anotaciones
              </button>
              <button onClick={() => { setCsvType("ecografia"); setEcoOptions({ paridera_id: null, lote: null, ronda: null }); }}
                style={{
                  padding: "14px", borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: "pointer",
                  border: csvType === "ecografia" ? "2px solid #0D9488" : "2px solid #E2E8F0",
                  background: csvType === "ecografia" ? "#F0FDFA" : "#FFF",
                  color: csvType === "ecografia" ? "#0D9488" : "#64748B",
                }}>
                🔬 Ecografias
              </button>
            </div>

            {/* Eco options panel */}
            {csvType === "ecografia" && (
              <div style={{ marginTop: 12, padding: 16, background: "#F0FDFA", borderRadius: 12, border: "1px solid #99F6E4", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#0D9488" }}>Configurar ecografia</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Paridera</div>
                    <select value={ecoOptions.paridera_id || ""} onChange={e => setEcoOptions(p => ({ ...p, paridera_id: parseInt(e.target.value) || null }))}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 13, background: "#FFF", cursor: "pointer" }}>
                      <option value="">Seleccionar...</option>
                      {data.parideras.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Lote ecografiado</div>
                    <select value={ecoOptions.lote || ""} onChange={e => setEcoOptions(p => ({ ...p, lote: e.target.value || null }))}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 13, background: "#FFF", cursor: "pointer" }}>
                      <option value="">Seleccionar...</option>
                      {data.lotes.map(l => <option key={l.id} value={l.nombre}>{l.nombre} ({l.cabras} cabras)</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#64748B", marginBottom: 4 }}>Ronda de ecografia</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {["primera", "segunda"].map(r => (
                      <button key={r} onClick={() => setEcoOptions(p => ({ ...p, ronda: r }))}
                        style={{
                          flex: 1, padding: "8px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                          border: ecoOptions.ronda === r ? "2px solid #0D9488" : "1px solid #CBD5E1",
                          background: ecoOptions.ronda === r ? "#CCFBF1" : "#FFF",
                          color: ecoOptions.ronda === r ? "#0D9488" : "#64748B",
                        }}>
                        {r === "primera" ? "1a Ecografia" : "2a Ecografia (repaso)"}
                      </button>
                    ))}
                  </div>
                </div>
                {ecoOptions.paridera_id && ecoOptions.ronda && (
                  <div style={{ fontSize: 11, color: "#0D9488", fontWeight: 600, padding: "6px 10px", background: "#CCFBF1", borderRadius: 6 }}>
                    {"\u2705"} Listo: {ecoOptions.ronda === "primera" ? "1a" : "2a"} eco de {data.parideras.find(p => p.id === ecoOptions.paridera_id)?.nombre || "?"}{ecoOptions.lote ? ` (${ecoOptions.lote})` : ""}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Import button */}
        {canImport && !importResult && (
          <button onClick={() => {
            if (csvType === "produccion") importProduction(rawRows);
            else if (csvType === "anotaciones") importAnotaciones(rawRows);
            else if (csvType === "paridera") importParidera(rawRows);
            else if (csvType === "tratamiento") importTratamiento(rawRows);
            else if (csvType === "inseminacion") importInseminacion(rawRows);
            else if (csvType === "ecografia") importEcografia(rawRows);
          }} disabled={importing}
            style={{ width: "100%", marginTop: 14, padding: "14px", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 700, cursor: importing ? "wait" : "pointer",
              background: importing ? "#94A3B8" : csvType === "produccion" ? "linear-gradient(135deg, #059669, #047857)" : "linear-gradient(135deg, #0891B2, #0E7490)", color: "#FFF",
            }}>
            {importing ? "\u23F3 Importando..." : csvType === "produccion" ? `\uD83D\uDE80 Importar ${rawRows.length - 1} cabras a Supabase` : csvType === "ecografia" ? `\uD83D\uDD2C Importar ${rawRows.length} ecografias a Supabase` : `\uD83D\uDCCB Importar ${rawRows.length - 1} registros a Supabase`}
          </button>
        )}

        {importResult && (
          <Card style={{ marginTop: 14, background: importResult.errors > 0 ? "#FEF9EE" : "#F0FDF4", border: `1px solid ${importResult.errors > 0 ? "#FDE68A" : "#BBF7D0"}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#059669", marginBottom: 10 }}>✅ Importación completada</div>
            {importResult.tipo !== "anotaciones" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
              <div style={{ textAlign: "center", padding: 8, background: "#FFF", borderRadius: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#059669" }}>{importResult.imported}</div>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>Importados</div>
              </div>
              <div style={{ textAlign: "center", padding: 8, background: "#FFF", borderRadius: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#E8950A" }}>{importResult.totalLitros?.toFixed(0) || 0}L</div>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>Litros hoy</div>
              </div>
              <div style={{ textAlign: "center", padding: 8, background: "#FFF", borderRadius: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#7C3AED" }}>{importResult.loteChanges || 0}</div>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>Cambios lote</div>
              </div>
            </div>
            )}
            {importResult.tipo === "anotaciones" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 10 }}>
              <div style={{ textAlign: "center", padding: 8, background: "#FFF", borderRadius: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#0891B2" }}>{importResult.imported}</div>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>Anotaciones guardadas</div>
              </div>
              <div style={{ textAlign: "center", padding: 8, background: "#FFF", borderRadius: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: importResult.errors > 0 ? "#DC2626" : "#059669" }}>{importResult.errors}</div>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>Errores</div>
              </div>
            </div>
            )}
            {importResult.tipo === "ecografia" && importResult.detalle && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 10 }}>
              <div style={{ textAlign: "center", padding: 8, background: "#FFF", borderRadius: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#059669" }}>{importResult.detalle.gestantes}</div>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>Gestantes</div>
              </div>
              <div style={{ textAlign: "center", padding: 8, background: "#FFF", borderRadius: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#DC2626" }}>{importResult.detalle.vacias}</div>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>Vacias</div>
              </div>
              <div style={{ textAlign: "center", padding: 8, background: "#FFF", borderRadius: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#E8950A" }}>{importResult.detalle.hidrometras}</div>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>Hidrometras</div>
              </div>
              <div style={{ textAlign: "center", padding: 8, background: "#FFF", borderRadius: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: importResult.detalle.dobleVacias > 0 ? "#DC2626" : "#059669" }}>{importResult.detalle.dobleVacias}</div>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>Doble vacias</div>
              </div>
            </div>
            )}
            {importResult.alertas && importResult.alertas.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#DC2626", marginBottom: 6 }}>{"🚨"} Alertas ({importResult.alertas.length})</div>
                {importResult.alertas.slice(0, 8).map((a, i) => (
                  <div key={i} style={{ fontSize: 11, color: "#475569", padding: "3px 0", borderBottom: "1px solid #F1F5F9" }}>{a.msg}</div>
                ))}
                {importResult.alertas.length > 8 && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>...y {importResult.alertas.length - 8} mas</div>}
              </div>
            )}
            {/* === PANEL INTELIGENCIA POST-IMPORTACION === */}
            {importResult.hallazgos && (
              <div style={{ marginTop: 12, background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 11, padding: "14px 16px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#7C3AED", marginBottom: 10 }}>{"🧠"} Analisis Automatico</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 10 }}>
                  {importResult.tendenciasCriticas > 0 && (
                    <div style={{ textAlign: "center", padding: "8px 6px", background: "#FEF2F2", borderRadius: 8, border: "1px solid #FECACA" }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#DC2626", fontFamily: "'Space Mono', monospace" }}>{importResult.tendenciasCriticas}</div>
                      <div style={{ fontSize: 9.5, color: "#DC2626" }}>Alertas criticas</div>
                    </div>
                  )}
                  {importResult.tendenciasTotal > 0 && (
                    <div style={{ textAlign: "center", padding: "8px 6px", background: "#FFFBEB", borderRadius: 8, border: "1px solid #FDE68A" }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#D97706", fontFamily: "'Space Mono', monospace" }}>{importResult.tendenciasTotal}</div>
                      <div style={{ fontSize: 9.5, color: "#D97706" }}>Tendencias</div>
                    </div>
                  )}
                  {importResult.reproAlertas > 0 && (
                    <div style={{ textAlign: "center", padding: "8px 6px", background: "#FFF7ED", borderRadius: 8, border: "1px solid #FED7AA" }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#EA580C", fontFamily: "'Space Mono', monospace" }}>{importResult.reproAlertas}</div>
                      <div style={{ fontSize: 9.5, color: "#EA580C" }}>Repro alertas</div>
                    </div>
                  )}
                  {importResult.proximosEventos > 0 && (
                    <div style={{ textAlign: "center", padding: "8px 6px", background: "#EFF6FF", borderRadius: 8, border: "1px solid #BFDBFE" }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#2563EB", fontFamily: "'Space Mono', monospace" }}>{importResult.proximosEventos}</div>
                      <div style={{ fontSize: 9.5, color: "#2563EB" }}>Eventos proximos</div>
                    </div>
                  )}
                </div>
                {/* Detalle de hallazgos criticos */}
                {importResult.hallazgos.tendencias && importResult.hallazgos.tendencias.filter(t => t.severidad === "alta").length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#DC2626", marginBottom: 4 }}>{"🔴"} Requieren accion inmediata:</div>
                    {importResult.hallazgos.tendencias.filter(t => t.severidad === "alta").slice(0, 5).map((t, i) => (
                      <div key={i} style={{ fontSize: 11, color: "#475569", padding: "3px 0" }}>
                        <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, color: "#DC2626" }}>{t.crotal}</span>
                        {" "}{t.tipo === "MASTITIS_PROBABLE" ? "Posible mastitis" : t.tipo} — {t.detalle}
                      </div>
                    ))}
                  </div>
                )}
                {importResult.hallazgos.alertasReproductivas && importResult.hallazgos.alertasReproductivas.filter(a => a.severidad === "alta").length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#EA580C", marginBottom: 4 }}>{"🔄"} Reproductivo urgente:</div>
                    {importResult.hallazgos.alertasReproductivas.filter(a => a.severidad === "alta").slice(0, 5).map((a, i) => (
                      <div key={i} style={{ fontSize: 11, color: "#475569", padding: "3px 0" }}>
                        <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, color: "#EA580C" }}>{a.crotal}</span>
                        {" "}{a.tipo.replace(/_/g, " ")} — {a.detalle}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {importResult.errors > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#DC2626" }}>Errores ({importResult.errors})</div>
                {importResult.errorList.slice(0, 5).map((e, i) => <div key={i} style={{ fontSize: 11, color: "#DC2626" }}>{e}</div>)}
              </div>
            )}
          </Card>
        )}

        {fileData && !importResult && (
          <Card style={{ marginTop: 14 }}>
            <SectionTitle icon="📋" text="Vista previa" />
            <div style={{ overflow: "auto", maxHeight: 180 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
                <tbody>
                  {Object.values(fileData)[0].slice(0, 8).map((row, i) => (
                    <tr key={i} style={{ background: i === 0 ? "#F8FAFC" : "transparent" }}>
                      {row.slice(0, 8).map((cell, j) => (
                        <td key={j} style={{ padding: "3px 6px", borderBottom: "1px solid #F1F5F9", color: i === 0 ? "#94A3B8" : "#475569", fontWeight: i === 0 ? 700 : 400, fontFamily: "'Space Mono', monospace", whiteSpace: "nowrap", fontSize: i === 0 ? 9 : 10.5 }}>
                          {String(cell).substring(0, 15)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 10.5, color: "#94A3B8", marginTop: 6 }}>{Object.values(fileData)[0].length} filas · mostrando primeras 8 columnas</div>
          </Card>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {pendingAction && (
          <div style={{ background: "#FEF3C7", border: "2px solid #F59E0B", borderRadius: 12, padding: "14px 18px", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontSize: 13, color: "#92400E", flex: 1 }}>⚠️ <strong>{pendingAction.description}</strong></div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={async () => { await pendingAction.execute(); setPendingAction(null); }} style={{ background: "#DC2626", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Confirmar</button>
              <button onClick={() => { setPendingAction(null); setMs(p => [...p, { role: "assistant", text: "Cancelado. No se ha registrado nada." }]); }} style={{ background: "#64748B", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
            </div>
          </div>
        )}
        <ChatBox messages={ms} input={m} setInput={setM} onSend={s} placeholder="Explícame qué has hecho o pregunta..." height={canImport ? 380 : 500} onSave={saveChat} pageName="importador" />
      </div>
    </div>
  );
}

function ConsultasPage({ data, saveChat }) {
  const [q, setQ] = useState("");
  const [ms, setMs] = useState([{ role: "assistant", text: "Pregúntame lo que quieras sobre tu granja. Tengo acceso a todos los datos: producción, partos, ecografías, tratamientos, cubriciones, crías, lotes. Puedo cruzar cualquier dato." }]);
  const [ld, setLd] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [chatName, setChatName] = useState("");
  
  // Build rich context with cross-referenced data
  const buildRichContext = (userMsg) => {
    const msg = userMsg.toLowerCase();
    let ctx = buildDataContext(data);
    
    // Latest production indexed by cabra_id
    const prod = data.produccion || [];
    const latestDate = prod.length > 0 ? prod[0].fecha : null;
    const todayProd = latestDate ? prod.filter(p => p.fecha === latestDate) : [];
    const prodByCabraId = {};
    todayProd.forEach(p => { prodByCabraId[p.cabra_id] = p; });
    
    // Always include: partos with abortos + production cross-reference
    const abortos = data.partos.filter(p => p.tipo === "aborto");
    if (abortos.length > 0) {
      ctx += `\n\nABORTOS REGISTRADOS (${abortos.length}):`;
      abortos.forEach(a => {
        const cabra = data.cabras.find(c => c.crotal === a.cabra?.crotal);
        const prodC = cabra ? prodByCabraId[cabra.id] : null;
        ctx += `\n  ${a.cabra?.crotal || '?'}: ${a.fecha} (${a.paridera?.nombre || '?'})`;
        if (prodC) ctx += ` → Producción actual: ${prodC.litros}L/día, DEL=${prodC.dia_lactacion}, Lact=${prodC.lactacion_num}`;
        else if (cabra) ctx += ` → Lote: ${cabra.lote?.nombre || '?'}, Estado: ${cabra.estado}`;
      });
    }
    
    // Always include: doble vacías with production
    const vaciasByC = {};
    data.ecografias.filter(e => e.resultado === "vacia").forEach(e => {
      const cr = e.cabra?.crotal;
      if (cr) { if (!vaciasByC[cr]) vaciasByC[cr] = []; vaciasByC[cr].push(e); }
    });
    const dobleVacias = Object.entries(vaciasByC).filter(([, arr]) => arr.length >= 2);
    if (dobleVacias.length > 0) {
      ctx += `\n\nCABRAS VACÍAS EN 2+ ECOGRAFÍAS (${dobleVacias.length}):`;
      dobleVacias.forEach(([cr, ecos]) => {
        const cabra = data.cabras.find(c => c.crotal === cr);
        const prodC = cabra ? prodByCabraId[cabra.id] : null;
        ctx += `\n  ${cr}: ${ecos.map(e => `${e.fecha} ${e.paridera?.nombre || ''}`).join(', ')}`;
        if (prodC) ctx += ` → ${prodC.litros}L/día`;
        if (cabra) ctx += ` (${cabra.lote?.nombre || '?'})`;
      });
    }
    
    // Include production data when relevant — BUT NOT when asking about cubrición (that has its own filtered section)
    const isCubricionQuery = msg.includes("cubri") || msg.includes("macho") || msg.includes("implant") || msg.includes("insemin") || msg.includes("reproduc") || msg.includes("fertilid") || msg.includes("celo") || (msg.includes("mejor") && (msg.includes("insemin") || msg.includes("macho") || msg.includes("cubri"))) || (msg.includes("parid") && (msg.includes("prep") || msg.includes("octubre") || msg.includes("enero") || msg.includes("mayo")));
    
    if (!isCubricionQuery && (msg.includes("produc") || msg.includes("leche") || msg.includes("litro") || msg.includes("mejor") || msg.includes("peor") || msg.includes("rendimiento") || msg.includes("descart") || msg.includes("matadero") || msg.includes("conductiv") || msg.includes("mastitis") || msg.includes("sanid") || msg.includes("alerta") || msg.includes("flujo") || msg.includes("ordeñ"))) {
      const sorted = [...todayProd].sort((a, b) => (b.litros || 0) - (a.litros || 0));
      if (sorted.length > 0) {
        ctx += `\n\nPRODUCCIÓN DEL DÍA ${latestDate} (${sorted.length} cabras, ${sorted.reduce((s, p) => s + (p.litros || 0), 0).toFixed(1)}L total):`;
        ctx += `\nTOP 20:`;
        sorted.slice(0, 20).forEach(p => {
          const cabra = data.cabras.find(c => c.id === p.cabra_id);
          ctx += `\n  ${cabra?.crotal || '?'}: ${p.litros}L, DEL=${p.dia_lactacion}, Lact=${p.lactacion_num}, LitTotal=${p.litros_totales_lactacion}, Cond=${p.conductividad}, Lote=${cabra?.lote?.nombre || '?'}`;
        });
        ctx += `\nPEORES 20:`;
        sorted.slice(-20).reverse().forEach(p => {
          const cabra = data.cabras.find(c => c.id === p.cabra_id);
          ctx += `\n  ${cabra?.crotal || '?'}: ${p.litros}L, DEL=${p.dia_lactacion}, Lact=${p.lactacion_num}, LitTotal=${p.litros_totales_lactacion}, Cond=${p.conductividad}, Lote=${cabra?.lote?.nombre || '?'}`;
        });
      }
    }

    // Always include: high conductivity cabras with full details
    const highCondProd = todayProd.filter(p => p.conductividad > 6.0);
    if (highCondProd.length > 0) {
      ctx += `\n\nCABRAS CONDUCTIVIDAD ALTA >6.0 mS/cm (${highCondProd.length}):`;
      highCondProd.sort((a, b) => (b.conductividad || 0) - (a.conductividad || 0)).forEach(p => {
        const cabra = data.cabras.find(c => c.id === p.cabra_id);
        ctx += `\n  ${cabra?.crotal || '?'}: Cond=${p.conductividad}, ${p.litros}L/día, DEL=${p.dia_lactacion}, Lact=${p.lactacion_num}, Flujo=${p.flujo}, TiempoOrdeño=${p.tiempo_ordeno}min, Lote=${cabra?.lote?.nombre || '?'}`;
        // Add paridera info if available
        const cubr = data.cubriciones.find(cu => cu.cabra_id === p.cabra_id);
        if (cubr) ctx += `, Paridera=${cubr.paridera?.nombre || '?'}`;
      });
    }
    
    // Include partos data when relevant
    if (msg.includes("parto") || msg.includes("parid") || msg.includes("aborto") || msg.includes("cría") || msg.includes("nacimi") || msg.includes("febrero") || msg.includes("mayo") || msg.includes("octubre")) {
      ctx += `\n\nPARTOS (${data.partos.length} registros):`;
      const byParidera = {};
      data.partos.forEach(p => { const pn = p.paridera?.nombre || "Sin paridera"; if (!byParidera[pn]) byParidera[pn] = []; byParidera[pn].push(p); });
      Object.entries(byParidera).forEach(([pn, partos]) => {
        const normales = partos.filter(p => p.tipo === "normal").length;
        const abortosP = partos.filter(p => p.tipo === "aborto").length;
        ctx += `\n  ${pn}: ${partos.length} partos (${normales} normales, ${abortosP} abortos)`;
        partos.forEach(p => {
          const cabra = data.cabras.find(c => c.crotal === p.cabra?.crotal);
          const prodC = cabra ? prodByCabraId[cabra.id] : null;
          ctx += `\n    ${p.cabra?.crotal || '?'}: ${p.fecha}, ${p.tipo}, ${p.num_crias} crías (${p.num_hembras}H ${p.num_machos}M)`;
          if (prodC) ctx += ` → Prod actual: ${prodC.litros}L/día`;
        });
      });
    }
    
    // Include ecografías when relevant
    if (msg.includes("ecograf") || msg.includes("vacía") || msg.includes("vacia") || msg.includes("gestante") || msg.includes("preñada")) {
      ctx += `\n\nECOGRAFÍAS (${data.ecografias.length} registros):`;
      const byParidera = {};
      data.ecografias.forEach(e => { const pn = e.paridera?.nombre || "Sin paridera"; if (!byParidera[pn]) byParidera[pn] = []; byParidera[pn].push(e); });
      Object.entries(byParidera).forEach(([pn, ecos]) => {
        const gestantes = ecos.filter(e => e.resultado === "gestante" || e.resultado === "prenada").length;
        const vacias = ecos.filter(e => e.resultado === "vacia").length;
        ctx += `\n  ${pn}: ${ecos.length} ecos (${gestantes} gestantes, ${vacias} vacías)`;
        ecos.forEach(e => {
          ctx += `\n    ${e.cabra?.crotal || '?'}: ${e.fecha}, ${e.resultado}`;
        });
      });
    }
    
    // CUBRICIÓN / REPRODUCCIÓN — PRE-FILTERED with PROJECTED DEL
    if (isCubricionQuery) {
      // =============================================
      // STEP 1: Determine target paridera and days until machos enter
      // =============================================
      // Macho entry dates: 20 feb / 15 may / 15 ago / 15 nov
      const hoy = new Date();
      const machoSchedule = [
        { mes: 1, dia: 20, paridera: "Julio" },     // Feb 20 → partos julio
        { mes: 4, dia: 15, paridera: "Octubre" },    // May 15 → partos octubre
        { mes: 7, dia: 15, paridera: "Enero" },      // Aug 15 → partos enero
        { mes: 10, dia: 15, paridera: "Noviembre" },  // Nov 15 → partos abril/mayo
      ];

      // Detect which paridera user is asking about, or default to next
      let targetMachoDate = null;
      let targetParidera = "";
      
      if (msg.includes("octubre")) {
        targetMachoDate = new Date(hoy.getFullYear(), 4, 15); // May 15
        if (targetMachoDate < hoy) targetMachoDate.setFullYear(targetMachoDate.getFullYear() + 1);
        targetParidera = "Octubre";
      } else if (msg.includes("enero") || msg.includes("febrero")) {
        targetMachoDate = new Date(hoy.getFullYear(), 7, 15); // Aug 15
        if (targetMachoDate < hoy) targetMachoDate.setFullYear(targetMachoDate.getFullYear() + 1);
        targetParidera = "Enero/Febrero";
      } else if (msg.includes("mayo") || msg.includes("abril")) {
        targetMachoDate = new Date(hoy.getFullYear(), 10, 15); // Nov 15
        if (targetMachoDate < hoy) targetMachoDate.setFullYear(targetMachoDate.getFullYear() + 1);
        targetParidera = "Abril/Mayo";
      } else if (msg.includes("julio") || msg.includes("agosto")) {
        targetMachoDate = new Date(hoy.getFullYear(), 1, 20); // Feb 20
        if (targetMachoDate < hoy) targetMachoDate.setFullYear(targetMachoDate.getFullYear() + 1);
        targetParidera = "Julio/Agosto";
      } else {
        // Default: find next macho entry
        let minDays = 999;
        for (const ms2 of machoSchedule) {
          let d = new Date(hoy.getFullYear(), ms2.mes, ms2.dia);
          if (d < hoy) d.setFullYear(d.getFullYear() + 1);
          const days = Math.round((d - hoy) / 86400000);
          if (days < minDays) { minDays = days; targetMachoDate = d; targetParidera = ms2.paridera; }
        }
      }

      const diasHastaMachos = Math.round((targetMachoDate - hoy) / 86400000);
      const fechaImplantes = new Date(targetMachoDate.getTime() - 45 * 86400000);
      const fechaInseminacion = new Date(targetMachoDate.getTime() - 15 * 86400000);

      ctx += `\n\n${'='.repeat(60)}`;
      ctx += `\n🔒 ANÁLISIS CUBRICIÓN — PARIDERA ${targetParidera.toUpperCase()}`;
      ctx += `\n${'='.repeat(60)}`;
      ctx += `\n📅 Machos entran: ${targetMachoDate.toLocaleDateString("es-ES")} (en ${diasHastaMachos} días)`;
      ctx += `\n📅 Implantes: ~${fechaImplantes.toLocaleDateString("es-ES")}`;
      ctx += `\n📅 Inseminación: ~${fechaInseminacion.toLocaleDateString("es-ES")}`;
      ctx += `\n\n⚠️ TODOS los DEL mostrados son PROYECTADOS al momento de entrar con machos (DEL actual + ${diasHastaMachos} días)`;
      ctx += `\n⛔ PROHIBIDO recomendar cabras que no estén en la lista de APTAS`;

      // =============================================
      // STEP 2: Filter by lote (ONLY Lote 1, 4, vacías L6)
      // =============================================
      ctx += `\n\nESTADO DE LOTES:`;
      data.lotes.filter(l => l.cabras > 0).forEach(l => {
        const esApto = l.nombre.includes("Lote 1") || l.nombre.includes("Lote 4");
        ctx += `\n  ${l.nombre}: ${l.cabras} cabras ${esApto ? '✅ APTO' : '⛔ BLOQUEADO'}`;
      });

      const candidateLotes = data.lotes.filter(l => l.nombre.includes("Lote 1") || l.nombre.includes("Lote 4"));
      const candidateLoteIds = new Set(candidateLotes.map(l => l.id));

      // =============================================
      // STEP 3: Analyze each cabra with PROJECTED DEL
      // =============================================
      const allCandidates = [];
      
      data.cabras.filter(c => candidateLoteIds.has(c.lote_id)).forEach(c => {
        const p = prodByCabraId[c.id];
        const delHoy = p?.dia_lactacion || c.dias_en_leche || 0;
        const delProyectado = delHoy + diasHastaMachos;
        const litros = p?.litros || 0;
        const litrosTotalesLact = p?.litros_totales_lactacion || 0;
        const promedioTotal = p?.promedio_total || p?.media_total || 0;
        const prom10d = p?.promedio_10d || p?.media_10d || 0;
        const cond = p?.conductividad || 0;
        const lact = c.num_lactaciones || p?.lactacion_num || 0;
        const ecos = data.ecografias.filter(e => e.cabra?.crotal === c.crotal);
        const lastEco = ecos.length > 0 ? ecos.sort((a, b) => b.fecha.localeCompare(a.fecha))[0] : null;
        const vaciaCount = ecos.filter(e => e.resultado === 'vacia').length;
        const anots = (data.anotaciones || []).filter(a => a.cabra_id === c.id);
        const partosC = data.partos.filter(pp => pp.cabra?.crotal === c.crotal);
        const abortosC = partosC.filter(pp => pp.tipo === 'aborto').length;

        // Skip gestantes confirmadas
        if (lastEco && (lastEco.resultado === 'gestante' || lastEco.resultado === 'prenada')) return;

        // =============================================
        // LOGICA DE APTITUD — basada en DEL PROYECTADO
        // Usa promedio 10 dias (prom10d) como referencia de produccion
        // Fallback a litros diarios si no hay prom10d
        // =============================================
        let aptitud = "";
        let razon = "";
        const prodRef = prom10d > 0 ? prom10d : litros;
        const prodLabel = prom10d > 0 ? "prom10d" : "diario";
        const esBuenaProductora = prodRef >= 2.5;
        const esMediaProductora = prodRef >= 1.5 && prodRef < 2.5;
        const esMalaProductora = prodRef < 1.5;

        if (lact === 1) {
          // =============================================
          // PRIMIPARAS (1 lactacion) — REGLAS ESPECIALES
          // >150 DEL: todas entran sin importar produccion
          // 100-150 DEL + <1.5L: adelantar cubricion
          // 100-150 DEL + >=1.5L: esperar, aun produce
          // <100 DEL: demasiado pronto
          // =============================================
          if (delProyectado > 150) {
            aptitud = "APTA";
            razon = `PRIMIPARA L1, DEL proy.=${delProyectado} (>150), ${prodRef.toFixed(1)}L(${prodLabel}). Todas las primiparas >150 DEL entran.`;
          } else if (delProyectado >= 100 && delProyectado <= 150 && esMalaProductora) {
            aptitud = "ADELANTAR";
            razon = `PRIMIPARA L1, DEL proy.=${delProyectado}, prod baja ${prodRef.toFixed(1)}L(${prodLabel}) (<1.5). Adelantar cubricion.`;
          } else if (delProyectado >= 100 && delProyectado <= 150) {
            aptitud = "NO_APTA";
            razon = `PRIMIPARA L1, DEL proy.=${delProyectado}, produce ${prodRef.toFixed(1)}L(${prodLabel}). Aun produce bien, esperar.`;
          } else {
            aptitud = "NO_APTA";
            razon = `PRIMIPARA L1, DEL proy.=${delProyectado} (<100). Demasiado pronto para cubricion.`;
          }
        } else {
          // =============================================
          // REGLAS GENERALES (lactacion >= 2)
          // =============================================
          if (delProyectado < 130) {
            aptitud = "NO_APTA";
            razon = `DEL proy.=${delProyectado} (<130). Demasiado pronto. Hoy=${delHoy}, ${prodRef.toFixed(1)}L(${prodLabel}). Debe seguir en leche.`;
          } else if (delProyectado >= 130 && delProyectado < 150) {
            if (esMalaProductora) {
              aptitud = "ADELANTAR";
              razon = `DEL proy.=${delProyectado}, prod baja ${prodRef.toFixed(1)}L(${prodLabel}). No rentable, adelantar cubricion.`;
            } else {
              aptitud = "NO_APTA";
              razon = `DEL proy.=${delProyectado} (<150) pero produce ${prodRef.toFixed(1)}L(${prodLabel}). Aun es rentable, esperar.`;
            }
          } else if (delProyectado >= 150 && delProyectado <= 220) {
            if (esBuenaProductora && delProyectado < 180) {
              aptitud = "APTA";
              razon = `DEL proy.=${delProyectado}, buena prod ${prodRef.toFixed(1)}L(${prodLabel}). Franja valida. Idealmente estirar a 200+.`;
            } else if (esBuenaProductora && delProyectado >= 180) {
              aptitud = "IDEAL";
              razon = `DEL proy.=${delProyectado}, ${prodRef.toFixed(1)}L(${prodLabel}). Zona ideal para buena productora.`;
            } else if (esMediaProductora) {
              aptitud = "APTA";
              razon = `DEL proy.=${delProyectado}, prod media ${prodRef.toFixed(1)}L(${prodLabel}). Franja normal.`;
            } else {
              aptitud = "APTA";
              razon = `DEL proy.=${delProyectado}, prod baja ${prodRef.toFixed(1)}L(${prodLabel}). Debe entrar a cubricion.`;
            }
          } else if (delProyectado > 220) {
            aptitud = "URGENTE";
            razon = `DEL proy.=${delProyectado} (>220). URGENTE. Ya deberia haberse cubierto. Riesgo de secarse sin prenar.`;
          }
        }

        // Flags adicionales
        const flags = [];
        if (vaciaCount >= 2) flags.push(`🔴 DOBLE VACÍA (${vaciaCount}x)`);
        if (abortosC > 0) flags.push(`⚠️ ${abortosC} aborto(s)`);
        if (cond > 6.5) flags.push(`🔴 Cond MUY alta ${cond.toFixed(2)} — NO inseminar`);
        else if (cond > 6.0) flags.push(`⚠️ Cond alta ${cond.toFixed(2)}`);
        if (anots.length > 0) flags.push(`📋 ${anots.length} anotación(es) vet`);

        allCandidates.push({ crotal: c.crotal, litros, prodRef, litrosTotalesLact, promedioTotal, prom10d, delHoy, delProyectado, lact, cond, lote: c.lote?.nombre || '?', aptitud, razon, flags, vaciaCount, abortosC });
      });

      // Vacías del Lote 6
      const lote6c = data.lotes.find(l => l.nombre && l.nombre.includes("Lote 6"));
      if (lote6c) {
        data.cabras.filter(c => c.lote_id === lote6c.id).forEach(c => {
          const ecos = data.ecografias.filter(e => e.cabra?.crotal === c.crotal);
          if (ecos.length === 0) return;
          const lastEco = ecos.sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
          if (lastEco.resultado !== 'vacia') return;
          const p = prodByCabraId[c.id];
          const delHoy = p?.dia_lactacion || c.dias_en_leche || 0;
          const delProyectado = delHoy + diasHastaMachos;
          allCandidates.push({
            crotal: c.crotal, litros: p?.litros || 0, litrosTotalesLact: p?.litros_totales_lactacion || 0,
            promedioTotal: p?.promedio_total || p?.media_total || 0, prom10d: p?.promedio_10d || p?.media_10d || 0,
            delHoy, delProyectado,
            lact: c.num_lactaciones || 0, cond: p?.conductividad || 0,
            lote: "Lote 6 (VACÍA)", aptitud: delProyectado >= 130 ? "APTA" : "NO_APTA",
            razon: `Vacía en eco ${lastEco.fecha}, debe entrar a cubrición. DEL proy.=${delProyectado}`,
            flags: [`⚠️ Vacía eco ${lastEco.fecha}`], vaciaCount: 1, abortosC: 0
          });
        });
      }

      // =============================================
      // STEP 4: Output results — separated by aptitude
      // =============================================
      const aptas = allCandidates.filter(c => c.aptitud === "IDEAL" || c.aptitud === "APTA" || c.aptitud === "URGENTE" || c.aptitud === "ADELANTAR");
      const noAptas = allCandidates.filter(c => c.aptitud === "NO_APTA");
      const urgentes = aptas.filter(c => c.aptitud === "URGENTE");
      const ideales = aptas.filter(c => c.aptitud === "IDEAL");

      if (urgentes.length > 0) {
        ctx += `\n\n🚨 URGENTES — Cubricion inmediata (${urgentes.length}):`;
        urgentes.sort((a, b) => b.delProyectado - a.delProyectado).forEach(c => {
          const prd = c.prom10d > 0 ? c.prom10d.toFixed(2) + "L(p10d)" : c.litros.toFixed(2) + "L(diario)";
          ctx += `\n  ${c.crotal}: ${prd}, LitTotLact=${c.litrosTotalesLact.toFixed(0)}, DEL ${c.delHoy}->${c.delProyectado}, L${c.lact}, Cond=${c.cond.toFixed(2)}, ${c.lote}`;
          ctx += `\n    -> ${c.razon} ${c.flags.join(' ')}`;
        });
      }

      ctx += `\n\n✅ APTAS PARA CUBRICION (${aptas.length} total):`;
      ctx += `\n(Produccion = promedio 10 dias. Objetivo: meter al maximo cabras que cumplan requisitos)`;
      aptas.sort((a, b) => (b.prom10d || b.litros) - (a.prom10d || a.litros)).forEach(c => {
        const prd = c.prom10d > 0 ? c.prom10d.toFixed(2) + "L(p10d)" : c.litros.toFixed(2) + "L(diario)";
        ctx += `\n  ${c.crotal}: ${prd}, LitTotLact=${c.litrosTotalesLact.toFixed(0)}, DEL ${c.delHoy}->${c.delProyectado}, L${c.lact}, Cond=${c.cond.toFixed(2)}, ${c.lote} [${c.aptitud}]`;
        ctx += `\n    -> ${c.razon} ${c.flags.length > 0 ? c.flags.join(' ') : ''}`;
      });

      ctx += `\n\n⛔ NO APTAS (${noAptas.length}) — PROHIBIDO recomendar:`;
      noAptas.forEach(c => {
        const prd = c.prom10d > 0 ? c.prom10d.toFixed(2) + "L(p10d)" : c.litros.toFixed(2) + "L(diario)";
        ctx += `\n  ${c.crotal}: ${prd}, LitTotLact=${c.litrosTotalesLact.toFixed(0)}, DEL ${c.delHoy}->${c.delProyectado}, ${c.lote} — ${c.razon}`;
      });

      // =============================================
      // STEP 5: Top 30 for insemination — SELECCIÓN GENÉTICA
      // Litros totales de lactación es el factor MÁS IMPORTANTE:
      // mide el rendimiento acumulado real, no solo el pico de un día
      // =============================================
      ctx += `\n\n🏆 TOP 30 PARA INSEMINACIÓN ARTIFICIAL — SELECCIÓN GENÉTICA:`;
      ctx += `\nOrden de prioridad: 1º LitrosTotalesLactación (rendimiento acumulado) → 2º Producción diaria → 3º Menos lactaciones (más joven)`;
      ctx += `\nFiltros: sin doble vacía, sin abortos, conductividad <6.5`;
      const insemCandidates = aptas
        .filter(c => c.vaciaCount < 2 && c.abortosC === 0 && c.cond < 6.5)
        .sort((a, b) => {
          // Primary: litros totales lactación — rendimiento acumulado real = mejor genética
          if (a.litrosTotalesLact > 0 || b.litrosTotalesLact > 0) {
            if (Math.abs(b.litrosTotalesLact - a.litrosTotalesLact) > 10) return b.litrosTotalesLact - a.litrosTotalesLact;
          }
          // Secondary: producción diaria actual
          if (Math.abs(b.litros - a.litros) > 0.3) return b.litros - a.litros;
          // Tertiary: menos lactaciones = más joven = mejor inversión genética
          return a.lact - b.lact;
        });
      
      ctx += `\nCandidatas limpias para IA: ${insemCandidates.length}`;
      insemCandidates.slice(0, 35).forEach((c, i) => {
        const prd = c.prom10d > 0 ? c.prom10d.toFixed(2) + "L(p10d)" : c.litros.toFixed(2) + "L(diario)";
        ctx += `\n  ${i + 1}. ${c.crotal}: LitTotLact=${c.litrosTotalesLact.toFixed(0)}, ${prd}, DEL ${c.delHoy}->${c.delProyectado}, L${c.lact}, Cond=${c.cond.toFixed(2)}, ${c.lote}`;
      });

      ctx += `\n\n⛔⛔⛔ REGLA ABSOLUTA: SOLO recomendar cabras de la lista de APTAS.`;
      ctx += `\nLas NO APTAS tienen DEL proyectado demasiado bajo o producen demasiado bien para cortarles la lactacion.`;
      ctx += `\nSi una cabra da 4L(prom10d) y tiene DEL proyectado <130 -> NO SE TOCA. Esta en plena produccion.`;
      ctx += `\nPRODUCCION = promedio 10 dias (p10d). Es mas fiable que la produccion de un solo dia.`;
      ctx += `\nPRIMIPARAS (L1): >150 DEL entran TODAS. 100-150 DEL con <1.5L(p10d) se adelantan.`;
      ctx += `\nPara inseminacion, LitrosTotalesLactacion manda. El acumulado indica buena genetica. ⛔⛔⛔`;
    }
    
    // Include lote details when relevant
    if (msg.includes("lote") || msg.includes("grupo") || msg.includes("manada") || msg.includes("distribu") || msg.includes("secand") || msg.includes("pariend")) {
      ctx += `\n\nDETALLE POR LOTE:`;
      data.lotes.filter(l => l.cabras > 0).sort((a, b) => b.cabras - a.cabras).forEach(l => {
        const loteProd = todayProd.filter(p => { const c = data.cabras.find(cc => cc.id === p.cabra_id); return c && c.lote_id === l.id; });
        const totalL = loteProd.reduce((s, p) => s + (p.litros || 0), 0);
        const mediaL = loteProd.length > 0 ? totalL / loteProd.length : 0;
        ctx += `\n  ${l.nombre} [${l.estado || 'produccion'}]: ${l.cabras} cabras, ${totalL.toFixed(1)}L total, ${mediaL.toFixed(2)}L/cabra media`;
      });
    }
    
    // Include anotaciones veterinarias when relevant
    if (msg.includes("anota") || msg.includes("veterinar") || msg.includes("vet") || msg.includes("observ") || msg.includes("nota") || msg.includes("bulto") || msg.includes("pezuña") || msg.includes("enferm") || msg.includes("sanid")) {
      const anotaciones = data.anotaciones || [];
      if (anotaciones.length > 0) {
        ctx += `\n\nANOTACIONES VETERINARIAS (${anotaciones.length}):`;
        anotaciones.slice(0, 30).forEach(a => {
          ctx += `\n  [${a.fecha}] ${a.cabra?.crotal || "GENERAL"} (${a.tipo}): ${a.texto}`;
        });
      }
    }
    
    // Include alertas sanitarias when relevant
    if (msg.includes("alerta") || msg.includes("sanid") || msg.includes("mastitis") || msg.includes("conductiv") || msg.includes("problema")) {
      const alertas = data.alertasSanitarias || [];
      const activas = alertas.filter(a => a.estado === "activa");
      if (activas.length > 0) {
        ctx += `\n\nALERTAS SANITARIAS ACTIVAS (${activas.length}):`;
        activas.forEach(a => {
          ctx += `\n  [${a.fecha}] ${a.titulo} (${a.severidad}): ${a.descripcion || ''}`;
          if (a.cabras_afectadas?.length) ctx += ` → Cabras: ${a.cabras_afectadas.join(', ')}`;
        });
      }
    }
    
    // Include historical comparison when relevant
    if (msg.includes("histor") || msg.includes("tendencia") || msg.includes("evoluci") || msg.includes("compar") || msg.includes("ayer") || msg.includes("semana") || msg.includes("bajad") || msg.includes("subid") || msg.includes("cambio")) {
      const allDates = [...new Set(prod.map(p => p.fecha))].sort((a, b) => b.localeCompare(a));
      if (allDates.length >= 2) {
        const prevDate = allDates[1];
        const prevDayProd = prod.filter(p => p.fecha === prevDate);
        ctx += `\n\nCOMPARACIÓN ${latestDate} vs ${prevDate}:`;
        const todayTotal = todayProd.reduce((s, p) => s + (p.litros || 0), 0);
        const prevTotal = prevDayProd.reduce((s, p) => s + (p.litros || 0), 0);
        ctx += `\n  Hoy: ${todayTotal.toFixed(1)}L (${todayProd.length} cabras) → Ayer: ${prevTotal.toFixed(1)}L (${prevDayProd.length} cabras)`;
        // Biggest drops
        const drops = [];
        todayProd.forEach(p => {
          const prev = prevDayProd.find(pp => pp.cabra_id === p.cabra_id);
          if (prev && prev.litros > 0.5 && p.litros < prev.litros * 0.7) {
            const cabra = data.cabras.find(c => c.id === p.cabra_id);
            drops.push({ crotal: cabra?.crotal || '?', hoy: p.litros, ayer: prev.litros, cambio: ((p.litros - prev.litros) / prev.litros * 100) });
          }
        });
        if (drops.length > 0) {
          drops.sort((a, b) => a.cambio - b.cambio);
          ctx += `\n  Mayores caídas (>30%): ${drops.slice(0, 15).map(d => `${d.crotal}: ${d.ayer.toFixed(1)}→${d.hoy.toFixed(1)}L (${d.cambio.toFixed(0)}%)`).join('; ')}`;
        }
      }
    }
    
    // Specific goat lookup — FULL LIFE HISTORY
    const crotalMatch = userMsg.match(/\b(\d{5,6})\b/);
    if (crotalMatch) {
      const crotal = crotalMatch[1];
      const cabra = data.cabras.find(c => c.crotal === crotal);
      const partosC = data.partos.filter(p => p.cabra?.crotal === crotal);
      const ecosC = data.ecografias.filter(e => e.cabra?.crotal === crotal);
      const tratsC = data.tratamientos.filter(t => t.cabra?.crotal === crotal);
      const cubsC = data.cubriciones.filter(c => c.cabra?.crotal === crotal);
      const criasC = data.crias.filter(c => c.madre?.crotal === crotal);
      const anotC = (data.anotaciones || []).filter(a => a.cabra_id === cabra?.id);
      
      ctx += `\n\n${'='.repeat(50)}\nFICHA COMPLETA CABRA ${crotal}\n${'='.repeat(50)}`;
      
      if (!cabra) {
        ctx += `\n⚠️ Esta cabra NO existe en el sistema.`;
      } else {
        // === IDENTIDAD ===
        ctx += `\n\n## IDENTIDAD`;
        ctx += `\nCrotal: ${cabra.crotal}`;
        ctx += `\nRIIA: ${cabra.riia || 'sin datos'}`;
        ctx += `\nID Electrónico: ${cabra.id_electronico || 'sin datos'}`;
        ctx += `\nFecha nacimiento: ${cabra.fecha_nacimiento || 'sin datos'}`;
        const edad = cabra.fecha_nacimiento ? Math.floor((new Date() - new Date(cabra.fecha_nacimiento)) / (365.25 * 86400000)) : null;
        if (edad !== null) ctx += ` (${edad} años)`;
        ctx += `\nRaza: ${cabra.raza || 'Murciano-Granadina'}`;
        ctx += `\nEstado: ${cabra.estado}`;
        ctx += `\nLote: ${cabra.lote?.nombre || 'sin lote'}`;
        ctx += `\nLactaciones: ${cabra.num_lactaciones || 0}`;
        ctx += `\nDEL actual: ${cabra.dias_en_leche || 0}`;
        
        // === PRODUCCIÓN HISTÓRICA (TODOS los días) ===
        const allProdC = prod.filter(p => p.cabra_id === cabra.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
        ctx += `\n\n## PRODUCCIÓN — ${allProdC.length} registros en ${[...new Set(allProdC.map(p => p.fecha))].length} días`;
        
        if (allProdC.length > 0) {
          // Latest day
          const latest = allProdC[0];
          ctx += `\nÚltimo registro (${latest.fecha}): ${latest.litros}L, Cond=${latest.conductividad}, Flujo=${latest.flujo}, Tiempo=${latest.tiempo_ordeno}min, DEL=${latest.dia_lactacion}, Prom10d=${latest.promedio_10d || latest.media_10d || '-'}, LitTotalesLact=${latest.litros_totales_lactacion}`;
          
          // Day by day history
          ctx += `\nHistorial diario:`;
          allProdC.slice(0, 30).forEach(p => {
            ctx += `\n  ${p.fecha}: ${p.litros}L, Cond=${p.conductividad || '-'}, Flujo=${p.flujo || '-'}, DEL=${p.dia_lactacion}`;
          });
          
          // Trend analysis
          const litrosArr = allProdC.map(p => p.litros || 0);
          const condArr = allProdC.filter(p => p.conductividad > 0).map(p => p.conductividad);
          const flujoArr = allProdC.filter(p => p.flujo > 0).map(p => p.flujo);
          
          if (litrosArr.length >= 2) {
            const avgRecent = litrosArr.slice(0, Math.min(3, litrosArr.length)).reduce((s, v) => s + v, 0) / Math.min(3, litrosArr.length);
            const avgOlder = litrosArr.slice(-Math.min(3, litrosArr.length)).reduce((s, v) => s + v, 0) / Math.min(3, litrosArr.length);
            const trend = avgOlder > 0 ? ((avgRecent - avgOlder) / avgOlder * 100) : 0;
            ctx += `\n\nTENDENCIA PRODUCCIÓN: Reciente=${avgRecent.toFixed(2)}L vs Anterior=${avgOlder.toFixed(2)}L → ${trend >= 0 ? '+' : ''}${trend.toFixed(1)}%`;
          }
          if (condArr.length >= 2) {
            const condRecent = condArr.slice(0, Math.min(3, condArr.length)).reduce((s, v) => s + v, 0) / Math.min(3, condArr.length);
            const condOlder = condArr.slice(-Math.min(3, condArr.length)).reduce((s, v) => s + v, 0) / Math.min(3, condArr.length);
            ctx += `\nTENDENCIA CONDUCTIVIDAD: Reciente=${condRecent.toFixed(2)} vs Anterior=${condOlder.toFixed(2)} ${condRecent > condOlder ? '⚠️ SUBIENDO' : '✅ Estable/bajando'}`;
          }
          if (flujoArr.length >= 2) {
            const flujoRecent = flujoArr.slice(0, Math.min(3, flujoArr.length)).reduce((s, v) => s + v, 0) / Math.min(3, flujoArr.length);
            ctx += `\nFLUJO RECIENTE: ${flujoRecent.toFixed(3)} L/min ${flujoRecent < 0.1 ? '⚠️ MUY BAJO' : ''}`;
          }
          
          // Production stats
          const avgTotal = litrosArr.reduce((s, v) => s + v, 0) / litrosArr.length;
          const maxProd = Math.max(...litrosArr);
          const minProd = Math.min(...litrosArr);
          ctx += `\nESTADÍSTICAS: Media=${avgTotal.toFixed(2)}L, Máx=${maxProd.toFixed(2)}L, Mín=${minProd.toFixed(2)}L`;
        } else {
          ctx += `\nSin registros de producción — probablemente chota joven o no ordeñada aún.`;
        }
        
        // === REPRODUCCIÓN ===
        ctx += `\n\n## REPRODUCCIÓN`;
        if (cubsC.length > 0) {
          ctx += `\nCubriciones (${cubsC.length}):`;
          cubsC.forEach(c => ctx += `\n  ${c.fecha_entrada}: ${c.metodo || '?'}, Paridera: ${c.paridera?.nombre || '?'}, Macho: ${c.macho?.crotal || '?'}`);
        } else ctx += `\nCubriciones: ninguna registrada`;
        
        if (ecosC.length > 0) {
          ctx += `\nEcografías (${ecosC.length}):`;
          ecosC.forEach(e => ctx += `\n  ${e.fecha}: ${e.resultado} (${e.paridera?.nombre || '?'})`);
          const vaciaCount = ecosC.filter(e => e.resultado === 'vacia').length;
          if (vaciaCount >= 2) ctx += `\n  🔴 DOBLE VACÍA — ${vaciaCount} ecografías vacías`;
          else if (vaciaCount === 1) ctx += `\n  ⚠️ 1 ecografía vacía registrada`;
        } else ctx += `\nEcografías: ninguna registrada`;
        
        if (partosC.length > 0) {
          ctx += `\nPartos (${partosC.length}):`;
          partosC.forEach(p => {
            ctx += `\n  ${p.fecha}: ${p.tipo}${p.tipo === 'aborto' ? ' ⚠️' : ''}, ${p.num_crias} crías (${p.num_hembras || 0}H ${p.num_machos || 0}M), Paridera: ${p.paridera?.nombre || '?'}`;
          });
          const abortos = partosC.filter(p => p.tipo === 'aborto').length;
          if (abortos > 0) ctx += `\n  🔴 ${abortos} ABORTO(S) registrado(s)`;
        } else ctx += `\nPartos: ninguno registrado`;
        
        if (criasC.length > 0) {
          ctx += `\nCrías hembra: ${criasC.map(c => `peseta ${c.peseta} (${c.fecha_nacimiento || '?'})`).join(', ')}`;
        }
        
        // === SANIDAD ===
        ctx += `\n\n## SANIDAD`;
        if (tratsC.length > 0) {
          ctx += `\nTratamientos (${tratsC.length}):`;
          tratsC.forEach(t => ctx += `\n  ${t.fecha}: ${t.tipo} — ${t.producto || 'sin producto'}`);
        } else ctx += `\nTratamientos: ninguno registrado`;
        
        if (anotC.length > 0) {
          ctx += `\nAnotaciones veterinarias (${anotC.length}):`;
          anotC.forEach(a => ctx += `\n  [${a.fecha}] (${a.tipo}): ${a.texto}`);
        } else ctx += `\nAnotaciones vet: ninguna`;
        
        // === VALORACIÓN AUTOMÁTICA ===
        ctx += `\n\n## SEÑALES DE ALERTA`;
        const flags = [];
        if (cabra.num_lactaciones >= 6) flags.push(`🔴 ${cabra.num_lactaciones} lactaciones — animal viejo`);
        if (allProdC.length > 0 && allProdC[0].litros < 1.0 && (cabra.dias_en_leche || 0) > 60) flags.push(`🔴 Producción muy baja (${allProdC[0].litros}L) con ${cabra.dias_en_leche} DEL`);
        if (allProdC.length > 0 && allProdC[0].conductividad > 6.0) flags.push(`🔴 Conductividad alta: ${allProdC[0].conductividad} — posible mastitis`);
        if (allProdC.length > 0 && allProdC[0].flujo > 0 && allProdC[0].flujo < 0.1) flags.push(`⚠️ Flujo muy bajo: ${allProdC[0].flujo}`);
        if (ecosC.filter(e => e.resultado === 'vacia').length >= 2) flags.push(`🔴 Doble vacía — problemas de fertilidad`);
        if (partosC.filter(p => p.tipo === 'aborto').length > 0) flags.push(`⚠️ Historial de aborto(s)`);
        if (anotC.length > 0) flags.push(`📋 Tiene ${anotC.length} anotación(es) veterinaria(s) — revisar`);
        if (flags.length === 0) flags.push(`✅ Sin señales de alerta detectadas`);
        flags.forEach(f => ctx += `\n${f}`);
        
        ctx += `\n\nCon toda esta información, analiza el estado general de esta cabra. Si ves señales preocupantes, da una recomendación concreta (seguir, vigilar, tratar, o descartar).`;
      }
    }
    
    return ctx;
  };
  
  const send = async () => { 
    if (!q.trim()) return; 
    const userMsg = q;
    setMs(p => [...p, { role: "user", text: userMsg }]); 
    setQ(""); 
    setLd(true);
    const ctx = buildRichContext(userMsg);
    const response = await askClaude(userMsg, ctx);
    setMs(p => [...p, { role: "assistant", text: response }]);
    setLd(false);
  };
  const exs = ["Dime las 40 mejores cabras", "¿Qué cabras han salido vacías dos veces?", "Ficha de la cabra 057997", "Cabras del Lote 3 sin vacuna", "Resumen paridera febrero", "Candidatas a cubrición anticipada"];
  return (
    <div style={{ display: "flex", gap: 20, height: "calc(100vh - 155px)" }}>
      <div style={{ flex: 1, background: "#FFF", border: "1px solid #EEF2F6", borderRadius: 16, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "13px 20px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#059669", animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: 13, fontWeight: 700 }}>Asistente Peñas Cercadas</span>
          </div>
          {ms.length > 1 && saveChat && (
            <button onClick={() => setShowSave(!showSave)} style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer", color: "#059669", fontWeight: 600 }}>
              💾 Guardar
            </button>
          )}
        </div>
        {showSave && (
          <div style={{ padding: "10px 20px", borderBottom: "1px solid #F1F5F9", background: "#F0FDF4", display: "flex", gap: 8, alignItems: "center" }}>
            <input value={chatName} onChange={e => setChatName(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && chatName.trim()) { saveChat(chatName, ms, "consultas"); setChatName(""); setShowSave(false); } }} placeholder="Nombre del chat..." style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "2px solid #BBF7D0", fontSize: 12, outline: "none", background: "#FFF", boxSizing: "border-box" }} autoFocus />
            <button onClick={() => { if (chatName.trim()) { saveChat(chatName, ms, "consultas"); setChatName(""); setShowSave(false); } }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#059669", color: "#FFF", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Guardar</button>
            <button onClick={() => setShowSave(false)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#FFF", color: "#94A3B8", fontSize: 12, cursor: "pointer" }}>×</button>
          </div>
        )}
        <div style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          {ms.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: m.role === "user" ? "80%" : "90%" }}>
              <div style={{ background: m.role === "user" ? "#FEF9EE" : "#F8FAFC", border: `1px solid ${m.role === "user" ? "#FDE68A" : "#F1F5F9"}`, borderRadius: 13, padding: "12px 17px", fontSize: 13.5, color: "#334155", lineHeight: 1.6 }}>
                {m.role === "assistant" ? <FormattedMessage text={m.text} /> : m.text}
              </div>
              {m.role === "assistant" && (
                <div style={{ display: "flex", gap: 6, marginTop: 4, justifyContent: "flex-end" }}>
                  <button onClick={() => downloadPDF(m.text, ms[i - 1]?.text || "Consulta")} title="Descargar PDF"
                    style={{ background: "transparent", border: "1px solid #E2E8F0", borderRadius: 6, padding: "3px 8px", fontSize: 10.5, color: "#94A3B8", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#E8950A"; e.currentTarget.style.color = "#E8950A"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.color = "#94A3B8"; }}>
                    {"📄"} PDF
                  </button>
                  <button onClick={() => downloadExcel(m.text, ms[i - 1]?.text || "Consulta")} title="Descargar Excel"
                    style={{ background: "transparent", border: "1px solid #E2E8F0", borderRadius: 6, padding: "3px 8px", fontSize: 10.5, color: "#94A3B8", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#059669"; e.currentTarget.style.color = "#059669"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.color = "#94A3B8"; }}>
                    {"📊"} Excel
                  </button>
                </div>
              )}
            </div>
          ))}
          {ld && <div style={{ alignSelf: "flex-start", padding: "13px 17px", background: "#F8FAFC", borderRadius: 13, border: "1px solid #F1F5F9" }}><div style={{ display: "flex", gap: 5 }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#E8950A", animation: `bounce 1.4s ease ${i * .2}s infinite`, opacity: .5 }} />)}</div></div>}
        </div>
        <div style={{ padding: "13px 16px", borderTop: "1px solid #F1F5F9", display: "flex", gap: 10 }}>
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Pregunta..."
            style={{ flex: 1, background: "#F8FAFC", border: "2px solid #E2E8F0", borderRadius: 11, padding: "12px 16px", color: "#1E293B", fontSize: 13.5, outline: "none", boxSizing: "border-box" }}
            onFocus={e => e.target.style.borderColor = "#E8950A"} onBlur={e => e.target.style.borderColor = "#E2E8F0"} />
          <button onClick={send} style={{ background: "linear-gradient(135deg, #E8950A, #CA8106)", border: "none", borderRadius: 11, padding: "12px 20px", color: "#FFF", fontWeight: 700, cursor: "pointer" }}>Consultar</button>
        </div>
      </div>
      <div style={{ width: 250 }}>
        <Card><div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".05em" }}>💡 Ejemplos</div>
          {exs.map((e, i) => <div key={i} onClick={() => setQ(e)} style={{ fontSize: 11.5, color: "#64748B", padding: "8px 11px", background: "#FAFAFA", border: "1px solid #F1F5F9", borderRadius: 7, cursor: "pointer", marginBottom: 5, lineHeight: 1.35 }}
            onMouseEnter={e => { e.currentTarget.style.color = "#E8950A"; e.currentTarget.style.borderColor = "#FDE68A"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#64748B"; e.currentTarget.style.borderColor = "#F1F5F9"; }}>{e}</div>)}
        </Card>
      </div>
    </div>
  );
}

function ConfigPage({ data, refresh }) {
  const [cfgMsg, setCfgMsg] = useState("");
  const [cfgMsgs, setCfgMsgs] = useState([{ role: "assistant", text: "Soy el asistente de configuración. Puedo ayudarte a programar eventos, modificar fechas, y gestionar el calendario de la granja. Dime qué necesitas — por ejemplo: 'La desparasitación va a ser el 28 de marzo' o 'Añade ecografías del lote 6 para el 26 de abril'." }]);
  const [cfgTab, setCfgTab] = useState("calendario");
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEvt, setNewEvt] = useState({ titulo: "", fecha: "", tipo: "general", descripcion: "", urgente: false });
  const [editProto, setEditProto] = useState(null);
  const [showAddProto, setShowAddProto] = useState(false);
  const [newProto, setNewProto] = useState({ fase: "preparto", momento: "", tratamiento: "", producto: "", dosis: "", destino_animal: "todos", dias_desde_nacimiento: "", notas: "" });
  const dataCtx = buildDataContext(data);
  
  const eventosCtx = (data.eventos || []).map(e => `- ${e.fecha}: ${e.titulo} (${e.tipo}${e.urgente ? ', URGENTE' : ''}${e.completado ? ', COMPLETADO' : ''})`).join('\n');

  const sendCfg = async () => {
    if (!cfgMsg.trim()) return;
    const userMsg = cfgMsg;
    setCfgMsgs(p => [...p, { role: "user", text: userMsg }]);
    setCfgMsg("");
    const ctx = dataCtx + "\n\nEVENTOS ACTUALES DEL CALENDARIO:\n" + eventosCtx + "\n\nIMPORTANTE: Cuando el usuario quiera añadir, modificar o eliminar un evento del calendario, confirma lo que has entendido y dile que lo añada desde el formulario del calendario o que tú lo harás. Sugiere la fecha, el tipo (sanidad/cubricion/ecografia/parto/identificacion/general) y si es urgente.";
    const response = await askClaude(userMsg, ctx);
    setCfgMsgs(p => [...p, { role: "assistant", text: response }]);
  };

  const saveEvent = async () => {
    if (!newEvt.titulo || !newEvt.fecha) return;
    const { error } = await supabase.from("evento_calendario").insert([{
      titulo: newEvt.titulo,
      fecha: newEvt.fecha,
      tipo: newEvt.tipo,
      descripcion: newEvt.descripcion,
      urgente: newEvt.urgente,
    }]);
    if (!error) {
      setNewEvt({ titulo: "", fecha: "", tipo: "general", descripcion: "", urgente: false });
      setShowAddEvent(false);
      refresh();
    }
  };

  const toggleComplete = async (id, current) => {
    await supabase.from("evento_calendario").update({ completado: !current }).eq("id", id);
    refresh();
  };

  const deleteEvent = async (id) => {
    await supabase.from("evento_calendario").delete().eq("id", id);
    refresh();
  };

  const saveProto = async () => {
    if (!newProto.tratamiento || !newProto.fase) return;
    const row = {
      fase: newProto.fase, momento: newProto.momento, tratamiento: newProto.tratamiento,
      producto: newProto.producto, dosis: newProto.dosis, destino_animal: newProto.destino_animal,
      dias_desde_nacimiento: newProto.dias_desde_nacimiento ? parseInt(newProto.dias_desde_nacimiento) : null,
      notas: newProto.notas, obligatorio: true, activo: true,
    };
    const { error } = await supabase.from("protocolo_veterinario").insert([row]);
    if (!error) {
      setNewProto({ fase: "preparto", momento: "", tratamiento: "", producto: "", dosis: "", destino_animal: "todos", dias_desde_nacimiento: "", notas: "" });
      setShowAddProto(false);
      refresh();
    }
  };

  const updateProto = async () => {
    if (!editProto || !editProto.tratamiento) return;
    const { id, created_at, ...updates } = editProto;
    const { error } = await supabase.from("protocolo_veterinario").update(updates).eq("id", id);
    if (!error) { setEditProto(null); refresh(); }
  };

  const deleteProto = async (id) => {
    await supabase.from("protocolo_veterinario").delete().eq("id", id);
    refresh();
  };

  // Calendar logic
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDayOfWeek = (new Date(calYear, calMonth, 1).getDay() + 6) % 7; // Monday = 0
  const monthEvents = (data.eventos || []).filter(e => {
    const d = new Date(e.fecha);
    return d.getMonth() === calMonth && d.getFullYear() === calYear;
  });
  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const dayNames = ["L", "M", "X", "J", "V", "S", "D"];
  const tipoColors = { cubricion: "#EA580C", sanidad: "#DC2626", ecografia: "#7C3AED", parto: "#059669", identificacion: "#0891B2", general: "#E8950A" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* Tab selector */}
      <div style={{ display: "flex", gap: 4, background: "#F1F5F9", borderRadius: 12, padding: 4, width: "fit-content" }}>
        {[{ id: "calendario", l: "📅 Calendario" }, { id: "lotes", l: "🐐 Lotes" }, { id: "reglas", l: "📏 Reglas" }, { id: "protocolo", l: "🏥 Protocolo" }, { id: "parametros", l: "⚙️ Parámetros" }].map(t =>
          <button key={t.id} onClick={() => setCfgTab(t.id)} style={{ padding: "8px 18px", borderRadius: 9, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", background: cfgTab === t.id ? "#FFF" : "transparent", color: cfgTab === t.id ? "#E8950A" : "#64748B", boxShadow: cfgTab === t.id ? "0 1px 4px rgba(0,0,0,0.06)" : "none" }}>{t.l}</button>
        )}
      </div>

      {cfgTab === "calendario" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Calendar Grid */}
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <button onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }} style={{ width: 34, height: 34, borderRadius: 9, border: "1px solid #E2E8F0", background: "#F8FAFC", cursor: "pointer", fontSize: 16, color: "#64748B", display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#1E293B" }}>{monthNames[calMonth]} {calYear}</div>
                <button onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }} style={{ width: 34, height: 34, borderRadius: 9, border: "1px solid #E2E8F0", background: "#F8FAFC", cursor: "pointer", fontSize: 16, color: "#64748B", display: "flex", alignItems: "center", justifyContent: "center" }}>→</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                {dayNames.map(d => <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "#94A3B8", padding: "6px 0" }}>{d}</div>)}
                {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dayEvts = monthEvents.filter(e => new Date(e.fecha).getDate() === day);
                  const isToday = day === new Date().getDate() && calMonth === new Date().getMonth() && calYear === new Date().getFullYear();
                  return (
                    <div key={day} style={{
                      minHeight: 52, padding: "4px 6px", borderRadius: 8, fontSize: 12,
                      background: isToday ? "#FEF9EE" : dayEvts.length > 0 ? "#FAFAFA" : "transparent",
                      border: isToday ? "2px solid #E8950A" : "1px solid #F1F5F9",
                    }}>
                      <div style={{ fontWeight: isToday ? 700 : 400, color: isToday ? "#E8950A" : "#475569", fontSize: 12 }}>{day}</div>
                      {dayEvts.map((ev, j) => (
                        <div key={j} style={{
                          fontSize: 9, padding: "2px 4px", borderRadius: 4, marginTop: 2,
                          background: `${tipoColors[ev.tipo] || "#94A3B8"}15`,
                          color: tipoColors[ev.tipo] || "#94A3B8",
                          fontWeight: 600, lineHeight: 1.2,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>{ev.titulo}</div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Events list */}
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <SectionTitle icon="📋" text="Eventos Programados" />
                <button onClick={() => setShowAddEvent(!showAddEvent)} style={{
                  padding: "7px 16px", borderRadius: 9, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  background: "linear-gradient(135deg, #E8950A, #CA8106)", color: "#FFF",
                }}>+ Añadir evento</button>
              </div>

              {showAddEvent && (
                <div style={{ background: "#FAFAFA", border: "1px solid #EEF2F6", borderRadius: 12, padding: 18, marginBottom: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                    <input value={newEvt.titulo} onChange={e => setNewEvt({ ...newEvt, titulo: e.target.value })} placeholder="Título del evento" style={{ padding: "10px 14px", borderRadius: 9, border: "2px solid #E2E8F0", fontSize: 13, color: "#1E293B", outline: "none", background: "#FFF", boxSizing: "border-box" }} onFocus={e => e.target.style.borderColor = "#E8950A"} onBlur={e => e.target.style.borderColor = "#E2E8F0"} />
                    <input type="date" value={newEvt.fecha} onChange={e => setNewEvt({ ...newEvt, fecha: e.target.value })} style={{ padding: "10px 14px", borderRadius: 9, border: "2px solid #E2E8F0", fontSize: 13, color: "#1E293B", outline: "none", background: "#FFF", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, marginBottom: 10 }}>
                    <select value={newEvt.tipo} onChange={e => setNewEvt({ ...newEvt, tipo: e.target.value })} style={{ padding: "10px 14px", borderRadius: 9, border: "2px solid #E2E8F0", fontSize: 13, color: "#1E293B", outline: "none", background: "#FFF" }}>
                      <option value="general">General</option>
                      <option value="sanidad">Sanidad</option>
                      <option value="cubricion">Cubrición</option>
                      <option value="ecografia">Ecografía</option>
                      <option value="parto">Parto</option>
                      <option value="identificacion">Identificación</option>
                    </select>
                    <input value={newEvt.descripcion} onChange={e => setNewEvt({ ...newEvt, descripcion: e.target.value })} placeholder="Descripción (opcional)" style={{ padding: "10px 14px", borderRadius: 9, border: "2px solid #E2E8F0", fontSize: 13, color: "#1E293B", outline: "none", background: "#FFF", boxSizing: "border-box" }} />
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#64748B", cursor: "pointer" }}>
                      <input type="checkbox" checked={newEvt.urgente} onChange={e => setNewEvt({ ...newEvt, urgente: e.target.checked })} /> Urgente
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={saveEvent} style={{ padding: "8px 20px", borderRadius: 9, border: "none", background: "#059669", color: "#FFF", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Guardar</button>
                    <button onClick={() => setShowAddEvent(false)} style={{ padding: "8px 20px", borderRadius: 9, border: "1px solid #E2E8F0", background: "#FFF", color: "#64748B", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
                  </div>
                </div>
              )}

              {(data.eventos || []).filter(e => !e.completado).map((ev, i) => (
                <div key={i} style={{
                  display: "flex", gap: 12, alignItems: "center", padding: "10px 14px", borderRadius: 10, marginBottom: 6,
                  background: ev.urgente ? "#FEF2F2" : "#FAFAFA",
                  border: `1px solid ${ev.urgente ? "#FECACA" : "#F1F5F9"}`,
                }}>
                  <div style={{ width: 4, height: 34, borderRadius: 2, background: tipoColors[ev.tipo] || "#94A3B8", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1E293B" }}>{ev.titulo}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8" }}>
                      {new Date(ev.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
                      {ev.descripcion && ` · ${ev.descripcion}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {ev.urgente && <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 5, background: "#FEE2E2", color: "#DC2626", fontWeight: 700 }}>URGENTE</span>}
                    <button onClick={() => toggleComplete(ev.id, ev.completado)} title="Marcar completado" style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #BBF7D0", background: "#F0FDF4", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</button>
                    <button onClick={() => deleteEvent(ev.id)} title="Eliminar" style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #FECACA", background: "#FEF2F2", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                  </div>
                </div>
              ))}

              {(data.eventos || []).filter(e => e.completado).length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 8, fontWeight: 600 }}>Completados</div>
                  {(data.eventos || []).filter(e => e.completado).map((ev, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 14px", borderRadius: 10, marginBottom: 4, background: "#FAFAFA", border: "1px solid #F1F5F9", opacity: 0.6 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: "#94A3B8", textDecoration: "line-through" }}>{ev.titulo}</div>
                      </div>
                      <button onClick={() => toggleComplete(ev.id, ev.completado)} title="Desmarcar" style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid #E2E8F0", background: "#FFF", cursor: "pointer", fontSize: 11 }}>↩</button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Chat */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <ChatBox messages={cfgMsgs} input={cfgMsg} setInput={setCfgMsg} onSend={sendCfg}
              examples={["La desparasitación es el 28 de marzo", "Mueve las ecografías al 30 de abril", "¿Qué eventos tengo esta semana?"]}
              onExample={setCfgMsg}
              placeholder="Gestionar eventos y calendario..."
              height={520} />
            <Card style={{ background: "linear-gradient(135deg, #FEF9EE, #FFF7ED)", border: "1px solid #FDE68A" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#E8950A", marginBottom: 8 }}>💡 Cómo usar el calendario</div>
              <div style={{ fontSize: 11.5, color: "#78590A", lineHeight: 1.5 }}>
                Puedes añadir eventos con el botón "Añadir" o decírselo al chat. Los eventos aparecen en el dashboard y en el calendario. Marca como completados los que ya hayas hecho.
              </div>
            </Card>
          </div>
        </div>
      )}

      {cfgTab === "lotes" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20 }}>
          <Card>
            <SectionTitle icon="🐐" text="Estado de los Lotes" />
            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 16, lineHeight: 1.5 }}>
              Asigna el estado de cada lote. Los lotes marcados como <span style={{ color: "#E8950A", fontWeight: 700 }}>"Secándose"</span> se excluyen del análisis de producción (pero siguen generando alertas de conductividad).
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.lotes.sort((a, b) => a.nombre.localeCompare(b.nombre)).map(lote => {
                const estadoColors = { produccion: "#059669", secandose: "#E8950A", pariendo: "#7C3AED" };
                const estadoLabels = { produccion: "En producción", secandose: "Secándose", pariendo: "Pariendo" };
                const estadoIcons = { produccion: "🥛", secandose: "⏸️", pariendo: "🤱" };
                return (
                  <div key={lote.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: "#FAFAFA", border: "1px solid #EEF2F6", borderRadius: 12, transition: "all .2s" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${estadoColors[lote.estado || "produccion"]}12`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                        {estadoIcons[lote.estado || "produccion"]}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#1E293B" }}>{lote.nombre}</div>
                        <div style={{ fontSize: 11, color: "#94A3B8" }}>{lote.cabras} cabras · {lote.descripcion || ""}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {["produccion", "secandose", "pariendo"].map(est => (
                        <button key={est} onClick={async () => {
                          await supabase.from("lote").update({ estado: est }).eq("id", lote.id);
                          refresh();
                        }} style={{
                          padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
                          border: (lote.estado || "produccion") === est ? `2px solid ${estadoColors[est]}` : "1px solid #E2E8F0",
                          background: (lote.estado || "produccion") === est ? `${estadoColors[est]}12` : "#FFF",
                          color: (lote.estado || "produccion") === est ? estadoColors[est] : "#94A3B8",
                        }}>
                          {estadoLabels[est]}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
          <div>
            <Card style={{ background: "linear-gradient(135deg, #FEF9EE, #FFF7ED)", border: "1px solid #FDE68A" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#E8950A", marginBottom: 10 }}>💡 Cómo funciona</div>
              {[
                "🥛 En producción: aparece en todos los análisis de rendimiento, alertas, rankings",
                "⏸️ Secándose: se excluye del análisis de producción. Solo salta alerta si la conductividad es alta (posible mastitis)",
                "🤱 Pariendo: incluido en análisis pero marcado como lote en paridera. Útil para control post-parto",
              ].map((t, i) => (
                <div key={i} style={{ fontSize: 11.5, color: "#78590A", padding: "6px 0", borderBottom: i < 2 ? "1px solid #FDE68A40" : "none", lineHeight: 1.5 }}>{t}</div>
              ))}
            </Card>
          </div>
        </div>
      )}

      {cfgTab === "reglas" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <Card>
            <SectionTitle icon="📏" text={`Reglas Activas (${data.reglas.length})`} />
            {(() => {
              const cats = {};
              data.reglas.forEach(r => { cats[r.categoria] = (cats[r.categoria] || 0) + 1; });
              const cc = { sanidad: "#DC2626", reproduccion: "#7C3AED", produccion: "#059669", identificacion: "#0891B2" };
              return Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, n], i) =>
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #F8FAFC" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 7, height: 7, borderRadius: "50%", background: cc[c] || "#E8950A" }} /><span style={{ fontSize: 12.5, color: "#475569", textTransform: "capitalize" }}>{c}</span></div>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: cc[c] || "#E8950A", fontFamily: "'Space Mono', monospace" }}>{n}</span>
                </div>
              );
            })()}
          </Card>
          <Card>
            <SectionTitle icon="📋" text="Detalle de Reglas" />
            <div style={{ maxHeight: 400, overflow: "auto" }}>
              {data.reglas.map((r, i) => (
                <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid #F8FAFC", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 12.5, color: "#334155" }}>{r.nombre.replace(/_/g, ' ')}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "capitalize" }}>{r.categoria} · {r.tipo}</div>
                  </div>
                  <Badge text={r.severidad} color={r.severidad === "alta" ? "#DC2626" : r.severidad === "media" ? "#E8950A" : "#0891B2"} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {cfgTab === "protocolo" && (() => {
        const cc = { nodriza: "#DB2777", post_destete: "#E8950A", recria: "#0891B2", preparto: "#059669" };
        const faseLabels = { nodriza: "Nodriza (nacimiento)", post_destete: "Post-destete", recria: "Recría (crotalado)", preparto: "Preparto" };
        const ProtoForm = ({ values, onChange, onSave, onCancel, saveLabel }) => (
          <div style={{ background: "#FAFAFA", border: "1px solid #EEF2F6", borderRadius: 12, padding: 18, marginBottom: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <input value={values.tratamiento} onChange={e => onChange({ ...values, tratamiento: e.target.value })} placeholder="Nombre del tratamiento *" style={{ padding: "10px 14px", borderRadius: 9, border: "2px solid #E2E8F0", fontSize: 13, color: "#1E293B", outline: "none", background: "#FFF", boxSizing: "border-box" }} onFocus={e => e.target.style.borderColor = "#E8950A"} onBlur={e => e.target.style.borderColor = "#E2E8F0"} />
              <input value={values.producto} onChange={e => onChange({ ...values, producto: e.target.value })} placeholder="Producto (ej: Heptavac Plus)" style={{ padding: "10px 14px", borderRadius: 9, border: "2px solid #E2E8F0", fontSize: 13, color: "#1E293B", outline: "none", background: "#FFF", boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
              <select value={values.fase} onChange={e => onChange({ ...values, fase: e.target.value })} style={{ padding: "10px 14px", borderRadius: 9, border: "2px solid #E2E8F0", fontSize: 13, color: "#1E293B", background: "#FFF" }}>
                <option value="nodriza">Nodriza</option>
                <option value="post_destete">Post-destete</option>
                <option value="recria">Recría</option>
                <option value="preparto">Preparto</option>
              </select>
              <input value={values.momento} onChange={e => onChange({ ...values, momento: e.target.value })} placeholder="Cuándo (ej: 3 semanas post destete)" style={{ padding: "10px 14px", borderRadius: 9, border: "2px solid #E2E8F0", fontSize: 13, color: "#1E293B", outline: "none", background: "#FFF", boxSizing: "border-box" }} />
              <input value={values.dosis} onChange={e => onChange({ ...values, dosis: e.target.value })} placeholder="Dosis (ej: 2ml subcutánea)" style={{ padding: "10px 14px", borderRadius: 9, border: "2px solid #E2E8F0", fontSize: 13, color: "#1E293B", outline: "none", background: "#FFF", boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
              <select value={values.destino_animal} onChange={e => onChange({ ...values, destino_animal: e.target.value })} style={{ padding: "10px 14px", borderRadius: 9, border: "2px solid #E2E8F0", fontSize: 13, color: "#1E293B", background: "#FFF" }}>
                <option value="todos">Todos los animales</option>
                <option value="vida">Solo animales para vida</option>
                <option value="matadero">Solo animales para matadero</option>
              </select>
              <input value={values.dias_desde_nacimiento || ""} onChange={e => onChange({ ...values, dias_desde_nacimiento: e.target.value })} placeholder="Días desde nacimiento (ej: 45)" type="number" style={{ padding: "10px 14px", borderRadius: 9, border: "2px solid #E2E8F0", fontSize: 13, color: "#1E293B", outline: "none", background: "#FFF", boxSizing: "border-box" }} />
              <input value={values.notas || ""} onChange={e => onChange({ ...values, notas: e.target.value })} placeholder="Notas adicionales" style={{ padding: "10px 14px", borderRadius: 9, border: "2px solid #E2E8F0", fontSize: 13, color: "#1E293B", outline: "none", background: "#FFF", boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onSave} style={{ padding: "8px 20px", borderRadius: 9, border: "none", background: "#059669", color: "#FFF", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{saveLabel || "Guardar"}</button>
              <button onClick={onCancel} style={{ padding: "8px 20px", borderRadius: 9, border: "1px solid #E2E8F0", background: "#FFF", color: "#64748B", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
            </div>
          </div>
        );
        
        return (
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <SectionTitle icon="🏥" text={`Protocolo Veterinario (${data.protocolos.length} tratamientos)`} />
              <button onClick={() => setShowAddProto(!showAddProto)} style={{
                padding: "7px 16px", borderRadius: 9, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: "linear-gradient(135deg, #E8950A, #CA8106)", color: "#FFF",
              }}>+ Añadir tratamiento</button>
            </div>

            {showAddProto && <ProtoForm values={newProto} onChange={setNewProto} onSave={saveProto} onCancel={() => setShowAddProto(false)} saveLabel="Crear tratamiento" />}
            {editProto && <ProtoForm values={editProto} onChange={setEditProto} onSave={updateProto} onCancel={() => setEditProto(null)} saveLabel="Actualizar" />}

            {data.protocolos.length > 0 ? [...new Set(data.protocolos.map(p => p.fase))].map((fase, i) => {
              const items = data.protocolos.filter(p => p.fase === fase);
              return <div key={i} style={{ background: `${cc[fase] || "#64748B"}06`, border: `1px solid ${cc[fase] || "#64748B"}20`, borderRadius: 12, padding: "16px 20px", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: cc[fase] || "#64748B", textTransform: "capitalize" }}>{faseLabels[fase] || fase.replace("_", " ")}</div>
                  <span style={{ fontSize: 11, color: "#94A3B8" }}>{items.length} tratamientos</span>
                </div>
                {items.map((item, j) => (
                  <div key={j} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: j < items.length - 1 ? "1px solid #F1F5F9" : "none" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: "#334155", fontWeight: 500 }}>{item.tratamiento}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>
                        {item.producto && <span>{item.producto}</span>}
                        {item.dosis && <span> · {item.dosis}</span>}
                        {item.momento && <span> · {item.momento}</span>}
                        {item.destino_animal && item.destino_animal !== "todos" && <span> · Solo {item.destino_animal}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => { setEditProto({ ...item }); setShowAddProto(false); }} title="Editar" style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #E2E8F0", background: "#F8FAFC", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>✏️</button>
                      <button onClick={() => deleteProto(item.id)} title="Eliminar" style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #FECACA", background: "#FEF2F2", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                    </div>
                  </div>
                ))}
              </div>;
            }) : <div style={{ color: "#94A3B8", fontSize: 13, textAlign: "center", padding: 20 }}>No hay protocolos cargados. Añade el primero.</div>}
          </Card>
        );
      })()}

      {cfgTab === "parametros" && (
        <Card>
          <SectionTitle icon="⚙️" text="Parámetros de la Granja" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 11 }}>
            {[{ p: "Lactación máx", v: "210 días", i: "🥛" }, { p: "Gestación", v: "150 días", i: "🤰" }, { p: "Ecografías", v: "65-80 días", i: "🔬" }, { p: "Secado", v: "90 días gest.", i: "⏸️" }, { p: "Crotalado", v: "2-3 meses", i: "🏷️" }, { p: "Parideras/año", v: "4", i: "📅" }, { p: "Umbral alta", v: ">2 L/día", i: "📈" }, { p: "Raza", v: "M-Granadina", i: "🐐" }].map((x, i) =>
              <div key={i} style={{ background: "#FAFAFA", border: "1px solid #F1F5F9", borderRadius: 10, padding: 13, textAlign: "center" }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{x.i}</div>
                <div style={{ fontSize: 10.5, color: "#94A3B8" }}>{x.p}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#E8950A", fontFamily: "'Space Mono', monospace" }}>{x.v}</div>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

// ==========================================
// PRODUCCIÓN & ANÁLISIS — The Beast
// ==========================================
function ProduccionPage({ data, saveChat }) {
  const [prodMsg, setProdMsg] = useState("");
  const [prodMsgs, setProdMsgs] = useState([{ role: "assistant", text: "Soy el analista de producción de Peñas Cercadas. Puedo analizar rendimiento, detectar tendencias, comparar lotes, identificar las mejores y peores cabras, y recomendar decisiones. Pregúntame lo que quieras." }]);
  const [prodLd, setProdLd] = useState(false);
  const [selectedCabra, setSelectedCabra] = useState(null);
  const dataCtx = buildDataContext(data);

  // =============================================
  // HISTORICAL ANALYSIS — Multi-day data
  // =============================================
  const allProd = data.produccion || [];
  
  // Get unique dates sorted descending
  const allDates = [...new Set(allProd.map(p => p.fecha))].sort((a, b) => b.localeCompare(a));
  const latestDate = allDates[0] || null;
  const previousDate = allDates[1] || null;
  const hasTwodays = allDates.length >= 2;

  // Today's production (all, including secandose — for conductivity alerts)
  const allTodayProd = latestDate ? allProd.filter(p => p.fecha === latestDate) : [];
  const allPrevProd = previousDate ? allProd.filter(p => p.fecha === previousDate) : [];

  // Filter: exclude "secandose" lotes from production analysis
  const secandoseLoteIds = new Set(data.lotes.filter(l => l.estado === 'secandose').map(l => l.id));
  const secandoseLoteNames = new Set(data.lotes.filter(l => l.estado === 'secandose').map(l => l.nombre));
  const isInProduction = (cabra_id) => {
    const cabra = data.cabras.find(c => c.id === cabra_id);
    return cabra && !secandoseLoteIds.has(cabra.lote_id);
  };
  const todayProd = allTodayProd.filter(p => isInProduction(p.cabra_id));
  const prevProd = allPrevProd.filter(p => isInProduction(p.cabra_id));

  // Daily summary — only active production lotes
  const dailySummary = allDates.map(fecha => {
    const dayProd = allProd.filter(p => p.fecha === fecha && isInProduction(p.cabra_id));
    const totalL = dayProd.reduce((s, p) => s + (p.litros || 0), 0);
    const cabras = dayProd.length;
    return {
      fecha,
      fechaShort: new Date(fecha + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" }),
      litros: Math.round(totalL * 10) / 10,
      cabras,
      media: cabras > 0 ? Math.round(totalL / cabras * 100) / 100 : 0,
    };
  }).reverse(); // chronological for charts

  // =============================================
  // PER-CABRA COMPARISON: today vs yesterday
  // =============================================
  const prevByCabra = {};
  prevProd.forEach(p => { prevByCabra[p.cabra_id] = p; });

  const cabraComparison = todayProd.map(p => {
    const cabra = data.cabras.find(c => c.id === p.cabra_id);
    if (!cabra) return null;
    const prev = prevByCabra[p.cabra_id];
    const litrosHoy = p.litros || 0;
    const litrosAyer = prev ? (prev.litros || 0) : null;
    const cambio = litrosAyer !== null && litrosAyer > 0 ? ((litrosHoy - litrosAyer) / litrosAyer) * 100 : null;
    return {
      cabra_id: p.cabra_id,
      crotal: cabra.crotal,
      lote: cabra.lote?.nombre || "-",
      litrosHoy,
      litrosAyer,
      cambio, // percentage change
      del: p.dia_lactacion || 0,
      lactacion: p.lactacion_num || 0,
      conductividad: p.conductividad || 0,
      promedio_10d: p.promedio_10d || p.media_10d || 0,
    };
  }).filter(Boolean);

  // Biggest drops (only cabras that dropped >25%)
  const bigDrops = cabraComparison
    .filter(c => c.cambio !== null && c.cambio < -25 && c.litrosAyer > 0.5)
    .sort((a, b) => a.cambio - b.cambio);

  // Biggest rises
  const bigRises = cabraComparison
    .filter(c => c.cambio !== null && c.cambio > 25 && c.litrosHoy > 0.5)
    .sort((a, b) => b.cambio - a.cambio);

  // =============================================
  // LOTE COMPARISON between days
  // =============================================
  const buildLoteDay = (dayProd) => {
    const loteMap = {};
    dayProd.forEach(p => {
      const cabra = data.cabras.find(c => c.id === p.cabra_id);
      if (!cabra) return;
      const loteName = cabra.lote?.nombre || "Sin lote";
      if (!loteMap[loteName]) loteMap[loteName] = { nombre: loteName, litros: 0, cabras: 0 };
      loteMap[loteName].litros += (p.litros || 0);
      loteMap[loteName].cabras++;
    });
    return Object.values(loteMap).map(l => ({ ...l, media: l.cabras > 0 ? l.litros / l.cabras : 0 }));
  };

  const lotesToday = buildLoteDay(todayProd);
  const lotesPrev = buildLoteDay(prevProd);
  
  // Merge lote comparison
  const loteComparison = lotesToday.map(lt => {
    const lp = lotesPrev.find(l => l.nombre === lt.nombre);
    return {
      nombre: lt.nombre,
      mediaHoy: Math.round(lt.media * 100) / 100,
      mediaAyer: lp ? Math.round(lp.media * 100) / 100 : null,
      cambio: lp && lp.media > 0 ? Math.round(((lt.media - lp.media) / lp.media) * 10000) / 100 : null,
      cabrasHoy: lt.cabras,
      litrosHoy: Math.round(lt.litros),
    };
  }).sort((a, b) => b.mediaHoy - a.mediaHoy);

  // =============================================
  // INDIVIDUAL CABRA HISTORY (when selected)
  // =============================================
  const cabraHistory = selectedCabra
    ? allDates.map(fecha => {
        const rec = allProd.find(p => p.cabra_id === selectedCabra.cabra_id && p.fecha === fecha);
        return rec ? {
          fecha,
          fechaShort: new Date(fecha + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" }),
          litros: rec.litros || 0,
          conductividad: rec.conductividad || 0,
        } : null;
      }).filter(Boolean).reverse()
    : [];

  // Build production stats by cabra
  const cabraStats = {};
  todayProd.forEach(p => {
    const cabra = data.cabras.find(c => c.id === p.cabra_id);
    if (!cabra) return;
    cabraStats[cabra.crotal] = {
      crotal: cabra.crotal,
      lote: cabra.lote?.nombre || "-",
      lote_id: cabra.lote_id,
      litros: p.litros || 0,
      ultima_prod: p.ultima_produccion || 0,
      del: p.dia_lactacion || 0,
      lactacion: p.lactacion_num || 0,
      litros_totales: p.litros_totales_lactacion || 0,
      promedio_total: p.promedio_total || p.media_total || 0,
      promedio_10d: p.promedio_10d || p.media_10d || 0,
      conductividad: p.conductividad || 0,
      tiempo_ordeno: p.tiempo_ordeno || 0,
      flujo: p.flujo || 0,
    };
  });
  const stats = Object.values(cabraStats);
  const sortedByProd = [...stats].sort((a, b) => b.litros - a.litros);
  const totalLitros = stats.reduce((s, c) => s + c.litros, 0);
  const avgLitros = stats.length > 0 ? totalLitros / stats.length : 0;
  const avgConductividad = stats.length > 0 ? stats.reduce((s, c) => s + c.conductividad, 0) / stats.length : 0;

  // Per-lote analysis
  const loteStats = {};
  stats.forEach(s => {
    if (!loteStats[s.lote]) loteStats[s.lote] = { nombre: s.lote, cabras: 0, litros: 0, condTotal: 0 };
    loteStats[s.lote].cabras++;
    loteStats[s.lote].litros += s.litros;
    loteStats[s.lote].condTotal += s.conductividad;
  });
  const loteData = Object.values(loteStats).map(l => ({
    ...l, media: l.cabras > 0 ? l.litros / l.cabras : 0,
    condMedia: l.cabras > 0 ? l.condTotal / l.cabras : 0,
  })).sort((a, b) => b.media - a.media);

  // Production distribution (histogram)
  const distBuckets = [
    { range: "0-1L", min: 0, max: 1 }, { range: "1-2L", min: 1, max: 2 },
    { range: "2-3L", min: 2, max: 3 }, { range: "3-4L", min: 3, max: 4 },
    { range: "4-5L", min: 4, max: 5 }, { range: "5L+", min: 5, max: 99 },
  ];
  const distData = distBuckets.map(b => ({
    rango: b.range,
    cabras: stats.filter(s => s.litros >= b.min && s.litros < b.max).length,
  }));

  // Health alerts — conductivity from ALL cabras (including secandose), production from active only
  const healthAlerts = [];
  // Conductivity: check ALL cabras
  const allCabraStats = {};
  allTodayProd.forEach(p => {
    const cabra = data.cabras.find(c => c.id === p.cabra_id);
    if (!cabra) return;
    allCabraStats[cabra.crotal] = { crotal: cabra.crotal, lote: cabra.lote?.nombre || "-", conductividad: p.conductividad || 0, litros: p.litros || 0 };
  });
  Object.values(allCabraStats).filter(s => s.conductividad > 6.0).sort((a, b) => b.conductividad - a.conductividad)
    .forEach(s => {
      const isSecando = secandoseLoteNames.has(s.lote);
      healthAlerts.push({ tipo: "alta", msg: `${s.crotal}: conductividad ${s.conductividad.toFixed(2)} mS/cm${isSecando ? " (secándose)" : ""}`, icon: "🔴" });
    });
  // Production drops & flow: only active lotes
  stats.filter(s => s.promedio_10d > 0 && s.litros < s.promedio_10d * 0.65).sort((a, b) => (a.litros / a.promedio_10d) - (b.litros / b.promedio_10d))
    .forEach(s => healthAlerts.push({ tipo: "media", msg: `${s.crotal}: produce ${s.litros.toFixed(1)}L (prom: ${s.promedio_10d.toFixed(1)}L) → caída ${((1 - s.litros / s.promedio_10d) * 100).toFixed(0)}%`, icon: "📉" }));
  stats.filter(s => s.flujo > 0 && s.flujo < 0.1)
    .forEach(s => healthAlerts.push({ tipo: "media", msg: `${s.crotal}: flujo ${s.flujo.toFixed(3)} L/min — muy bajo`, icon: "🐐" }));

  // Lote chart data
  const loteChartData = loteData.map(l => ({ nombre: l.nombre.replace("- Manada", "").substring(0, 15), media: Math.round(l.media * 100) / 100, cabras: l.cabras, litros: Math.round(l.litros * 10) / 10 }));

  // Candidates for culling: low production + high lactations
  const cullCandidates = [...stats]
    .filter(s => s.litros < 1.5 && s.lactacion >= 3 && s.del > 60)
    .sort((a, b) => a.litros - b.litros);

  // Rising stars: high production in first lactation
  const risingStars = [...stats]
    .filter(s => s.lactacion === 1 && s.litros > 3.0)
    .sort((a, b) => b.litros - a.litros);

  const sendProd = async () => {
    if (!prodMsg.trim()) return;
    const userMsg = prodMsg;
    setProdMsgs(p => [...p, { role: "user", text: userMsg }]); setProdMsg(""); setProdLd(true);
    
    let prodCtx = dataCtx;
    prodCtx += `\n\nLOTES SECÁNDOSE (excluidos del análisis de rendimiento): ${data.lotes.filter(l => l.estado === 'secandose').map(l => l.nombre).join(', ') || 'ninguno'}`;
    prodCtx += `\n\nDATOS DE PRODUCCIÓN DE HOY (${latestDate || "sin datos"}):\nTotal litros: ${totalLitros.toFixed(1)}\nMedia/cabra: ${avgLitros.toFixed(2)}L\nCabras en ordeño: ${stats.length}\nMedia conductividad: ${avgConductividad.toFixed(2)}`;
    prodCtx += `\n\nTOP 15 productoras: ${sortedByProd.slice(0, 15).map(s => `${s.crotal}: ${s.litros.toFixed(2)}L (DEL=${s.del}, Lact=${s.lactacion}, Cond=${s.conductividad.toFixed(2)})`).join("; ")}`;
    prodCtx += `\nPEORES 15: ${sortedByProd.slice(-15).reverse().map(s => `${s.crotal}: ${s.litros.toFixed(2)}L (DEL=${s.del}, Lact=${s.lactacion}, Cond=${s.conductividad.toFixed(2)})`).join("; ")}`;
    prodCtx += `\n\nPOR LOTE: ${loteData.map(l => `${l.nombre}: ${l.cabras} cabras, media ${l.media.toFixed(2)}L, cond media ${l.condMedia.toFixed(2)}`).join("; ")}`;
    prodCtx += `\n\nALERTAS CONDUCTIVIDAD (>6.0): ${Object.values(allCabraStats).filter(s => s.conductividad > 6.0).map(s => `${s.crotal}: ${s.conductividad.toFixed(2)} [${s.lote}]`).join(", ") || "ninguna"}`;
    prodCtx += `\n\nCANDIDATAS DESCARTE (baja prod + muchas lactaciones): ${cullCandidates.slice(0, 15).map(s => `${s.crotal}: ${s.litros.toFixed(2)}L, lact=${s.lactacion}`).join("; ") || "ninguna"}`;
    prodCtx += `\nESTRELLAS EMERGENTES (1ª lactación >3L): ${risingStars.slice(0, 10).map(s => `${s.crotal}: ${s.litros.toFixed(2)}L`).join(", ") || "ninguna"}`;
    
    // Historical comparison
    if (hasTwodays) {
      prodCtx += `\n\nCOMPARACIÓN HOY vs AYER:`;
      prodCtx += `\nMayores caídas: ${bigDrops.slice(0, 10).map(c => `${c.crotal}: ${c.litrosAyer?.toFixed(1)}→${c.litrosHoy.toFixed(1)}L (${c.cambio.toFixed(0)}%)`).join('; ') || 'ninguna >25%'}`;
      prodCtx += `\nMayores subidas: ${bigRises.slice(0, 10).map(c => `${c.crotal}: ${c.litrosAyer?.toFixed(1)}→${c.litrosHoy.toFixed(1)}L (+${c.cambio.toFixed(0)}%)`).join('; ') || 'ninguna >25%'}`;
      prodCtx += `\nComparativa lotes: ${loteComparison.map(l => `${l.nombre}: ${l.mediaHoy}L/cab ${l.cambio !== null ? `(${l.cambio >= 0 ? '+' : ''}${l.cambio.toFixed(1)}% vs ayer)` : ''}`).join('; ')}`;
    }
    
    const response = await askClaude(userMsg, prodCtx);
    setProdMsgs(p => [...p, { role: "assistant", text: response }]);
    setProdLd(false);
  };

  if (stats.length === 0) return (
    <div style={{ textAlign: "center", padding: 60 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#1E293B", marginBottom: 8 }}>Sin datos de producción</div>
      <div style={{ fontSize: 14, color: "#94A3B8" }}>Importa un CSV del FLM desde el Importador para ver los análisis.</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
        <KPI icon="🥛" label="Litros hoy" value={`${totalLitros.toFixed(0)}L`} sub={`${latestDate}`} accent="#059669" />
        <KPI icon="🐐" label="Media/cabra" value={`${avgLitros.toFixed(2)}L`} sub={`${stats.length} en ordeño`} accent="#E8950A" />
        <KPI icon="🏆" label="Top cabra" value={`${sortedByProd[0]?.litros.toFixed(1)}L`} sub={sortedByProd[0]?.crotal || "-"} accent="#7C3AED" />
        <KPI icon="📉" label="Peor cabra" value={`${sortedByProd[sortedByProd.length-1]?.litros.toFixed(1)}L`} sub={sortedByProd[sortedByProd.length-1]?.crotal || "-"} accent="#DC2626" />
        <KPI icon="🔬" label="Conductividad" value={`${avgConductividad.toFixed(2)}`} sub={`${stats.filter(s => s.conductividad > 6.0).length} alertas`} accent="#DB2777" />
        <KPI icon="⚡" label="Flujo medio" value={`${(stats.reduce((s, c) => s + (c.flujo || 0), 0) / stats.length).toFixed(2)}`} sub="L/min" accent="#0891B2" />
      </div>

      {/* ================================================ */}
      {/* ANÁLISIS HISTÓRICO — Sección principal nueva      */}
      {/* ================================================ */}
      {allDates.length >= 1 && (
        <Card style={{ border: "2px solid #E8950A20", background: "linear-gradient(135deg, #FFFCF5, #FFF)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <SectionTitle icon="📈" text={`Análisis Histórico · ${allDates.length} día${allDates.length > 1 ? "s" : ""} importado${allDates.length > 1 ? "s" : ""}`} />
            {allDates.length < 3 && (
              <div style={{ fontSize: 11, color: "#E8950A", background: "#FEF9EE", padding: "4px 10px", borderRadius: 8, border: "1px solid #FDE68A" }}>
                💡 Importa más días para ver tendencias más claras
              </div>
            )}
          </div>

          {/* Evolución diaria — gráfica */}
          {dailySummary.length >= 2 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 8 }}>Evolución diaria</div>
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={dailySummary}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="fechaShort" tick={{ fontSize: 11, fill: "#94A3B8" }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#94A3B8" }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#94A3B8" }} />
                  <Tooltip content={<CustomTooltip formatter={(v, name) => name === "Media L/cabra" ? `${v.toFixed(2)} L` : `${v} L`} />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area yAxisId="left" type="monotone" dataKey="litros" name="Litros totales" fill="#059669" fillOpacity={0.1} stroke="#059669" strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="media" name="Media L/cabra" stroke="#E8950A" strokeWidth={2} dot={{ r: 4, fill: "#E8950A" }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Grid: Caídas + Subidas + Lotes */}
          <div style={{ display: "grid", gridTemplateColumns: hasTwodays ? "1fr 1fr 1fr" : "1fr", gap: 16 }}>
            
            {/* Mayores caídas */}
            {hasTwodays && (
              <div style={{ background: "#FEF2F2", borderRadius: 12, padding: 14, border: "1px solid #FECACA" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#DC2626", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  🔴 Mayores caídas ({bigDrops.length})
                </div>
                {bigDrops.length === 0 && <div style={{ fontSize: 11.5, color: "#94A3B8" }}>Ninguna cabra bajó más del 25%</div>}
                {bigDrops.slice(0, 10).map((c, i) => (
                  <div key={i} onClick={() => setSelectedCabra(c)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #FECACA40", cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#FEE2E240"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#334155", fontFamily: "'Space Mono', monospace" }}>{c.crotal}</span>
                      <span style={{ fontSize: 10, color: "#94A3B8", marginLeft: 4 }}>{c.lote}</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#DC2626", fontFamily: "'Space Mono', monospace" }}>{c.cambio.toFixed(0)}%</span>
                      <div style={{ fontSize: 9.5, color: "#94A3B8" }}>{c.litrosAyer?.toFixed(1)}→{c.litrosHoy.toFixed(1)}L</div>
                    </div>
                  </div>
                ))}
                {bigDrops.length > 10 && <div style={{ fontSize: 10, color: "#DC2626", marginTop: 4 }}>...y {bigDrops.length - 10} más</div>}
              </div>
            )}

            {/* Mayores subidas */}
            {hasTwodays && (
              <div style={{ background: "#F0FDF4", borderRadius: 12, padding: 14, border: "1px solid #BBF7D0" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#059669", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  ✅ Mayores subidas ({bigRises.length})
                </div>
                {bigRises.length === 0 && <div style={{ fontSize: 11.5, color: "#94A3B8" }}>Ninguna cabra subió más del 25%</div>}
                {bigRises.slice(0, 10).map((c, i) => (
                  <div key={i} onClick={() => setSelectedCabra(c)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #BBF7D040", cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#DCFCE740"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#334155", fontFamily: "'Space Mono', monospace" }}>{c.crotal}</span>
                      <span style={{ fontSize: 10, color: "#94A3B8", marginLeft: 4 }}>{c.lote}</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#059669", fontFamily: "'Space Mono', monospace" }}>+{c.cambio.toFixed(0)}%</span>
                      <div style={{ fontSize: 9.5, color: "#94A3B8" }}>{c.litrosAyer?.toFixed(1)}→{c.litrosHoy.toFixed(1)}L</div>
                    </div>
                  </div>
                ))}
                {bigRises.length > 10 && <div style={{ fontSize: 10, color: "#059669", marginTop: 4 }}>...y {bigRises.length - 10} más</div>}
              </div>
            )}

            {/* Comparativa lotes */}
            {hasTwodays && (
              <div style={{ background: "#F8FAFC", borderRadius: 12, padding: 14, border: "1px solid #E2E8F0" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  📊 Comparativa Lotes (hoy vs ayer)
                </div>
                {loteComparison.map((l, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #F1F5F9" }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>{l.nombre}</div>
                      <div style={{ fontSize: 10, color: "#94A3B8" }}>{l.cabrasHoy} cabras · {l.litrosHoy}L</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#E8950A", fontFamily: "'Space Mono', monospace" }}>{l.mediaHoy} L/cab</span>
                      {l.cambio !== null && (
                        <div style={{ fontSize: 10, fontWeight: 600, color: l.cambio >= 0 ? "#059669" : "#DC2626" }}>
                          {l.cambio >= 0 ? "▲" : "▼"} {Math.abs(l.cambio).toFixed(1)}% vs ayer ({l.mediaAyer} L)
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Si solo hay 1 día, mostrar resumen */}
            {!hasTwodays && (
              <div style={{ background: "#F8FAFC", borderRadius: 12, padding: 14, border: "1px solid #E2E8F0", textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#64748B", marginBottom: 6 }}>📊 Solo 1 día importado ({latestDate})</div>
                <div style={{ fontSize: 12, color: "#94A3B8" }}>
                  Importa el CSV de mañana y verás aquí: caídas de producción, subidas, y comparativa entre lotes día a día.
                </div>
              </div>
            )}
          </div>

          {/* Mini ficha de cabra seleccionada */}
          {selectedCabra && (
            <div style={{ marginTop: 16, background: "#FFF", border: "1px solid #E2E8F0", borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <span style={{ fontSize: 16, fontWeight: 800, color: "#1E293B", fontFamily: "'Space Mono', monospace" }}>{selectedCabra.crotal}</span>
                  <span style={{ fontSize: 12, color: "#94A3B8", marginLeft: 8 }}>{selectedCabra.lote} · L{selectedCabra.lactacion} · DEL {selectedCabra.del}</span>
                </div>
                <button onClick={() => setSelectedCabra(null)} style={{ background: "#F1F5F9", border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 11, cursor: "pointer", color: "#64748B" }}>✕ Cerrar</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 12 }}>
                <div style={{ textAlign: "center", padding: 8, background: "#F8FAFC", borderRadius: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#059669" }}>{selectedCabra.litrosHoy.toFixed(2)}L</div>
                  <div style={{ fontSize: 10, color: "#94A3B8" }}>Hoy</div>
                </div>
                <div style={{ textAlign: "center", padding: 8, background: "#F8FAFC", borderRadius: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#64748B" }}>{selectedCabra.litrosAyer !== null ? `${selectedCabra.litrosAyer.toFixed(2)}L` : "-"}</div>
                  <div style={{ fontSize: 10, color: "#94A3B8" }}>Ayer</div>
                </div>
                <div style={{ textAlign: "center", padding: 8, background: "#F8FAFC", borderRadius: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: selectedCabra.cambio !== null ? (selectedCabra.cambio >= 0 ? "#059669" : "#DC2626") : "#94A3B8" }}>
                    {selectedCabra.cambio !== null ? `${selectedCabra.cambio >= 0 ? "+" : ""}${selectedCabra.cambio.toFixed(1)}%` : "-"}
                  </div>
                  <div style={{ fontSize: 10, color: "#94A3B8" }}>Cambio</div>
                </div>
                <div style={{ textAlign: "center", padding: 8, background: "#F8FAFC", borderRadius: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: selectedCabra.conductividad > 6.0 ? "#DC2626" : "#64748B" }}>{selectedCabra.conductividad.toFixed(2)}</div>
                  <div style={{ fontSize: 10, color: "#94A3B8" }}>Conduct.</div>
                </div>
              </div>
              {/* Mini chart of cabra history */}
              {cabraHistory.length >= 2 && (
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={cabraHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="fechaShort" tick={{ fontSize: 10, fill: "#94A3B8" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} />
                    <Tooltip content={<CustomTooltip formatter={v => `${v.toFixed(2)} L`} />} />
                    <Line type="monotone" dataKey="litros" stroke="#E8950A" strokeWidth={2} dot={{ r: 4, fill: "#E8950A" }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
              {cabraHistory.length < 2 && (
                <div style={{ fontSize: 11, color: "#94A3B8", textAlign: "center", padding: 10 }}>
                  Se necesitan al menos 2 días para ver la curva de esta cabra.
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Lote comparison */}
          <Card>
            <SectionTitle icon="📊" text="Producción por Lote" />
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={loteChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="nombre" tick={{ fontSize: 10, fill: "#94A3B8" }} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} />
                <Tooltip content={<CustomTooltip formatter={v => typeof v === "number" ? `${v.toFixed(2)}` : v} />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="media" name="Media L/cabra" fill="#E8950A" radius={[6, 6, 0, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              {loteData.map((l, i) => (
                <div key={i} style={{ background: "#FAFAFA", border: "1px solid #F1F5F9", borderRadius: 10, padding: "10px 14px", flex: "1 1 auto", minWidth: 140 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>{l.nombre}</div>
                  <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 11, color: "#64748B" }}>
                    <span>{l.cabras} cabras</span>
                    <span style={{ fontWeight: 700, color: "#E8950A" }}>{l.media.toFixed(2)} L/cab</span>
                    <span>{l.litros.toFixed(0)} L total</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Distribution */}
          <Card>
            <SectionTitle icon="📈" text="Distribución de Producción" />
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={distData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="rango" tick={{ fontSize: 12, fill: "#94A3B8" }} />
                <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} />
                <Tooltip content={<CustomTooltip formatter={v => `${v} cabras`} />} />
                <Bar dataKey="cabras" name="Cabras" fill="#7C3AED" radius={[6, 6, 0, 0]} barSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Top 15 */}
            <Card>
              <SectionTitle icon="🏆" text={`Top 15 Productoras`} color="#059669" />
              {sortedByProd.slice(0, 15).map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #F8FAFC" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: i < 3 ? "#E8950A" : "#94A3B8", width: 20 }}>{i + 1}</span>
                    <div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: "#334155", fontFamily: "'Space Mono', monospace" }}>{s.crotal}</span>
                      <span style={{ fontSize: 10, color: "#94A3B8", marginLeft: 6 }}>L{s.lactacion} D{s.del}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#059669", fontFamily: "'Space Mono', monospace" }}>{s.litros.toFixed(2)}L</span>
                </div>
              ))}
            </Card>

            {/* Bottom 15 + cull candidates */}
            <Card>
              <SectionTitle icon="⚠️" text="Candidatas a Descarte" color="#DC2626" />
              {cullCandidates.length === 0 && <div style={{ fontSize: 12, color: "#94A3B8", padding: 10 }}>No hay candidatas claras hoy</div>}
              {cullCandidates.slice(0, 12).map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #F8FAFC" }}>
                  <div>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "#334155", fontFamily: "'Space Mono', monospace" }}>{s.crotal}</span>
                    <span style={{ fontSize: 10, color: "#94A3B8", marginLeft: 6 }}>L{s.lactacion} D{s.del}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#DC2626", fontFamily: "'Space Mono', monospace" }}>{s.litros.toFixed(2)}L</span>
                    <Badge text={`Lact ${s.lactacion}`} color="#94A3B8" />
                  </div>
                </div>
              ))}
              {risingStars.length > 0 && (<>
                <div style={{ marginTop: 16 }}><SectionTitle icon="⭐" text="Estrellas Emergentes (1ª lact)" color="#E8950A" /></div>
                {risingStars.slice(0, 8).map((s, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #F8FAFC" }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "#334155", fontFamily: "'Space Mono', monospace" }}>{s.crotal}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#E8950A", fontFamily: "'Space Mono', monospace" }}>{s.litros.toFixed(2)}L</span>
                  </div>
                ))}
              </>)}
            </Card>
          </div>
        </div>

        {/* Right sidebar: alerts + chat */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Health alerts */}
          {healthAlerts.length > 0 && (
            <Card style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#DC2626", marginBottom: 10 }}>🚨 Alertas Sanitarias ({healthAlerts.length})</div>
              {healthAlerts.slice(0, 10).map((a, i) => (
                <div key={i} style={{ fontSize: 11.5, color: "#7F1D1D", padding: "4px 0", borderBottom: i < 9 ? "1px solid #FECACA40" : "none" }}>
                  {a.icon} {a.msg}
                </div>
              ))}
              {healthAlerts.length > 10 && <div style={{ fontSize: 11, color: "#DC2626", marginTop: 4 }}>...y {healthAlerts.length - 10} más</div>}
            </Card>
          )}

          {/* Production chat */}
          <ChatBox
            messages={prodMsgs} input={prodMsg} setInput={setProdMsg} onSend={sendProd}
            examples={["¿Cuáles son las 20 mejores cabras?", "¿Qué lote rinde más?", "Cabras para descartar", "¿Cuánto producimos hoy?"]}
            onExample={setProdMsg}
            placeholder="Analiza la producción..."
            height={healthAlerts.length > 0 ? 340 : 450}
            onSave={saveChat} pageName="produccion"
          />

          {/* Quick insights */}
          <Card style={{ background: "linear-gradient(135deg, #FEF9EE, #FFF7ED)", border: "1px solid #FDE68A" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#E8950A", marginBottom: 8 }}>💡 Observaciones de hoy</div>
            {[
              `Producción total: ${totalLitros.toFixed(0)}L (${avgLitros.toFixed(2)}L/cabra)`,
              loteData.length > 0 ? `Mejor lote: ${loteData[0].nombre} (${loteData[0].media.toFixed(2)} L/cab)` : null,
              loteData.length > 1 ? `Peor lote: ${loteData[loteData.length - 1].nombre} (${loteData[loteData.length - 1].media.toFixed(2)} L/cab)` : null,
              `${stats.filter(s => s.litros > 4).length} cabras producen más de 4L`,
              `${stats.filter(s => s.litros < 1).length} cabras producen menos de 1L`,
              cullCandidates.length > 0 ? `${cullCandidates.length} candidatas a descarte (baja prod + muchas lactaciones)` : null,
              risingStars.length > 0 ? `${risingStars.length} estrellas emergentes en 1ª lactación con >3L` : null,
              stats.filter(s => s.conductividad > 6.0).length > 0 ? `⚠️ ${stats.filter(s => s.conductividad > 6.0).length} cabras con conductividad alta` : null,
            ].filter(Boolean).map((obs, i) => (
              <div key={i} style={{ fontSize: 11.5, color: "#78590A", lineHeight: 1.4, padding: "3px 0", display: "flex", gap: 6 }}>
                <span style={{ color: "#E8950A" }}>→</span>{obs}
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// SANIDAD — Centro de Control Sanitario
// ==========================================
function SanidadPage({ data, refresh, saveChat }) {
  const [expandedCard, setExpandedCard] = useState(null);
  const [showAddNote, setShowAddNote] = useState(false);
  const [newNote, setNewNote] = useState({ cabra_crotal: "", texto: "", tipo: "individual" });
  const [sanMsg, setSanMsg] = useState("");
  const [sanMsgs, setSanMsgs] = useState([{ role: "assistant", text: "Soy el asistente sanitario de Peñas Cercadas. Puedo analizar patrones de enfermedad, correlacionar conductividad con parideras, evaluar anotaciones del veterinario, y proponerte hipótesis de manejo. Pregúntame lo que quieras." }]);
  const [sanLd, setSanLd] = useState(false);
  const dataCtx = buildDataContext(data);

  // =============================================
  // DATA ANALYSIS
  // =============================================
  const allProd = data.produccion || [];
  const allDates = [...new Set(allProd.map(p => p.fecha))].sort((a, b) => b.localeCompare(a));
  const latestDate = allDates[0] || null;
  const prevDate = allDates[1] || null;
  const todayProd = latestDate ? allProd.filter(p => p.fecha === latestDate) : [];
  const prevProd = prevDate ? allProd.filter(p => p.fecha === prevDate) : [];

  const secandoseLoteIds = new Set(data.lotes.filter(l => l.estado === 'secandose').map(l => l.id));

  // 1. CONDUCTIVIDAD ALTA — todas las cabras (incluidas secándose)
  const highCond = todayProd.map(p => {
    const cabra = data.cabras.find(c => c.id === p.cabra_id);
    if (!cabra || !p.conductividad || p.conductividad <= 6.0) return null;
    const prevR = prevProd.find(pp => pp.cabra_id === p.cabra_id);
    const paridera = data.cubriciones.find(cu => cu.cabra_id === p.cabra_id);
    return {
      crotal: cabra.crotal, cabra_id: p.cabra_id,
      conductividad: p.conductividad,
      condAyer: prevR?.conductividad || null,
      litros: p.litros || 0,
      lote: cabra.lote?.nombre || "-",
      lote_id: cabra.lote_id,
      del: p.dia_lactacion || 0,
      lactacion: p.lactacion_num || 0,
      isSecando: secandoseLoteIds.has(cabra.lote_id),
      paridera: paridera?.paridera?.nombre || null,
    };
  }).filter(Boolean).sort((a, b) => b.conductividad - a.conductividad);

  // Pattern detection: cluster by lote or paridera
  const condByLote = {};
  highCond.forEach(c => { condByLote[c.lote] = (condByLote[c.lote] || 0) + 1; });
  const condByParidera = {};
  highCond.filter(c => c.paridera).forEach(c => { condByParidera[c.paridera] = (condByParidera[c.paridera] || 0) + 1; });

  const condPatterns = [];
  Object.entries(condByLote).forEach(([lote, count]) => {
    if (count >= 3) condPatterns.push({ tipo: "cluster_lote", msg: `${count} cabras con conductividad alta en ${lote} — posible problema de manejo o ambiente en ese lote`, lote, count });
  });
  Object.entries(condByParidera).forEach(([paridera, count]) => {
    if (count >= 3) condPatterns.push({ tipo: "cluster_paridera", msg: `${count} cabras con conductividad alta de la ${paridera} — revisar manejo post-parto`, paridera, count });
  });

  // 2. CANDIDATAS A DESCARTE
  const activeProd = todayProd.filter(p => {
    const cabra = data.cabras.find(c => c.id === p.cabra_id);
    return cabra && !secandoseLoteIds.has(cabra.lote_id);
  });
  const cullCandidates = activeProd.map(p => {
    const cabra = data.cabras.find(c => c.id === p.cabra_id);
    if (!cabra) return null;
    const litros = p.litros || 0;
    const lactacion = p.lactacion_num || 0;
    const del = p.dia_lactacion || 0;
    if (litros >= 1.5 || lactacion < 3 || del < 60) return null;
    // Check doble vacía
    const vaciaCount = data.ecografias.filter(e => e.cabra_id === cabra.id && e.resultado === "vacia").length;
    return { crotal: cabra.crotal, litros, lactacion, del, lote: cabra.lote?.nombre || "-", vaciaCount };
  }).filter(Boolean).sort((a, b) => a.litros - b.litros);

  // 3. DOBLE VACÍAS
  const vaciasByC = {};
  data.ecografias.filter(e => e.resultado === "vacia").forEach(e => {
    const cr = e.cabra?.crotal;
    if (cr) vaciasByC[cr] = (vaciasByC[cr] || 0) + 1;
  });
  const dobleVacias = Object.entries(vaciasByC).filter(([, c]) => c >= 2).map(([cr, count]) => {
    const cabra = data.cabras.find(c => c.crotal === cr);
    return { crotal: cr, count, lote: cabra?.lote?.nombre || "-", estado: cabra?.estado || "-" };
  });

  // 4. CABRAS CON CONDUCTIVIDAD EN AUMENTO (2+ días)
  const condRising = [];
  if (allDates.length >= 2) {
    todayProd.forEach(p => {
      if (!p.conductividad || p.conductividad <= 5.5) return;
      const cabra = data.cabras.find(c => c.id === p.cabra_id);
      if (!cabra) return;
      const prev = prevProd.find(pp => pp.cabra_id === p.cabra_id);
      if (prev && prev.conductividad && p.conductividad > prev.conductividad && (p.conductividad - prev.conductividad) > 0.3) {
        condRising.push({
          crotal: cabra.crotal, lote: cabra.lote?.nombre || "-",
          condHoy: p.conductividad, condAyer: prev.conductividad,
          subida: p.conductividad - prev.conductividad,
        });
      }
    });
    condRising.sort((a, b) => b.subida - a.subida);
  }

  // 5. ANOTACIONES VETERINARIAS
  const anotaciones = data.anotaciones || [];

  // 6. ALERTAS PERSISTENTES
  const alertasPersistentes = data.alertasSanitarias || [];
  const alertasActivas = alertasPersistentes.filter(a => a.estado === "activa");

  // Chat sanitario
  const sendSan = async () => {
    if (!sanMsg.trim()) return;
    const userMsg = sanMsg;
    setSanMsgs(p => [...p, { role: "user", text: userMsg }]); setSanMsg(""); setSanLd(true);
    const sanCtx = dataCtx + `\n\nDATOS SANITARIOS COMPLETOS:` +
      `\nCabras conductividad >6.0: ${highCond.length}` +
      `\n${highCond.slice(0, 25).map(c => `  ${c.crotal}: Cond=${c.conductividad.toFixed(2)}, ${c.litros.toFixed(1)}L, DEL=${c.del}, L${c.lactacion}, ${c.lote}${c.isSecando ? ' (SECÁNDOSE)' : ''}${c.paridera ? ', Paridera=' + c.paridera : ''}`).join('\n')}` +
      `\n\nPatrones detectados: ${condPatterns.map(p => p.msg).join("; ") || "ninguno"}` +
      `\nConductividad en aumento: ${condRising.slice(0, 15).map(c => `${c.crotal}: ${c.condAyer.toFixed(2)}→${c.condHoy.toFixed(2)} (+${c.subida.toFixed(2)}) [${c.lote}]`).join("; ") || "ninguna"}` +
      `\n\nCandidatas descarte: ${cullCandidates.length} (${cullCandidates.slice(0, 15).map(c => `${c.crotal}: ${c.litros.toFixed(1)}L, L${c.lactacion}, D${c.del}${c.vaciaCount >= 2 ? ' DOBLE VACÍA' : ''}`).join("; ")})` +
      `\nDoble vacías: ${dobleVacias.map(d => `${d.crotal} (${d.count}x, ${d.lote})`).join(", ") || "ninguna"}` +
      `\n\nAnotaciones veterinarias (${anotaciones.length}):` +
      `\n${anotaciones.slice(0, 20).map(a => `  [${a.fecha}] ${a.cabra?.crotal || "GENERAL"} (${a.tipo}): ${a.texto}`).join('\n')}` +
      `\n\nAl analizar estos datos, busca correlaciones entre conductividad alta y parideras, lotes, o tratamientos. Cruza con partos recientes, ecografías y anotaciones. Propón hipótesis de manejo y recomendaciones prácticas.`;
    const response = await askClaude(userMsg, sanCtx, "general");
    setSanMsgs(p => [...p, { role: "assistant", text: response }]);
    setSanLd(false);
  };

  // Save veterinary note
  const saveNote = async () => {
    if (!newNote.texto.trim()) return;
    let cabra_id = null;
    if (newNote.cabra_crotal.trim()) {
      const cabra = data.cabras.find(c => c.crotal === newNote.cabra_crotal.trim());
      if (cabra) cabra_id = cabra.id;
    }
    await supabase.from("anotacion_veterinaria").insert([{
      cabra_id, fecha: new Date().toISOString().split("T")[0],
      texto: newNote.texto, tipo: newNote.tipo, autor: "Veterinario",
    }]);
    setNewNote({ cabra_crotal: "", texto: "", tipo: "individual" });
    setShowAddNote(false);
    refresh();
  };

  // Resolve alert
  const resolveAlert = async (id) => {
    await supabase.from("alerta_sanitaria").update({ estado: "resuelta", resolved_at: new Date().toISOString() }).eq("id", id);
    refresh();
  };

  // Auto-generate and persist alerts from data patterns
  const generateAlerts = async () => {
    const newAlerts = [];
    const today = new Date().toISOString().split("T")[0];
    // Check if already generated today
    const todayAlerts = alertasPersistentes.filter(a => a.fecha === today);
    if (todayAlerts.length > 0) return; // Already generated

    if (condPatterns.length > 0) {
      condPatterns.forEach(p => {
        newAlerts.push({
          fecha: today, tipo: "conductividad", severidad: "alta",
          titulo: `Cluster conductividad: ${p.lote || p.paridera}`,
          descripcion: p.msg,
          cabras_afectadas: highCond.filter(c => c.lote === p.lote || c.paridera === p.paridera).map(c => c.crotal),
          lote_nombre: p.lote || null, paridera_nombre: p.paridera || null,
        });
      });
    }
    if (cullCandidates.length >= 5) {
      newAlerts.push({
        fecha: today, tipo: "descarte", severidad: "media",
        titulo: `${cullCandidates.length} candidatas a descarte`,
        descripcion: `Cabras con <1.5L, ≥3 lactaciones, >60 DEL. Revisar para decisión productiva.`,
        cabras_afectadas: cullCandidates.slice(0, 20).map(c => c.crotal),
      });
    }
    if (newAlerts.length > 0) {
      await supabase.from("alerta_sanitaria").insert(newAlerts);
      refresh();
    }
  };

  useEffect(() => { if (todayProd.length > 0) generateAlerts(); }, [latestDate]);

  // Card toggle
  const toggle = (id) => setExpandedCard(expandedCard === id ? null : id);

  // Summary cards data
  const cards = [
    { id: "conductividad", icon: "🔬", title: "Conductividad Alta", count: highCond.length, color: "#DC2626", severity: highCond.length > 5 ? "alta" : highCond.length > 0 ? "media" : "ok", sub: highCond.length > 0 ? `Máx: ${highCond[0]?.conductividad.toFixed(2)} mS/cm` : "Todo normal" },
    { id: "patrones", icon: "🔍", title: "Patrones Detectados", count: condPatterns.length + (condRising.length > 0 ? 1 : 0), color: "#7C3AED", severity: condPatterns.length > 0 ? "alta" : "ok", sub: condPatterns.length > 0 ? condPatterns[0].msg.substring(0, 60) + "..." : "Sin patrones anómalos" },
    { id: "descarte", icon: "⚠️", title: "Candidatas Descarte", count: cullCandidates.length, color: "#E8950A", severity: cullCandidates.length > 10 ? "alta" : cullCandidates.length > 0 ? "media" : "ok", sub: cullCandidates.length > 0 ? `Peor: ${cullCandidates[0]?.crotal} (${cullCandidates[0]?.litros.toFixed(1)}L)` : "Ninguna" },
    { id: "vacias", icon: "🔴", title: "Doble Vacías", count: dobleVacias.length, color: "#DB2777", severity: dobleVacias.length > 3 ? "alta" : dobleVacias.length > 0 ? "media" : "ok", sub: dobleVacias.length > 0 ? `${dobleVacias.map(d => d.crotal).slice(0, 3).join(", ")}` : "Ninguna" },
    { id: "notas", icon: "📋", title: "Anotaciones Veterinarias", count: anotaciones.length, color: "#0891B2", severity: "info", sub: anotaciones.length > 0 ? `Última: ${anotaciones[0]?.fecha}` : "Sin anotaciones" },
    { id: "alertas", icon: "🚨", title: "Alertas Activas", count: alertasActivas.length, color: "#DC2626", severity: alertasActivas.length > 0 ? "alta" : "ok", sub: alertasActivas.length > 0 ? alertasActivas[0].titulo : "Sin alertas pendientes" },
  ];

  const sevBorder = { alta: "#FECACA", media: "#FDE68A", ok: "#BBF7D0", info: "#BAE6FD" };
  const sevBg = { alta: "#FEF2F2", media: "#FEF9EE", ok: "#F0FDF4", info: "#F0F9FF" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* Summary grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {cards.map(card => (
          <div key={card.id} onClick={() => toggle(card.id)}
            style={{
              background: sevBg[card.severity], border: `2px solid ${sevBorder[card.severity]}`,
              borderRadius: 16, padding: "18px 22px", cursor: "pointer", transition: "all .25s",
              boxShadow: expandedCard === card.id ? `0 8px 24px ${card.color}20` : "none",
              transform: expandedCard === card.id ? "translateY(-2px)" : "none",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 6px 20px ${card.color}15`; }}
            onMouseLeave={e => { if (expandedCard !== card.id) { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "none"; } }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20 }}>{card.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#1E293B" }}>{card.title}</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: card.color, fontFamily: "'Space Mono', monospace" }}>{card.count}</div>
            </div>
            <div style={{ fontSize: 11.5, color: "#64748B", lineHeight: 1.4 }}>{card.sub}</div>
            <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 6 }}>{expandedCard === card.id ? "▲ Clic para cerrar" : "▼ Clic para ver detalle"}</div>
          </div>
        ))}
      </div>

      {/* Expanded detail panels */}
      {expandedCard === "conductividad" && (
        <Card style={{ border: "2px solid #FECACA", animation: "fadeSlideIn .3s" }}>
          <SectionTitle icon="🔬" text={`Conductividad Alta — ${highCond.length} cabras >6.0 mS/cm`} color="#DC2626" />
          {condPatterns.length > 0 && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#DC2626", marginBottom: 6 }}>🔍 Patrones detectados</div>
              {condPatterns.map((p, i) => <div key={i} style={{ fontSize: 12, color: "#7F1D1D", lineHeight: 1.5 }}>→ {p.msg}</div>)}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {highCond.map((c, i) => (
              <div key={i} style={{ background: c.conductividad > 6.5 ? "#FEF2F2" : "#FFFBEB", border: `1px solid ${c.conductividad > 6.5 ? "#FECACA" : "#FDE68A"}`, borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "#1E293B" }}>{c.crotal}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: c.conductividad > 6.5 ? "#DC2626" : "#E8950A", fontFamily: "'Space Mono', monospace" }}>{c.conductividad.toFixed(2)}</span>
                </div>
                <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 3 }}>
                  {c.lote}{c.isSecando ? " (secándose)" : ""} · L{c.lactacion} · {c.litros.toFixed(1)}L
                  {c.condAyer && <span> · Ayer: {c.condAyer.toFixed(2)}</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {expandedCard === "patrones" && (
        <Card style={{ border: "2px solid #DDD6FE", animation: "fadeSlideIn .3s" }}>
          <SectionTitle icon="🔍" text="Patrones y Tendencias" color="#7C3AED" />
          {condPatterns.length === 0 && condRising.length === 0 && (
            <div style={{ textAlign: "center", padding: 20, color: "#94A3B8" }}>No se han detectado patrones anómalos. Importa más días para un análisis más profundo.</div>
          )}
          {condPatterns.map((p, i) => (
            <div key={i} style={{ background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 10, padding: 14, marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#7C3AED", marginBottom: 4 }}>🔗 {p.tipo === "cluster_lote" ? `Cluster en ${p.lote}` : `Cluster en ${p.paridera}`}</div>
              <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>{p.msg}</div>
              <div style={{ fontSize: 11, color: "#7C3AED", marginTop: 6, fontWeight: 600 }}>💡 Recomendación: revisar higiene de ordeño, rutina de secado, y estado de pezoneras en ese grupo.</div>
            </div>
          ))}
          {condRising.length > 0 && (
            <div style={{ marginTop: condPatterns.length > 0 ? 14 : 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#7C3AED", marginBottom: 10 }}>📈 Conductividad en aumento ({condRising.length} cabras)</div>
              {condRising.slice(0, 12).map((c, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F1F5F9" }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "'Space Mono', monospace" }}>{c.crotal}</span>
                    <span style={{ fontSize: 10, color: "#94A3B8", marginLeft: 6 }}>{c.lote}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#DC2626" }}>{c.condAyer.toFixed(2)} → {c.condHoy.toFixed(2)} (+{c.subida.toFixed(2)})</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {expandedCard === "descarte" && (
        <Card style={{ border: "2px solid #FDE68A", animation: "fadeSlideIn .3s" }}>
          <SectionTitle icon="⚠️" text={`Candidatas a Descarte — ${cullCandidates.length} cabras`} color="#E8950A" />
          <div style={{ fontSize: 12, color: "#64748B", marginBottom: 12 }}>Criterio: &lt;1.5L/día, ≥3 lactaciones, &gt;60 DEL. No incluye lotes secándose.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {cullCandidates.slice(0, 20).map((c, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#FFFBEB", borderRadius: 8, border: "1px solid #FDE68A" }}>
                <div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, fontFamily: "'Space Mono', monospace" }}>{c.crotal}</span>
                  <span style={{ fontSize: 10, color: "#94A3B8", marginLeft: 6 }}>{c.lote} · D{c.del}</span>
                  {c.vaciaCount >= 2 && <span style={{ fontSize: 9, color: "#DC2626", marginLeft: 4, fontWeight: 700 }}>DOBLE VACÍA</span>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#DC2626", fontFamily: "'Space Mono', monospace" }}>{c.litros.toFixed(2)}L</div>
                  <div style={{ fontSize: 9, color: "#94A3B8" }}>Lact {c.lactacion}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {expandedCard === "vacias" && (
        <Card style={{ border: "2px solid #FBCFE8", animation: "fadeSlideIn .3s" }}>
          <SectionTitle icon="🔴" text={`Doble Vacías — ${dobleVacias.length} cabras`} color="#DB2777" />
          <div style={{ fontSize: 12, color: "#64748B", marginBottom: 12 }}>Cabras que han salido vacías en 2 o más ecografías consecutivas. Alta prioridad de revisión reproductiva.</div>
          {dobleVacias.map((d, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #F1F5F9" }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "#1E293B" }}>{d.crotal}</span>
                <span style={{ fontSize: 11, color: "#94A3B8", marginLeft: 8 }}>{d.lote} · Estado: {d.estado}</span>
              </div>
              <Badge text={`${d.count}x vacía`} color="#DB2777" />
            </div>
          ))}
          {dobleVacias.length === 0 && <div style={{ textAlign: "center", color: "#94A3B8", padding: 20 }}>No hay cabras doble vacías registradas.</div>}
        </Card>
      )}

      {expandedCard === "notas" && (
        <Card style={{ border: "2px solid #BAE6FD", animation: "fadeSlideIn .3s" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <SectionTitle icon="📋" text="Anotaciones Veterinarias" color="#0891B2" />
            <button onClick={() => setShowAddNote(!showAddNote)} style={{ padding: "7px 16px", borderRadius: 9, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", background: "linear-gradient(135deg, #0891B2, #0E7490)", color: "#FFF" }}>+ Nueva anotación</button>
          </div>
          {showAddNote && (
            <div style={{ background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: 12, padding: 16, marginBottom: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 10, marginBottom: 10 }}>
                <input value={newNote.cabra_crotal} onChange={e => setNewNote({ ...newNote, cabra_crotal: e.target.value })} placeholder="Crotal (opcional)" style={{ padding: "10px 14px", borderRadius: 9, border: "2px solid #E2E8F0", fontSize: 13, color: "#1E293B", outline: "none", background: "#FFF", boxSizing: "border-box" }} />
                <select value={newNote.tipo} onChange={e => setNewNote({ ...newNote, tipo: e.target.value })} style={{ padding: "10px 14px", borderRadius: 9, border: "2px solid #E2E8F0", fontSize: 13, color: "#1E293B", background: "#FFF" }}>
                  <option value="individual">Individual</option>
                  <option value="rebaño">Rebaño general</option>
                  <option value="lote">Lote</option>
                  <option value="urgente">Urgente</option>
                </select>
              </div>
              <textarea value={newNote.texto} onChange={e => setNewNote({ ...newNote, texto: e.target.value })} placeholder="Describe la observación del veterinario..." rows={3} style={{ width: "100%", padding: "10px 14px", borderRadius: 9, border: "2px solid #E2E8F0", fontSize: 13, color: "#1E293B", outline: "none", background: "#FFF", boxSizing: "border-box", resize: "vertical", fontFamily: "'Outfit', sans-serif" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={saveNote} style={{ padding: "8px 20px", borderRadius: 9, border: "none", background: "#0891B2", color: "#FFF", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Guardar anotación</button>
                <button onClick={() => setShowAddNote(false)} style={{ padding: "8px 20px", borderRadius: 9, border: "1px solid #E2E8F0", background: "#FFF", color: "#64748B", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
              </div>
            </div>
          )}
          {anotaciones.length > 0 ? anotaciones.slice(0, 20).map((a, i) => {
            const tipoC = { individual: "#0891B2", "rebaño": "#059669", lote: "#7C3AED", urgente: "#DC2626" };
            return (
              <div key={i} style={{ padding: "12px 0", borderBottom: "1px solid #F1F5F9" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Badge text={a.tipo || "individual"} color={tipoC[a.tipo] || "#94A3B8"} />
                    {a.cabra?.crotal && <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "#1E293B" }}>{a.cabra.crotal}</span>}
                  </div>
                  <span style={{ fontSize: 11, color: "#94A3B8" }}>{a.fecha}</span>
                </div>
                <div style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.5, paddingLeft: 4 }}>{a.texto}</div>
              </div>
            );
          }) : <div style={{ textAlign: "center", color: "#94A3B8", padding: 20 }}>Aún no hay anotaciones. Añade la primera con el botón de arriba.</div>}
        </Card>
      )}

      {expandedCard === "alertas" && (
        <Card style={{ border: "2px solid #FECACA", animation: "fadeSlideIn .3s" }}>
          <SectionTitle icon="🚨" text={`Alertas Sanitarias — ${alertasActivas.length} activas`} color="#DC2626" />
          {alertasActivas.length > 0 ? alertasActivas.map((a, i) => (
            <div key={i} style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: 14, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#DC2626" }}>{a.titulo}</span>
                  <span style={{ fontSize: 10, color: "#94A3B8", marginLeft: 8 }}>{a.fecha}</span>
                </div>
                <button onClick={() => resolveAlert(a.id)} style={{ padding: "4px 12px", borderRadius: 7, border: "1px solid #BBF7D0", background: "#F0FDF4", color: "#059669", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>✓ Resuelta</button>
              </div>
              <div style={{ fontSize: 12, color: "#7F1D1D", lineHeight: 1.5 }}>{a.descripcion}</div>
              {a.cabras_afectadas && a.cabras_afectadas.length > 0 && (
                <div style={{ fontSize: 10.5, color: "#94A3B8", marginTop: 6 }}>Cabras: {a.cabras_afectadas.join(", ")}</div>
              )}
            </div>
          )) : <div style={{ textAlign: "center", color: "#94A3B8", padding: 20 }}>Sin alertas activas. Las alertas se generan automáticamente al detectar patrones anómalos.</div>}
          {alertasPersistentes.filter(a => a.estado === "resuelta").length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8", marginBottom: 8 }}>Historial de alertas resueltas</div>
              {alertasPersistentes.filter(a => a.estado === "resuelta").slice(0, 10).map((a, i) => (
                <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid #F1F5F9", opacity: 0.6 }}>
                  <span style={{ fontSize: 11, color: "#64748B" }}>✓ {a.fecha}: {a.titulo}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Chat sanitario */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20 }}>
        <ChatBox messages={sanMsgs} input={sanMsg} setInput={setSanMsg} onSend={sendSan}
          examples={["¿Por qué hay tantas cabras con conductividad alta?", "Analiza patrones de mastitis", "¿Qué cabras debería descartar?", "Revisa las anotaciones del veterinario"]}
          onExample={setSanMsg}
          placeholder="Pregunta sobre sanidad..."
          height={350}
          onSave={saveChat} pageName="sanidad"
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card style={{ background: "linear-gradient(135deg, #FEF9EE, #FFF7ED)", border: "1px solid #FDE68A" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#E8950A", marginBottom: 8 }}>💡 Resumen rápido</div>
            {[
              `${highCond.length} cabras con conductividad >6.0`,
              condPatterns.length > 0 ? `⚠️ ${condPatterns.length} patrón${condPatterns.length > 1 ? "es" : ""} detectado${condPatterns.length > 1 ? "s" : ""}` : "✅ Sin patrones anómalos",
              `${cullCandidates.length} candidatas a descarte`,
              `${dobleVacias.length} doble vacías`,
              condRising.length > 0 ? `📈 ${condRising.length} cabras con conductividad subiendo` : null,
              `${anotaciones.length} anotaciones veterinarias`,
            ].filter(Boolean).map((t, i) => (
              <div key={i} style={{ fontSize: 11.5, color: "#78590A", padding: "3px 0", display: "flex", gap: 6 }}>
                <span style={{ color: "#E8950A" }}>→</span>{t}
              </div>
            ))}
          </Card>
          <Card style={{ background: "#F0F9FF", border: "1px solid #BAE6FD" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0891B2", marginBottom: 8 }}>🐐 Sobre esta página</div>
            <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.6 }}>
              Esta página analiza automáticamente los datos de producción, ecografías y anotaciones para detectar problemas sanitarios. Las alertas se guardan y persisten entre sesiones para que no se pierda nada aunque no revises la app a diario.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// CHATS GUARDADOS
// ==========================================
// ==========================================
// ANOMALÍAS — Control de errores y revisiones
// ==========================================
function detectAnomalias(data) {
  const anomalias = [];
  const prod = data.produccion || [];
  const latestDate = [...new Set(prod.map(p => p.fecha))].sort((a, b) => b.localeCompare(a))[0];
  const todayProd = latestDate ? prod.filter(p => p.fecha === latestDate) : [];
  const prodById = {};
  todayProd.forEach(p => { prodById[p.cabra_id] = p; });

  const loteDEL = {};
  data.cabras.forEach(c => {
    const lote = data.lotes.find(l => l.id === c.lote_id);
    if (!lote) return;
    const p = prodById[c.id];
    const del = p?.dia_lactacion || c.dias_en_leche || 0;
    if (!loteDEL[lote.nombre]) loteDEL[lote.nombre] = { dels: [], lote };
    loteDEL[lote.nombre].dels.push({ crotal: c.crotal, del, litros: p?.litros || 0, cabra_id: c.id, conductividad: p?.conductividad || 0 });
  });

  Object.entries(loteDEL).forEach(([loteName, info]) => {
    if (info.dels.length < 3) return;
    const avgDEL = info.dels.reduce((s, d) => s + d.del, 0) / info.dels.length;
    const estado = info.lote.estado || 'produccion';

    info.dels.forEach(d => {
      if (Math.abs(d.del - avgDEL) > 100 && d.del > 0) {
        anomalias.push({ tipo: "lote_incorrecto", severidad: "media", crotal: d.crotal, lote: loteName,
          descripcion: `DEL=${d.del} (media lote=${Math.round(avgDEL)}). Diferencia de ${Math.abs(Math.round(d.del - avgDEL))} días.`,
          hipotesis: `Esta cabra tiene un DEL muy diferente al resto del lote. Probablemente se quedó en este lote por error después de un cambio de grupo o una importación.`,
          accion: `Revisar si esta cabra debería estar en otro lote según su estado reproductivo y días de lactación.` });
      }
      if (estado === 'secandose' && d.litros > 3.0) {
        anomalias.push({ tipo: "secado_sospechoso", severidad: "alta", crotal: d.crotal, lote: loteName,
          descripcion: `Produce ${d.litros.toFixed(1)}L en lote marcado como secándose.`,
          hipotesis: `Esta cabra aún produce bien. Puede que se haya incluido por error en el grupo de secado, o que el secado no se haya iniciado correctamente.`,
          accion: `Verificar si esta cabra debe seguir ordeñándose o si el protocolo de secado se ha aplicado.` });
      }
      if ((loteName.includes("Lote 5") || loteName.includes("Lote 13")) && d.del > 150) {
        anomalias.push({ tipo: "lote_incorrecto", severidad: "alta", crotal: d.crotal, lote: loteName,
          descripcion: `DEL=${d.del} en lote de recién paridas.`,
          hipotesis: `Las cabras de este lote deberían tener pocos DEL (paridas ene/feb). Esta cabra lleva demasiado tiempo y no se movió al lote de cubrición.`,
          accion: `Mover a Lote 1 o 4 para evaluación de cubrición. Si cumple requisitos, preparar para próxima paridera.` });
      }
      if (loteName.includes("Lote 2") && d.del > 100) {
        anomalias.push({ tipo: "parto_no_registrado", severidad: "media", crotal: d.crotal, lote: loteName,
          descripcion: `DEL=${d.del} en lote de pariendo.`,
          hipotesis: `Esta cabra probablemente ya parió pero no se registró el parto ni se movió de lote.`,
          accion: `Confirmar si parió, registrar el parto en el sistema y mover al lote correspondiente.` });
      }
    });
  });

  // Vacías en Lote 6
  const lote6 = data.lotes.find(l => l.nombre && l.nombre.includes("Lote 6"));
  if (lote6) {
    data.cabras.filter(c => c.lote_id === lote6.id).forEach(c => {
      const ecos = data.ecografias.filter(e => e.cabra?.crotal === c.crotal);
      if (ecos.length > 0) {
        const lastEco = ecos.sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
        if (lastEco.resultado === 'vacia') {
          anomalias.push({ tipo: "vacia_sin_mover", severidad: "alta", crotal: c.crotal, lote: "Lote 6",
            descripcion: `Última eco VACÍA (${lastEco.fecha}) pero sigue en Lote 6 con gestantes.`,
            hipotesis: `Después de las ecografías, esta cabra debió moverse a cubrición pero se quedó con las gestantes por error humano. Cada día que pasa pierde tiempo reproductivo.`,
            accion: `Mover INMEDIATAMENTE a Lote 1 o 4 y preparar para cubrición en la próxima paridera.` });
        }
      }
    });
  }

  // Gestantes en lote producción sin secado
  data.cabras.forEach(c => {
    const ecos = data.ecografias.filter(e => e.cabra?.crotal === c.crotal);
    if (ecos.length === 0) return;
    const lastEco = ecos.sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    const lote = data.lotes.find(l => l.id === c.lote_id);
    if (lastEco.resultado === 'gestante' && lote && (lote.nombre.includes("Lote 1") || lote.nombre.includes("Lote 4"))) {
      const p = prodById[c.id];
      const del = p?.dia_lactacion || c.dias_en_leche || 0;
      if (del > 250) {
        anomalias.push({ tipo: "secado_pendiente", severidad: "alta", crotal: c.crotal, lote: lote.nombre,
          descripcion: `GESTANTE (eco ${lastEco.fecha}) con DEL=${del}, sigue en producción.`,
          hipotesis: `Esta cabra confirmó gestación pero no se ha iniciado el proceso de secado. Con >250 DEL y gestante, debería estar preparándose para secar.`,
          accion: `Evaluar fecha de parto estimada y programar secado. Mover a lote de secas si corresponde.` });
      }
    }
  });

  // Sin lote con producción
  data.cabras.filter(c => !c.lote_id).forEach(c => {
    const p = prodById[c.id];
    if (p && p.litros > 0) {
      anomalias.push({ tipo: "sin_lote", severidad: "media", crotal: c.crotal, lote: "Sin lote",
        descripcion: `Produce ${p.litros.toFixed(1)}L pero no tiene lote asignado.`,
        hipotesis: `Esta cabra se creó o importó sin asignar lote. Puede ser nueva del censo o un error de importación del FLM.`,
        accion: `Asignar al lote correspondiente según su estado reproductivo y días de lactación.` });
    }
  });

  return anomalias;
}

function AnomalíasPage({ data, refresh }) {
  const [vista, setVista] = useState("pendientes");
  const [filtroTipo, setFiltroTipo] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const anomaliasVivas = detectAnomalias(data);
  const anomaliasBD = data.anomalias || [];

  useEffect(() => {
    const persistir = async () => {
      const today = new Date().toISOString().split("T")[0];
      const todayBD = anomaliasBD.filter(a => a.fecha === today);
      if (todayBD.length > 0 || anomaliasVivas.length === 0) return;
      const toInsert = anomaliasVivas.map(a => ({
        fecha: today, tipo: a.tipo, severidad: a.severidad, crotal: a.crotal,
        lote_nombre: a.lote, descripcion: a.descripcion, hipotesis: a.hipotesis, accion: a.accion,
      }));
      if (toInsert.length > 0) {
        await supabase.from("anomalia_detectada").insert(toInsert);
        refresh();
      }
    };
    persistir();
  }, [anomaliasVivas.length]);

  const updateEstado = async (id, estado) => {
    const updates = { estado };
    if (estado === "resuelta") updates.resuelto_at = new Date().toISOString();
    await supabase.from("anomalia_detectada").update(updates).eq("id", id);
    refresh();
  };

  const tipoConfig = {
    lote_incorrecto: { icon: "🔀", label: "Lote Incorrecto", color: "#E8950A" },
    secado_sospechoso: { icon: "⏸️", label: "Secado Sospechoso", color: "#7C3AED" },
    vacia_sin_mover: { icon: "🔴", label: "Vacía Sin Mover", color: "#DC2626" },
    secado_pendiente: { icon: "⏳", label: "Secado Pendiente", color: "#DB2777" },
    parto_no_registrado: { icon: "🍼", label: "Parto No Registrado", color: "#EA580C" },
    sin_lote: { icon: "❓", label: "Sin Lote", color: "#0891B2" },
  };

  const today = new Date().toISOString().split("T")[0];
  const allAnomalias = anomaliasBD.length > 0 ? anomaliasBD : anomaliasVivas.map((a, i) => ({ ...a, id: `live-${i}`, fecha: today, estado: "pendiente" }));
  const pendientes = allAnomalias.filter(a => a.estado === "pendiente");
  const enRevision = allAnomalias.filter(a => a.estado === "revisando");
  const resueltas = allAnomalias.filter(a => a.estado === "resuelta");
  const currentList = vista === "pendientes" ? pendientes : vista === "revisando" ? enRevision : resueltas;
  const filtered = filtroTipo ? currentList.filter(a => a.tipo === filtroTipo) : currentList;
  const byTipo = {};
  filtered.forEach(a => { const t = a.tipo || "otro"; if (!byTipo[t]) byTipo[t] = []; byTipo[t].push(a); });

  const renderCard = (a, i, tipo) => {
    const cfg = tipoConfig[tipo] || { icon: "🔍", label: tipo, color: "#64748B" };
    const isExpanded = expandedId === (a.id || `${tipo}-${i}`);
    return (
      <div key={a.id || i} style={{ background: "#FFF", border: `1px solid ${a.estado === "pendiente" ? cfg.color + "40" : "#EEF2F6"}`, borderRadius: 14, overflow: "hidden" }}>
        <div onClick={() => setExpandedId(isExpanded ? null : (a.id || `${tipo}-${i}`))}
          style={{ padding: "14px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
          onMouseEnter={e => e.currentTarget.style.background = "#F8FAFC"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
            <span style={{ fontSize: 15 }}>{cfg.icon}</span>
            <span style={{ fontSize: 13, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: "#1E293B", minWidth: 60 }}>{a.crotal || "-"}</span>
            <span style={{ fontSize: 12, color: "#64748B", flex: 1 }}>{a.descripcion}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: "#94A3B8" }}>{a.lote_nombre || a.lote}</span>
            <span style={{ fontSize: 10, color: "#94A3B8" }}>{a.fecha}</span>
            <span style={{ fontSize: 11, color: "#94A3B8" }}>{isExpanded ? "▲" : "▼"}</span>
          </div>
        </div>
        {isExpanded && (
          <div style={{ padding: "0 18px 16px", borderTop: "1px solid #F1F5F9", animation: "fadeSlideIn .2s" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
              <div style={{ background: "#F8FAFC", borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", marginBottom: 6 }}>🔍 Hipótesis</div>
                <div style={{ fontSize: 12.5, color: "#334155", lineHeight: 1.6 }}>{a.hipotesis || "Sin hipótesis disponible"}</div>
              </div>
              <div style={{ background: "#F0FDF4", borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#059669", textTransform: "uppercase", marginBottom: 6 }}>✅ Acción Recomendada</div>
                <div style={{ fontSize: 12.5, color: "#334155", lineHeight: 1.6 }}>{a.accion || "Sin acción definida"}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
              <span style={{ fontSize: 11, color: "#94A3B8", padding: "6px 0", flex: 1 }}>Detectada: {a.fecha} · Severidad: {a.severidad}</span>
              {a.id && typeof a.id === "number" && a.estado === "pendiente" && (<>
                <button onClick={e => { e.stopPropagation(); updateEstado(a.id, "revisando"); }} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #FDE68A", background: "#FEF9EE", color: "#E8950A", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>👁️ En revisión</button>
                <button onClick={e => { e.stopPropagation(); updateEstado(a.id, "resuelta"); }} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #BBF7D0", background: "#F0FDF4", color: "#059669", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>✓ Resuelta</button>
              </>)}
              {a.id && typeof a.id === "number" && a.estado === "revisando" && (
                <button onClick={e => { e.stopPropagation(); updateEstado(a.id, "resuelta"); }} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #BBF7D0", background: "#F0FDF4", color: "#059669", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>✓ Marcar resuelta</button>
              )}
              {a.estado === "resuelta" && a.resuelto_at && <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>✓ Resuelta el {new Date(a.resuelto_at).toLocaleDateString("es-ES")}</span>}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <div onClick={() => { setVista("pendientes"); setFiltroTipo(null); setExpandedId(null); }}
          style={{ background: vista === "pendientes" ? "#DC2626" : "#FEF2F2", border: `2px solid ${vista === "pendientes" ? "#DC2626" : "#FECACA"}`, borderRadius: 16, padding: "20px 24px", cursor: "pointer", transition: "all .2s" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 22 }}>🔴</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: vista === "pendientes" ? "#FFF" : "#DC2626" }}>Pendientes</span>
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, color: vista === "pendientes" ? "#FFF" : "#DC2626", fontFamily: "'Space Mono', monospace" }}>{pendientes.length}</div>
          <div style={{ fontSize: 11, color: vista === "pendientes" ? "#FECACA" : "#94A3B8", marginTop: 2 }}>Requieren atención inmediata</div>
        </div>
        <div onClick={() => { setVista("revisando"); setFiltroTipo(null); setExpandedId(null); }}
          style={{ background: vista === "revisando" ? "#E8950A" : "#FEF9EE", border: `2px solid ${vista === "revisando" ? "#E8950A" : "#FDE68A"}`, borderRadius: 16, padding: "20px 24px", cursor: "pointer", transition: "all .2s" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 22 }}>👁️</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: vista === "revisando" ? "#FFF" : "#E8950A" }}>En revisión</span>
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, color: vista === "revisando" ? "#FFF" : "#E8950A", fontFamily: "'Space Mono', monospace" }}>{enRevision.length}</div>
          <div style={{ fontSize: 11, color: vista === "revisando" ? "#FDE68A" : "#94A3B8", marginTop: 2 }}>Estás trabajando en ellas</div>
        </div>
        <div onClick={() => { setVista("resueltas"); setFiltroTipo(null); setExpandedId(null); }}
          style={{ background: vista === "resueltas" ? "#059669" : "#F0FDF4", border: `2px solid ${vista === "resueltas" ? "#059669" : "#BBF7D0"}`, borderRadius: 16, padding: "20px 24px", cursor: "pointer", transition: "all .2s" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 22 }}>✅</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: vista === "resueltas" ? "#FFF" : "#059669" }}>Resueltas</span>
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, color: vista === "resueltas" ? "#FFF" : "#059669", fontFamily: "'Space Mono', monospace" }}>{resueltas.length}</div>
          <div style={{ fontSize: 11, color: vista === "resueltas" ? "#BBF7D0" : "#94A3B8", marginTop: 2 }}>Historial de correcciones</div>
        </div>
      </div>
      {currentList.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={() => setFiltroTipo(null)} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: !filtroTipo ? "2px solid #1E293B" : "1px solid #E2E8F0", background: !filtroTipo ? "#1E293B" : "#FFF", color: !filtroTipo ? "#FFF" : "#64748B" }}>Todas ({currentList.length})</button>
          {Object.entries(tipoConfig).map(([tipo, cfg]) => {
            const count = currentList.filter(a => a.tipo === tipo).length;
            if (count === 0) return null;
            return <button key={tipo} onClick={() => setFiltroTipo(filtroTipo === tipo ? null : tipo)} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: filtroTipo === tipo ? `2px solid ${cfg.color}` : "1px solid #E2E8F0", background: filtroTipo === tipo ? `${cfg.color}12` : "#FFF", color: filtroTipo === tipo ? cfg.color : "#64748B" }}>{cfg.icon} {cfg.label} ({count})</button>;
          })}
        </div>
      )}
      {Object.entries(byTipo).map(([tipo, items]) => {
        const cfg = tipoConfig[tipo] || { icon: "🔍", label: tipo, color: "#64748B" };
        return (
          <div key={tipo}>
            <div style={{ fontSize: 14, fontWeight: 700, color: cfg.color, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 18 }}>{cfg.icon}</span> {cfg.label} ({items.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{items.map((a, i) => renderCard(a, i, tipo))}</div>
          </div>
        );
      })}
      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{vista === "pendientes" ? "✅" : vista === "revisando" ? "👁️" : "📋"}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: vista === "pendientes" ? "#059669" : "#64748B", marginBottom: 8 }}>{vista === "pendientes" ? "Sin anomalías pendientes" : vista === "revisando" ? "Nada en revisión" : "Sin historial"}</div>
          <div style={{ fontSize: 14, color: "#94A3B8" }}>{vista === "pendientes" ? "Todo en orden — no se detectan errores." : vista === "revisando" ? "No hay anomalías en revisión." : "Las resueltas aparecerán aquí."}</div>
        </div>
      )}
    </div>
  );
}



// ==========================================
// CHATS GUARDADOS
// ==========================================
function GuardadosPage({ data, refresh }) {
  const [viewChat, setViewChat] = useState(null);
  const chats = data.chatsGuardados || [];
  const tipoColors = { consultas: "#E8950A", produccion: "#059669", sanidad: "#DC2626", rentabilidad: "#7C3AED", importador: "#0891B2", general: "#64748B" };
  const tipoIcons = { consultas: "💬", produccion: "🥛", sanidad: "🏥", rentabilidad: "💰", importador: "📁", general: "📋" };

  const deleteChat = async (id) => {
    await supabase.from("chat_guardado").delete().eq("id", id);
    refresh();
  };

  if (viewChat) {
    const msgs = typeof viewChat.mensajes === "string" ? JSON.parse(viewChat.mensajes) : viewChat.mensajes;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setViewChat(null)} style={{ padding: "8px 16px", borderRadius: 9, border: "1px solid #E2E8F0", background: "#F8FAFC", cursor: "pointer", fontSize: 12, color: "#64748B", fontWeight: 600 }}>← Volver</button>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#1E293B" }}>{viewChat.nombre}</span>
            <Badge text={viewChat.pagina} color={tipoColors[viewChat.pagina] || "#64748B"} />
          </div>
          <span style={{ fontSize: 12, color: "#94A3B8" }}>{new Date(viewChat.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "calc(100vh - 250px)", overflow: "auto" }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: m.role === "user" ? "80%" : "95%" }}>
                <div style={{ background: m.role === "user" ? "#FEF9EE" : "#F8FAFC", border: `1px solid ${m.role === "user" ? "#FDE68A" : "#F1F5F9"}`, borderRadius: 13, padding: "12px 17px", fontSize: 13.5, color: "#334155", lineHeight: 1.6 }}>
                  {m.role === "assistant" ? <FormattedMessage text={m.text} /> : m.text}
                </div>
                {m.role === "assistant" && (
                  <div style={{ display: "flex", gap: 6, marginTop: 4, justifyContent: "flex-end" }}>
                    <button onClick={() => downloadPDF(m.text, msgs[i - 1]?.text || "Consulta")} title="Descargar PDF"
                      style={{ background: "transparent", border: "1px solid #E2E8F0", borderRadius: 6, padding: "3px 8px", fontSize: 10.5, color: "#94A3B8", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "#E8950A"; e.currentTarget.style.color = "#E8950A"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.color = "#94A3B8"; }}>
                      {"📄"} PDF
                    </button>
                    <button onClick={() => downloadExcel(m.text, msgs[i - 1]?.text || "Consulta")} title="Descargar Excel"
                      style={{ background: "transparent", border: "1px solid #E2E8F0", borderRadius: 6, padding: "3px 8px", fontSize: 10.5, color: "#94A3B8", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "#059669"; e.currentTarget.style.color = "#059669"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.color = "#94A3B8"; }}>
                      {"📊"} Excel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {chats.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💾</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#1E293B", marginBottom: 8 }}>Sin chats guardados</div>
          <div style={{ fontSize: 14, color: "#94A3B8" }}>Cuando tengas una conversación importante, pulsa "💾 Guardar" en cualquier chat para guardarla aquí.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
          {chats.map((chat, i) => {
            const msgs = typeof chat.mensajes === "string" ? JSON.parse(chat.mensajes) : chat.mensajes;
            const lastMsg = msgs.filter(m => m.role === "assistant").pop();
            const preview = lastMsg ? lastMsg.text.substring(0, 120).replace(/[#*]/g, "") + "..." : "";
            return (
              <div key={i} onClick={() => setViewChat(chat)}
                style={{ background: "#FFF", border: "1px solid #EEF2F6", borderRadius: 16, padding: "18px 22px", cursor: "pointer", transition: "all .2s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = `${tipoColors[chat.pagina]}50`; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 6px 20px ${tipoColors[chat.pagina]}10`; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#EEF2F6"; e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "none"; }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{tipoIcons[chat.pagina] || "📋"}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#1E293B" }}>{chat.nombre}</span>
                  </div>
                  <button onClick={e => { e.stopPropagation(); deleteChat(chat.id); }} title="Eliminar" style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid #FECACA", background: "#FEF2F2", cursor: "pointer", fontSize: 10, color: "#DC2626", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                </div>
                <div style={{ fontSize: 11.5, color: "#64748B", lineHeight: 1.5, marginBottom: 10 }}>{preview}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Badge text={chat.pagina} color={tipoColors[chat.pagina] || "#64748B"} />
                  <span style={{ fontSize: 11, color: "#94A3B8" }}>{new Date(chat.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {msgs.length} msgs</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ==========================================
// MAIN APP
// ==========================================
const NAV = [
  { id: "dashboard", icon: "📊", label: "Dashboard" },
  { id: "produccion", icon: "🥛", label: "Producción" },
  { id: "sanidad", icon: "🏥", label: "Sanidad" },
  { id: "rentabilidad", icon: "💰", label: "Rentabilidad" },
  { id: "importador", icon: "📁", label: "Importador" },
  { id: "consultas", icon: "💬", label: "Consultas" },
  { id: "anomalias", icon: "🔍", label: "Anomalías" },
  { id: "guardados", icon: "💾", label: "Guardados" },
  { id: "config", icon: "⚙️", label: "Config" },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage] = useState("dashboard");
  const [time, setTime] = useState(new Date());
  const { data, loading, refresh } = useSupabaseData();

  // Check existing session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user || null));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { const t = setInterval(() => setTime(new Date()), 60000); return () => clearInterval(t); }, []);

  if (authLoading) return <LoadingScreen />;
  if (!user) return <LoginPage onLogin={setUser} />;
  if (loading || !data) return <LoadingScreen />;

  const handleLogout = async () => { await supabase.auth.signOut(); setUser(null); };

  const saveChat = async (nombre, mensajes, pagina) => {
    await supabase.from("chat_guardado").insert([{ nombre, pagina, mensajes: JSON.stringify(mensajes) }]);
    refresh();
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FA", fontFamily: "'Outfit', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap');
        @keyframes fadeSlideIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes slideUp { from { opacity:0; transform:translateY(18px) } to { opacity:1; transform:translateY(0) } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.4 } }
        @keyframes bounce { 0%,80%,100% { transform:scale(0) } 40% { transform:scale(1) } }
        * { box-sizing:border-box; margin:0; padding:0 }
        ::-webkit-scrollbar { width:5px }
        ::-webkit-scrollbar-track { background:transparent }
        ::-webkit-scrollbar-thumb { background:#CBD5E1; border-radius:3px }
      `}</style>

      <div style={{ background: "#FFF", borderBottom: "1px solid #E2E8F0", padding: "0 28px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ width: 35, height: 35, borderRadius: 10, background: "linear-gradient(135deg, #E8950A, #CA8106)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, color: "#FFF" }}>🐐</div>
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: "-.02em" }}><span style={{ color: "#E8950A" }}>PEÑAS</span> <span style={{ color: "#1E293B" }}>CERCADAS</span></div>
            <div style={{ fontSize: 9, color: "#94A3B8", letterSpacing: ".1em", textTransform: "uppercase" }}>Sistema de Gestión Ganadera</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {NAV.map(item => (
            <button key={item.id} onClick={() => setPage(item.id)} style={{
              background: page === item.id ? "#FEF9EE" : "transparent",
              border: page === item.id ? "1px solid #FDE68A" : "1px solid transparent",
              borderRadius: 9, padding: "6px 14px", color: page === item.id ? "#E8950A" : "#64748B",
              fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "'Outfit', sans-serif",
            }}
              onMouseEnter={e => { if (page !== item.id) e.currentTarget.style.color = "#1E293B"; }}
              onMouseLeave={e => { if (page !== item.id) e.currentTarget.style.color = "#64748B"; }}
            ><span style={{ fontSize: 14 }}>{item.icon}</span>{item.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 11.5, color: "#94A3B8", fontFamily: "'Space Mono', monospace" }}>
            {time.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}
          </div>
          <div onClick={handleLogout} title="Cerrar sesión" style={{ width: 32, height: 32, borderRadius: 9, background: "#FEF9EE", border: "1px solid #FDE68A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#E8950A", cursor: "pointer" }}>
            {user.email?.charAt(0).toUpperCase()}
          </div>
        </div>
      </div>

      <div style={{ padding: "22px 28px", maxWidth: 1360, margin: "0 auto" }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 23, fontWeight: 800, color: "#1E293B", letterSpacing: "-.02em" }}>
            {{ dashboard: "Dashboard", produccion: "Producción & Análisis", sanidad: "Centro de Control Sanitario", rentabilidad: "Rentabilidad y Previsiones", importador: "Importador de Datos", consultas: "Consultas y Análisis", anomalias: "Control de Anomalías", guardados: "Chats Guardados", config: "Configuración" }[page]}
          </div>
          <div style={{ fontSize: 12.5, color: "#94A3B8", marginTop: 3 }}>
            {{ dashboard: `Datos en vivo de Supabase · ${data.cabras.length} cabras · ${data.parideras.length} parideras`,
              produccion: `Análisis productivo · ${data.produccion?.length || 0} registros · Alertas sanitarias`,
              sanidad: "Alertas, patrones, conductividad, anotaciones veterinarias, candidatas a descarte",
              rentabilidad: "Análisis financiero · Previsión de producción · Control de ingresos y gastos",
              importador: "Importa CSV o registra tratamientos, muertes y cambios por chat",
              consultas: "Pregunta lo que quieras — respuestas con datos reales",
              anomalias: "Errores de gestión, cabras mal ubicadas, revisiones pendientes",
              guardados: `${(data.chatsGuardados || []).length} conversaciones guardadas`,
              config: `${data.reglas.length} reglas · ${data.protocolos.length} protocolos veterinarios` }[page]}
          </div>
        </div>
        {page === "dashboard" && <DashboardPage data={data} />}
        <div style={{ display: page === "produccion" ? "block" : "none" }}><ProduccionPage data={data} saveChat={saveChat} /></div>
        <div style={{ display: page === "sanidad" ? "block" : "none" }}><SanidadPage data={data} refresh={refresh} saveChat={saveChat} /></div>
        <div style={{ display: page === "rentabilidad" ? "block" : "none" }}><RentabilidadPage data={data} saveChat={saveChat} /></div>
        <div style={{ display: page === "importador" ? "block" : "none" }}><ImportadorPage data={data} refresh={refresh} saveChat={saveChat} /></div>
        <div style={{ display: page === "consultas" ? "block" : "none" }}><ConsultasPage data={data} saveChat={saveChat} /></div>
        <div style={{ display: page === "anomalias" ? "block" : "none" }}><AnomalíasPage data={data} refresh={refresh} /></div>
        <div style={{ display: page === "guardados" ? "block" : "none" }}><GuardadosPage data={data} refresh={refresh} /></div>
        {page === "config" && <ConfigPage data={data} refresh={refresh} />}
      </div>
    </div>
  );
}
