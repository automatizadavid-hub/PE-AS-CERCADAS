import { useState, useEffect, useRef } from "react";

// ==========================================
// APP PEÑAS CERCADAS v2 - Light Theme + Expandable Cards
// ==========================================

const FARM_DATA = {
  lotes: [
    { nombre: "Lote 1 - Alta Producción", cabras: 74, color: "#E8950A", estado: "lactacion" },
    { nombre: "Grupo 13 - Paridera Feb", cabras: 99, color: "#059669", estado: "recien_parida" },
    { nombre: "Lote 2 - Pariendo", cabras: 11, color: "#DB2777", estado: "recien_parida" },
    { nombre: "Lote 3 - Secándose", cabras: 98, color: "#7C3AED", estado: "preparto" },
    { nombre: "Lote 4 - Baja Producción", cabras: 28, color: "#DC2626", estado: "lactacion" },
    { nombre: "Lote 5 - Chotas Nuevas", cabras: 107, color: "#0891B2", estado: "recien_parida" },
    { nombre: "Lote 6 - Con Machos", cabras: 109, color: "#EA580C", estado: "cubricion" },
  ],
  alertas: [
    { tipo: "alta", msg: "7 cabras vacías en dos ecografías consecutivas", detalle: "056706, 057611, 057760, 057789, 699952, 700008, 701845", icon: "🔴" },
    { tipo: "alta", msg: "Paridera Mayo 2026: vacunar enterotoxemias en 23 días", detalle: "98 cabras del Lote 3 necesitan Polibascol antes del 9 de abril", icon: "💉" },
    { tipo: "alta", msg: "Paridera Mayo 2026: desparasitación pendiente", detalle: "98 cabras del Lote 3 necesitan desparasitación antes del 9 de abril", icon: "💊" },
    { tipo: "media", msg: "106 cabras en Lote 6 — retirar machos el 20 de marzo", detalle: "Machos entraron el 20 de febrero, se retiran en 3 días", icon: "📅" },
    { tipo: "media", msg: "147 crías paridera febrero: programar coccidiosis", detalle: "Crías nacidas ene-mar, destete próximamente", icon: "🐐" },
    { tipo: "info", msg: "36 inseminaciones 26-11-2025 pendientes de seguimiento", detalle: "5 machos utilizados. Verificar en próxima ecografía", icon: "📋" },
  ],
  calendario: [
    { fecha: "20 Mar 2026", evento: "Retirar machos Lote 6", tipo: "cubricion", urgente: true },
    { fecha: "09 Abr 2026", evento: "Vacunar enterotoxemias Lote 3", tipo: "sanidad", urgente: true },
    { fecha: "09 Abr 2026", evento: "Desparasitación Lote 3", tipo: "sanidad", urgente: true },
    { fecha: "26 Abr 2026", evento: "Ecografías Paridera Octubre", tipo: "ecografia", urgente: false },
    { fecha: "May 2026", evento: "Inicio partos Paridera Mayo", tipo: "parto", urgente: false },
    { fecha: "15 May 2026", evento: "Entrada machos nueva paridera", tipo: "cubricion", urgente: false },
    { fecha: "Jun 2026", evento: "Crotalado crías paridera febrero", tipo: "identificacion", urgente: false },
  ],
  pariderasDetalle: [
    { nombre: "Paridera Febrero 2026", machos: "15 Ago 2025", partos: "Ene-Mar 2026", estado: "En curso", progreso: 85, color: "#059669" },
    { nombre: "Paridera Mayo 2026", machos: "10 Dic 2025", partos: "Abr-May 2026", estado: "Gestación", progreso: 60, color: "#7C3AED" },
    { nombre: "Paridera Octubre 2026", machos: "20 Feb 2026", partos: "Jul 2026", estado: "Cubrición", progreso: 20, color: "#EA580C" },
  ],
  // Sample data for expandable cards
  partosData: [
    { crotal: "057968", fecha: "20/01/26", crias: 1, machos: 0, hembras: 1, peseta: "149", tipo: "normal" },
    { crotal: "058073", fecha: "20/01/26", crias: 1, machos: 0, hembras: 1, peseta: "163", tipo: "normal" },
    { crotal: "105932", fecha: "20/01/26", crias: 1, machos: 0, hembras: 1, peseta: "132", tipo: "normal" },
    { crotal: "057997", fecha: "22/01/26", crias: 2, machos: 0, hembras: 2, peseta: "062, 128", tipo: "normal" },
    { crotal: "058052", fecha: "23/01/26", crias: 2, machos: 0, hembras: 2, peseta: "153, 193", tipo: "normal" },
    { crotal: "056938", fecha: "08/02/26", crias: 3, machos: 0, hembras: 3, peseta: "211, 212, 213", tipo: "normal" },
    { crotal: "057643", fecha: "05/02/26", crias: 2, machos: 0, hembras: 2, peseta: "161, 082", tipo: "normal" },
    { crotal: "057964", fecha: "12/02/26", crias: 2, machos: 0, hembras: 2, peseta: "222, 223", tipo: "normal" },
    { crotal: "057693", fecha: "26/02/26", crias: 3, machos: 0, hembras: 3, peseta: "235, 236, 237", tipo: "normal" },
    { crotal: "056924", fecha: "24/02/26", crias: 3, machos: 3, hembras: 0, peseta: "-", tipo: "normal" },
    { crotal: "058057", fecha: "02/12/25", crias: 0, machos: 0, hembras: 0, peseta: "-", tipo: "aborto" },
    { crotal: "057801", fecha: "11/12/25", crias: 0, machos: 0, hembras: 0, peseta: "-", tipo: "aborto" },
    { crotal: "057005", fecha: "08/02/26", crias: 0, machos: 0, hembras: 0, peseta: "-", tipo: "nacido_muerto" },
  ],
  ecografiasData: [
    { crotal: "056693", fecha: "27/11/25", resultado: "Vacía", paridera: "Febrero 2026" },
    { crotal: "699981", fecha: "27/11/25", resultado: "Vacía", paridera: "Febrero 2026" },
    { crotal: "057789", fecha: "27/11/25", resultado: "Vacía", paridera: "Febrero 2026" },
    { crotal: "701932", fecha: "27/11/25", resultado: "Gestante", paridera: "Febrero 2026" },
    { crotal: "057779", fecha: "27/11/25", resultado: "Gestante", paridera: "Febrero 2026" },
    { crotal: "700053", fecha: "12/02/26", resultado: "Vacía", paridera: "Mayo 2026" },
    { crotal: "057760", fecha: "12/02/26", resultado: "Vacía", paridera: "Mayo 2026" },
    { crotal: "056706", fecha: "12/02/26", resultado: "Vacía", paridera: "Mayo 2026" },
    { crotal: "701845", fecha: "12/02/26", resultado: "Vacía", paridera: "Mayo 2026" },
    { crotal: "057737", fecha: "12/02/26", resultado: "Gestante", paridera: "Mayo 2026" },
    { crotal: "057971", fecha: "12/02/26", resultado: "Gestante", paridera: "Mayo 2026" },
    { crotal: "056706", fecha: "27/11/25", resultado: "Vacía", paridera: "Febrero 2026" },
    { crotal: "057760", fecha: "27/11/25", resultado: "Vacía", paridera: "Febrero 2026" },
    { crotal: "701845", fecha: "27/11/25", resultado: "Vacía", paridera: "Febrero 2026" },
  ],
  tratamientosData: [
    { crotal: "057928", fecha: "02/01/26", tipo: "Implante fertilidad", producto: "Implante" },
    { crotal: "057812", fecha: "02/01/26", tipo: "Implante fertilidad", producto: "Implante" },
    { crotal: "057006", fecha: "02/01/26", tipo: "Implante fertilidad", producto: "Implante" },
    { crotal: "056993", fecha: "20/02/26", tipo: "Esponja vaginal", producto: "Esponja" },
    { crotal: "057599", fecha: "20/02/26", tipo: "Esponja vaginal", producto: "Esponja" },
    { crotal: "057563", fecha: "20/02/26", tipo: "Esponja vaginal", producto: "Esponja" },
    { crotal: "056870", fecha: "20/02/26", tipo: "Esponja vaginal", producto: "Esponja" },
    { crotal: "057945", fecha: "20/02/26", tipo: "Esponja vaginal", producto: "Esponja" },
  ],
  cubricionesData: [
    { crotal: "056749", fecha: "26/11/25", metodo: "Inseminación", macho: "Macho 3", paridera: "Mayo 2026" },
    { crotal: "057871", fecha: "26/11/25", metodo: "Inseminación", macho: "Macho 3", paridera: "Mayo 2026" },
    { crotal: "700053", fecha: "11/12/25", metodo: "Monta natural", macho: "-", paridera: "Mayo 2026" },
    { crotal: "056822", fecha: "11/12/25", metodo: "Monta natural", macho: "-", paridera: "Mayo 2026" },
    { crotal: "692686", fecha: "20/02/26", metodo: "Monta natural", macho: "-", paridera: "Octubre 2026" },
    { crotal: "699556", fecha: "20/02/26", metodo: "Monta natural", macho: "-", paridera: "Octubre 2026" },
    { crotal: "057969", fecha: "20/02/26", metodo: "Monta natural", macho: "-", paridera: "Octubre 2026" },
  ],
  criasData: [
    { peseta: 149, madre: "057968", fecha: "20/01/26", sexo: "Hembra" },
    { peseta: 163, madre: "058073", fecha: "20/01/26", sexo: "Hembra" },
    { peseta: 132, madre: "105932", fecha: "20/01/26", sexo: "Hembra" },
    { peseta: 62, madre: "057997", fecha: "22/01/26", sexo: "Hembra" },
    { peseta: 128, madre: "057997", fecha: "22/01/26", sexo: "Hembra" },
    { peseta: 153, madre: "058052", fecha: "23/01/26", sexo: "Hembra" },
    { peseta: 193, madre: "058052", fecha: "23/01/26", sexo: "Hembra" },
    { peseta: 211, madre: "056938", fecha: "08/02/26", sexo: "Hembra" },
    { peseta: 212, madre: "056938", fecha: "08/02/26", sexo: "Hembra" },
    { peseta: 213, madre: "056938", fecha: "08/02/26", sexo: "Hembra" },
  ],
};

const CHAT_EXAMPLES = [
  "Dime las 40 mejores cabras por producción",
  "¿Qué cabras han salido vacías dos veces?",
  "Ficha completa de la cabra 057997",
  "¿Cuántas crías hembra tuvo la paridera de febrero?",
  "Cabras del Lote 3 sin vacuna de enterotoxemias",
  "Resumen de la paridera de febrero",
  "Cabras candidatas a cubrición anticipada",
];

// ==========================================
// MODAL for expanded card view
// ==========================================

function DataModal({ title, icon, accent, data, columns, onClose, searchPlaceholder }) {
  const [search, setSearch] = useState("");
  const filtered = data.filter(row =>
    Object.values(row).some(v => String(v).toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      animation: "fadeIn 0.2s ease",
    }} onClick={onClose}>
      <div style={{
        background: "#FFFFFF", borderRadius: 20, width: "85%", maxWidth: 900,
        maxHeight: "80vh", display: "flex", flexDirection: "column",
        boxShadow: "0 25px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)",
        animation: "slideUp 0.3s ease",
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: "20px 28px", borderBottom: "1px solid #F1F5F9",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: `${accent}12`, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20,
            }}>{icon}</div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#1E293B", fontFamily: "'DM Sans', sans-serif" }}>{title}</div>
              <div style={{ fontSize: 12, color: "#94A3B8" }}>{filtered.length} registros</div>
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 36, height: 36, borderRadius: 10, border: "1px solid #E2E8F0",
            background: "#F8FAFC", cursor: "pointer", fontSize: 18, color: "#94A3B8",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>×</button>
        </div>

        {/* Search */}
        <div style={{ padding: "16px 28px", borderBottom: "1px solid #F1F5F9" }}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16 }}>🔍</span>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder={searchPlaceholder || "Buscar por crotal, fecha, tipo..."}
              style={{
                width: "100%", padding: "12px 16px 12px 42px", borderRadius: 12,
                border: "2px solid #E2E8F0", fontSize: 14, color: "#1E293B",
                fontFamily: "'DM Sans', sans-serif", outline: "none",
                background: "#F8FAFC", transition: "all 0.2s ease",
              }}
              onFocus={e => { e.target.style.borderColor = accent; e.target.style.background = "#FFF"; }}
              onBlur={e => { e.target.style.borderColor = "#E2E8F0"; e.target.style.background = "#F8FAFC"; }}
            />
          </div>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflow: "auto", padding: "0 28px 20px" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 4px", marginTop: 8 }}>
            <thead>
              <tr>
                {columns.map((col, i) => (
                  <th key={i} style={{
                    textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 700,
                    color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em",
                    fontFamily: "'DM Sans', sans-serif", position: "sticky", top: 0, background: "#FFF",
                  }}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr key={i} style={{ cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#F8FAFC"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  {columns.map((col, j) => (
                    <td key={j} style={{
                      padding: "11px 14px", fontSize: 13, color: "#334155",
                      fontFamily: col.mono ? "'Space Grotesk', sans-serif" : "'DM Sans', sans-serif",
                      fontWeight: col.bold ? 700 : 400,
                      borderBottom: "1px solid #F1F5F9",
                    }}>
                      {col.render ? col.render(row[col.key], row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={columns.length} style={{ padding: 32, textAlign: "center", color: "#94A3B8", fontSize: 14 }}>
                  No se encontraron resultados para "{search}"
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// COMPONENTS
// ==========================================

function AnimatedNumber({ target, duration = 1200 }) {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCurrent(target); clearInterval(timer); }
      else setCurrent(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [target]);
  return <span>{current}</span>;
}

function KPICard({ icon, label, value, sub, accent, onClick }) {
  return (
    <div style={{
      background: "#FFFFFF",
      border: "1px solid #F1F5F9",
      borderRadius: 16,
      padding: "20px 22px",
      display: "flex", flexDirection: "column", gap: 6,
      position: "relative", overflow: "hidden",
      transition: "all 0.25s ease", cursor: "pointer",
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    }}
    onClick={onClick}
    onMouseEnter={e => {
      e.currentTarget.style.border = `1px solid ${accent}50`;
      e.currentTarget.style.transform = "translateY(-3px)";
      e.currentTarget.style.boxShadow = `0 8px 24px ${accent}18`;
    }}
    onMouseLeave={e => {
      e.currentTarget.style.border = "1px solid #F1F5F9";
      e.currentTarget.style.transform = "translateY(0)";
      e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
    }}
    >
      <div style={{ position: "absolute", top: -18, right: -14, fontSize: 72, opacity: 0.05 }}>{icon}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#94A3B8", letterSpacing: "0.05em", textTransform: "uppercase", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 14, opacity: 0.35, transition: "opacity 0.2s" }}>🔍</span>
      </div>
      <div style={{ fontSize: 34, fontWeight: 700, color: accent, fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1 }}>
        <AnimatedNumber target={value} />
      </div>
      {sub && <div style={{ fontSize: 12, color: "#94A3B8" }}>{sub}</div>}
    </div>
  );
}

function AlertCard({ alerta, index }) {
  const bgMap = { alta: "#FEF2F2", media: "#FFFBEB", info: "#EFF6FF" };
  const borderMap = { alta: "#FECACA", media: "#FDE68A", info: "#BFDBFE" };
  return (
    <div style={{
      background: bgMap[alerta.tipo], border: `1px solid ${borderMap[alerta.tipo]}`,
      borderRadius: 12, padding: "13px 16px",
      display: "flex", gap: 12, alignItems: "flex-start",
      animation: `fadeSlideIn 0.4s ease ${index * 0.08}s both`,
    }}>
      <div style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{alerta.icon}</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1E293B", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.4 }}>{alerta.msg}</div>
        <div style={{ fontSize: 11, color: "#64748B", marginTop: 3, lineHeight: 1.4 }}>{alerta.detalle}</div>
      </div>
    </div>
  );
}

function LoteBar({ lote, total, index }) {
  const pct = (lote.cabras / total * 100).toFixed(1);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", animation: `fadeSlideIn 0.4s ease ${index * 0.06}s both` }}>
      <div style={{ width: 10, height: 10, borderRadius: "50%", background: lote.color, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 12.5, color: "#475569", fontFamily: "'DM Sans', sans-serif" }}>{lote.nombre}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: lote.color, fontFamily: "'Space Grotesk', sans-serif" }}>{lote.cabras}</span>
        </div>
        <div style={{ height: 5, background: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 3, background: lote.color, width: `${pct}%`, transition: "width 1.5s ease" }} />
        </div>
      </div>
    </div>
  );
}

function CalendarioItem({ item, index }) {
  const colorMap = { cubricion: "#EA580C", sanidad: "#DC2626", ecografia: "#7C3AED", parto: "#059669", identificacion: "#0891B2" };
  return (
    <div style={{
      display: "flex", gap: 12, alignItems: "center", padding: "10px 14px", borderRadius: 10,
      background: item.urgente ? "#FEF2F2" : "#FAFAFA",
      border: `1px solid ${item.urgente ? "#FECACA" : "#F1F5F9"}`,
      animation: `fadeSlideIn 0.4s ease ${index * 0.06}s both`,
    }}>
      <div style={{ width: 4, height: 32, borderRadius: 2, background: colorMap[item.tipo] || "#94A3B8", flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1E293B", fontFamily: "'DM Sans', sans-serif" }}>{item.evento}</div>
        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{item.fecha}</div>
      </div>
      {item.urgente && <div style={{ fontSize: 9, padding: "3px 8px", borderRadius: 6, background: "#FEE2E2", color: "#DC2626", fontWeight: 700, letterSpacing: "0.05em" }}>URGENTE</div>}
    </div>
  );
}

function StatusBadge({ text, color }) {
  return (
    <span style={{
      fontSize: 11, padding: "3px 10px", borderRadius: 20,
      background: `${color}12`, color: color, fontWeight: 600,
      fontFamily: "'DM Sans', sans-serif",
    }}>{text}</span>
  );
}

// ==========================================
// PAGES
// ==========================================

function DashboardPage() {
  const [modal, setModal] = useState(null);

  const partoCols = [
    { key: "crotal", label: "Crotal", mono: true, bold: true },
    { key: "fecha", label: "Fecha", mono: true },
    { key: "crias", label: "Crías" },
    { key: "machos", label: "♂" },
    { key: "hembras", label: "♀" },
    { key: "peseta", label: "Pesetas", mono: true },
    { key: "tipo", label: "Tipo", render: (v) => {
      const colors = { normal: "#059669", aborto: "#DC2626", nacido_muerto: "#94A3B8" };
      return <StatusBadge text={v} color={colors[v] || "#94A3B8"} />;
    }},
  ];
  const ecoCols = [
    { key: "crotal", label: "Crotal", mono: true, bold: true },
    { key: "fecha", label: "Fecha", mono: true },
    { key: "resultado", label: "Resultado", render: (v) => <StatusBadge text={v} color={v === "Vacía" ? "#DC2626" : "#059669"} /> },
    { key: "paridera", label: "Paridera" },
  ];
  const tratCols = [
    { key: "crotal", label: "Crotal", mono: true, bold: true },
    { key: "fecha", label: "Fecha", mono: true },
    { key: "tipo", label: "Tratamiento" },
    { key: "producto", label: "Producto", render: (v) => <StatusBadge text={v} color={v === "Implante" ? "#7C3AED" : "#E8950A"} /> },
  ];
  const cubCols = [
    { key: "crotal", label: "Crotal", mono: true, bold: true },
    { key: "fecha", label: "Fecha", mono: true },
    { key: "metodo", label: "Método", render: (v) => <StatusBadge text={v} color={v === "Inseminación" ? "#7C3AED" : "#EA580C"} /> },
    { key: "macho", label: "Macho" },
    { key: "paridera", label: "Paridera" },
  ];
  const criasCols = [
    { key: "peseta", label: "Peseta", mono: true, bold: true },
    { key: "madre", label: "Madre", mono: true },
    { key: "fecha", label: "Nacimiento", mono: true },
    { key: "sexo", label: "Sexo", render: (v) => <StatusBadge text={v} color="#DB2777" /> },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: 14 }}>
        <KPICard icon="🐐" label="Cabras" value={580} sub="en 7 lotes" accent="#E8950A" onClick={() => {}} />
        <KPICard icon="🍼" label="Partos" value={226} sub="paridera febrero" accent="#059669" onClick={() => setModal("partos")} />
        <KPICard icon="🔬" label="Ecografías" value={296} sub="2 campañas" accent="#7C3AED" onClick={() => setModal("ecografias")} />
        <KPICard icon="💉" label="Tratamientos" value={98} sub="implantes + esponjas" accent="#0891B2" onClick={() => setModal("tratamientos")} />
        <KPICard icon="🐣" label="Crías" value={147} sub="hembras con peseta" accent="#DB2777" onClick={() => setModal("crias")} />
        <KPICard icon="🔗" label="Cubriciones" value={230} sub="3 campañas" accent="#EA580C" onClick={() => setModal("cubriciones")} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Alertas */}
        <div style={{ background: "#FFF", border: "1px solid #F1F5F9", borderRadius: 16, padding: "22px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#DC2626", marginBottom: 16, fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 8 }}>
            ⚠️ Alertas y Advertencias
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {FARM_DATA.alertas.map((a, i) => <AlertCard key={i} alerta={a} index={i} />)}
          </div>
        </div>

        {/* Right */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Calendario */}
          <div style={{ background: "#FFF", border: "1px solid #F1F5F9", borderRadius: 16, padding: "22px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0891B2", marginBottom: 14, fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 8 }}>
              📅 Próximos Eventos
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {FARM_DATA.calendario.map((c, i) => <CalendarioItem key={i} item={c} index={i} />)}
            </div>
          </div>

          {/* Lotes */}
          <div style={{ background: "#FFF", border: "1px solid #F1F5F9", borderRadius: 16, padding: "22px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1E293B", marginBottom: 12, fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 8 }}>
              📊 Distribución por Lotes
            </div>
            {FARM_DATA.lotes.map((l, i) => <LoteBar key={i} lote={l} total={580} index={i} />)}
          </div>
        </div>
      </div>

      {/* Parideras */}
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1E293B", marginBottom: 14, fontFamily: "'DM Sans', sans-serif" }}>
          🗓️ Estado de Parideras
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {FARM_DATA.pariderasDetalle.map((p, i) => (
            <div key={i} style={{
              background: "#FFF", border: "1px solid #F1F5F9", borderRadius: 14,
              padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              animation: `fadeSlideIn 0.5s ease ${i * 0.12}s both`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1E293B", fontFamily: "'DM Sans', sans-serif" }}>{p.nombre}</div>
                <StatusBadge text={p.estado} color={p.color} />
              </div>
              <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 12, color: "#64748B" }}>
                <div>Machos: {p.machos}</div>
                <div>Partos: {p.partos}</div>
              </div>
              <div style={{ height: 6, background: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 3, background: p.color, width: `${p.progreso}%`, transition: "width 2s ease" }} />
              </div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 5, textAlign: "right" }}>{p.progreso}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
      {modal === "partos" && <DataModal title="Partos — Paridera Febrero 2026" icon="🍼" accent="#059669" data={FARM_DATA.partosData} columns={partoCols} onClose={() => setModal(null)} searchPlaceholder="Buscar crotal, fecha, peseta..." />}
      {modal === "ecografias" && <DataModal title="Ecografías" icon="🔬" accent="#7C3AED" data={FARM_DATA.ecografiasData} columns={ecoCols} onClose={() => setModal(null)} searchPlaceholder="Buscar crotal, resultado, paridera..." />}
      {modal === "tratamientos" && <DataModal title="Tratamientos" icon="💉" accent="#0891B2" data={FARM_DATA.tratamientosData} columns={tratCols} onClose={() => setModal(null)} searchPlaceholder="Buscar crotal, tipo de tratamiento..." />}
      {modal === "cubriciones" && <DataModal title="Cubriciones" icon="🔗" accent="#EA580C" data={FARM_DATA.cubricionesData} columns={cubCols} onClose={() => setModal(null)} searchPlaceholder="Buscar crotal, método, paridera..." />}
      {modal === "crias" && <DataModal title="Crías Hembra con Peseta" icon="🐣" accent="#DB2777" data={FARM_DATA.criasData} columns={criasCols} onClose={() => setModal(null)} searchPlaceholder="Buscar peseta, madre, fecha..." />}
    </div>
  );
}

function ImportadorPage() {
  const [dragOver, setDragOver] = useState(false);
  const [chatMsg, setChatMsg] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Hola David. Sube un Excel y dime qué contiene — lo proceso y lo meto en la base de datos. También puedo registrar muertes, cambios de lote, o cualquier evento que me expliques." }
  ]);
  const tipos = [
    { icon: "📊", nombre: "Producción", desc: "Excel FLM" },
    { icon: "🔬", nombre: "Ecografías", desc: "Lector crotales" },
    { icon: "💉", nombre: "Tratamientos", desc: "Esponjas, vacunas..." },
    { icon: "🐣", nombre: "Paridera", desc: "Partos y crías" },
    { icon: "🐐", nombre: "Cubriciones", desc: "Entrada machos" },
    { icon: "📋", nombre: "Otro", desc: "Lo interpreto" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1E293B", marginBottom: 14, fontFamily: "'DM Sans', sans-serif" }}>📁 Subir Excel</div>
        <div style={{
          border: `2px dashed ${dragOver ? "#E8950A" : "#E2E8F0"}`, borderRadius: 16,
          padding: "44px 28px", textAlign: "center",
          background: dragOver ? "#FEF9EE" : "#FAFAFA", transition: "all 0.3s ease", cursor: "pointer",
        }}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); }}
        >
          <div style={{ fontSize: 44, marginBottom: 14 }}>📎</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#1E293B", marginBottom: 6 }}>Arrastra el Excel aquí</div>
          <div style={{ fontSize: 13, color: "#94A3B8" }}>o haz clic para seleccionar</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 14 }}>
          {tipos.map((t, i) => (
            <div key={i} style={{
              background: "#FFF", border: "1px solid #F1F5F9", borderRadius: 10,
              padding: "12px", textAlign: "center", cursor: "pointer", transition: "all 0.2s ease",
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#E8950A80"; e.currentTarget.style.background = "#FFFBF0"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#F1F5F9"; e.currentTarget.style.background = "#FFF"; }}
            >
              <div style={{ fontSize: 22, marginBottom: 4 }}>{t.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>{t.nombre}</div>
              <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{t.desc}</div>
            </div>
          ))}
        </div>
      </div>
      {/* Chat */}
      <div style={{
        background: "#FFF", border: "1px solid #F1F5F9", borderRadius: 16,
        display: "flex", flexDirection: "column", height: 500,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #F1F5F9", fontSize: 14, fontWeight: 700, color: "#E8950A" }}>
          💬 Explícame qué has hecho
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          {messages.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              background: m.role === "user" ? "#FEF9EE" : "#F8FAFC",
              border: `1px solid ${m.role === "user" ? "#FDE68A" : "#F1F5F9"}`,
              borderRadius: 12, padding: "11px 16px", maxWidth: "85%",
              fontSize: 13, color: "#334155", lineHeight: 1.5,
            }}>{m.text}</div>
          ))}
        </div>
        <div style={{ padding: "12px 16px", borderTop: "1px solid #F1F5F9", display: "flex", gap: 10 }}>
          <input value={chatMsg} onChange={e => setChatMsg(e.target.value)}
            placeholder="Ej: 'Hoy hemos ecografiado las del lote 3...'"
            style={{
              flex: 1, background: "#F8FAFC", border: "2px solid #E2E8F0",
              borderRadius: 10, padding: "10px 16px", color: "#1E293B", fontSize: 13, outline: "none",
            }}
            onFocus={e => e.target.style.borderColor = "#E8950A"}
            onBlur={e => e.target.style.borderColor = "#E2E8F0"}
          />
          <button style={{
            background: "linear-gradient(135deg, #E8950A, #CA8106)", border: "none", borderRadius: 10,
            padding: "10px 20px", color: "#FFF", fontWeight: 700, fontSize: 13, cursor: "pointer",
          }}>Enviar</button>
        </div>
      </div>
    </div>
  );
}

function ConsultasPage() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Soy el asistente de Peñas Cercadas. Pregúntame lo que quieras — solo respondo con datos reales, nunca invento." }
  ]);
  const [loading, setLoading] = useState(false);
  const handleSend = () => {
    if (!query.trim()) return;
    setMessages(prev => [...prev, { role: "user", text: query }]);
    setQuery(""); setLoading(true);
    setTimeout(() => {
      setMessages(prev => [...prev, { role: "assistant", text: "⚡ Versión demo. Al conectar Supabase + Claude API, aquí recibirás respuestas reales de tus 580 cabras." }]);
      setLoading(false);
    }, 1200);
  };

  return (
    <div style={{ display: "flex", gap: 20, height: "calc(100vh - 160px)" }}>
      <div style={{
        flex: 1, background: "#FFF", border: "1px solid #F1F5F9", borderRadius: 16,
        display: "flex", flexDirection: "column", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        <div style={{ padding: "14px 22px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#059669", animation: "pulse 2s infinite" }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#1E293B" }}>Asistente Peñas Cercadas</span>
          <span style={{ fontSize: 11, color: "#94A3B8" }}>· 62 reglas activas</span>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
          {messages.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              background: m.role === "user" ? "#FEF9EE" : "#F8FAFC",
              border: `1px solid ${m.role === "user" ? "#FDE68A" : "#F1F5F9"}`,
              borderRadius: 14, padding: "13px 18px", maxWidth: "80%",
              fontSize: 14, color: "#334155", lineHeight: 1.6, animation: "fadeSlideIn 0.3s ease",
            }}>{m.text}</div>
          ))}
          {loading && (
            <div style={{ alignSelf: "flex-start", padding: "14px 18px", background: "#F8FAFC", borderRadius: 14, border: "1px solid #F1F5F9" }}>
              <div style={{ display: "flex", gap: 5 }}>
                {[0,1,2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#E8950A", animation: `bounce 1.4s ease ${i*0.2}s infinite`, opacity: 0.5 }} />)}
              </div>
            </div>
          )}
        </div>
        <div style={{ padding: "14px 18px", borderTop: "1px solid #F1F5F9", display: "flex", gap: 10 }}>
          <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSend()}
            placeholder="Pregunta lo que quieras sobre tu granja..."
            style={{ flex: 1, background: "#F8FAFC", border: "2px solid #E2E8F0", borderRadius: 12, padding: "13px 18px", color: "#1E293B", fontSize: 14, outline: "none" }}
            onFocus={e => e.target.style.borderColor = "#E8950A"} onBlur={e => e.target.style.borderColor = "#E2E8F0"}
          />
          <button onClick={handleSend} style={{
            background: "linear-gradient(135deg, #E8950A, #CA8106)", border: "none", borderRadius: 12,
            padding: "13px 22px", color: "#FFF", fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}>Consultar</button>
        </div>
      </div>
      <div style={{ width: 260, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: "#FFF", border: "1px solid #F1F5F9", borderRadius: 16, padding: "18px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>💡 Ejemplos</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {CHAT_EXAMPLES.map((ex, i) => (
              <div key={i} onClick={() => setQuery(ex)} style={{
                fontSize: 12, color: "#64748B", padding: "9px 12px", background: "#FAFAFA",
                border: "1px solid #F1F5F9", borderRadius: 8, cursor: "pointer", transition: "all 0.2s", lineHeight: 1.4,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#FEF9EE"; e.currentTarget.style.color = "#E8950A"; e.currentTarget.style.borderColor = "#FDE68A"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#FAFAFA"; e.currentTarget.style.color = "#64748B"; e.currentTarget.style.borderColor = "#F1F5F9"; }}
              >{ex}</div>
            ))}
          </div>
        </div>
        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 16, padding: "18px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#059669", marginBottom: 6 }}>🛡️ Anti-invención</div>
          <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.5 }}>Solo datos reales de Supabase. Si no existe, dice "sin datos" y avisa si es anómalo.</div>
        </div>
      </div>
    </div>
  );
}

function ConfigPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={{ background: "#FFF", border: "1px solid #F1F5F9", borderRadius: 16, padding: "22px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1E293B", marginBottom: 16 }}>📏 Reglas Activas (62)</div>
          {[
            { cat: "Sanidad", count: 18, color: "#DC2626" },
            { cat: "Reproducción", count: 16, color: "#7C3AED" },
            { cat: "Producción", count: 8, color: "#059669" },
            { cat: "Identificación", count: 6, color: "#0891B2" },
            { cat: "Protocolo veterinario", count: 9, color: "#E8950A" },
            { cat: "Muertes", count: 3, color: "#94A3B8" },
            { cat: "Decisión productiva", count: 2, color: "#DB2777" },
          ].map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #F8FAFC" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: r.color }} />
                <span style={{ fontSize: 13, color: "#475569" }}>{r.cat}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: r.color, fontFamily: "'Space Grotesk', sans-serif" }}>{r.count}</span>
            </div>
          ))}
        </div>
        <div style={{ background: "#FFF", border: "1px solid #F1F5F9", borderRadius: 16, padding: "22px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1E293B", marginBottom: 16 }}>🏥 Protocolo Veterinario</div>
          {[
            { fase: "Nodriza", items: "Selenio+VitE, Ombligo, Coccidiosis", color: "#DB2777" },
            { fase: "Post-destete", items: "Probióticos, Heptavac×2, Fiebre Q×2", color: "#E8950A" },
            { fase: "Recría", items: "Paratuberculosis (Gudair)", color: "#0891B2" },
            { fase: "Preparto", items: "Enterotoxemias + Desparasitación", color: "#059669" },
          ].map((p, i) => (
            <div key={i} style={{ background: `${p.color}08`, border: `1px solid ${p.color}20`, borderRadius: 10, padding: "13px 16px", marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: p.color, marginBottom: 3 }}>{p.fase}</div>
              <div style={{ fontSize: 12, color: "#64748B" }}>{p.items}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: "#FFF", border: "1px solid #F1F5F9", borderRadius: 16, padding: "22px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1E293B", marginBottom: 16 }}>⚙️ Parámetros de la Granja</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { param: "Lactación máxima", valor: "210 días", icon: "🥛" },
            { param: "Gestación", valor: "150 días", icon: "🤰" },
            { param: "Ecografías", valor: "65-80 días", icon: "🔬" },
            { param: "Secado", valor: "90 días gest.", icon: "⏸️" },
            { param: "Crotalado", valor: "2-3 meses", icon: "🏷️" },
            { param: "Parideras/año", valor: "4", icon: "📅" },
            { param: "Umbral alta prod.", valor: ">2 L/día", icon: "📈" },
            { param: "Raza", valor: "Murciano-Granadina", icon: "🐐" },
          ].map((p, i) => (
            <div key={i} style={{ background: "#FAFAFA", border: "1px solid #F1F5F9", borderRadius: 10, padding: "14px", textAlign: "center" }}>
              <div style={{ fontSize: 20, marginBottom: 5 }}>{p.icon}</div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>{p.param}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#E8950A", fontFamily: "'Space Grotesk', sans-serif" }}>{p.valor}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// MAIN APP
// ==========================================

const NAV = [
  { id: "dashboard", icon: "📊", label: "Dashboard" },
  { id: "importador", icon: "📁", label: "Importador" },
  { id: "consultas", icon: "💬", label: "Consultas" },
  { id: "config", icon: "⚙️", label: "Configuración" },
];

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [time, setTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 60000); return () => clearInterval(t); }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FA", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Space+Grotesk:wght@300..700&display=swap');
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes bounce { 0%,80%,100% { transform: scale(0); } 40% { transform: scale(1); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 3px; }
      `}</style>

      {/* Header */}
      <div style={{
        background: "#FFFFFF", borderBottom: "1px solid #E2E8F0",
        padding: "0 30px", height: 62, display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg, #E8950A, #CA8106)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, color: "#FFF",
          }}>🐐</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.02em", fontFamily: "'Space Grotesk', sans-serif" }}>
              <span style={{ color: "#E8950A" }}>PEÑAS</span> <span style={{ color: "#1E293B" }}>CERCADAS</span>
            </div>
            <div style={{ fontSize: 9.5, color: "#94A3B8", letterSpacing: "0.1em", textTransform: "uppercase" }}>Sistema de Gestión Ganadera</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {NAV.map(item => (
            <button key={item.id} onClick={() => setPage(item.id)} style={{
              background: page === item.id ? "#FEF9EE" : "transparent",
              border: page === item.id ? "1px solid #FDE68A" : "1px solid transparent",
              borderRadius: 10, padding: "7px 16px",
              color: page === item.id ? "#E8950A" : "#64748B",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 7, transition: "all 0.2s",
            }}
            onMouseEnter={e => { if (page !== item.id) e.currentTarget.style.color = "#1E293B"; }}
            onMouseLeave={e => { if (page !== item.id) e.currentTarget.style.color = "#64748B"; }}
            ><span style={{ fontSize: 15 }}>{item.icon}</span>{item.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 12, color: "#94A3B8", fontFamily: "'Space Grotesk', sans-serif" }}>
            {time.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <div style={{
            width: 34, height: 34, borderRadius: 10, background: "#FEF9EE", border: "1px solid #FDE68A",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 700, color: "#E8950A",
          }}>D</div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "24px 30px", maxWidth: 1380, margin: "0 auto" }}>
        <div style={{ marginBottom: 24, animation: "fadeSlideIn 0.3s ease" }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#1E293B", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em" }}>
            {page === "dashboard" && "Dashboard"}
            {page === "importador" && "Importador de Datos"}
            {page === "consultas" && "Consultas y Análisis"}
            {page === "config" && "Configuración"}
          </div>
          <div style={{ fontSize: 13, color: "#94A3B8", marginTop: 3 }}>
            {page === "dashboard" && "Vista general · 580 cabras · 3 parideras activas · Haz clic en las tarjetas para ver los datos"}
            {page === "importador" && "Sube Excel y el asistente los procesa automáticamente"}
            {page === "consultas" && "Pregunta lo que quieras — respuestas con datos reales"}
            {page === "config" && "Reglas, protocolo veterinario y parámetros"}
          </div>
        </div>
        {page === "dashboard" && <DashboardPage />}
        {page === "importador" && <ImportadorPage />}
        {page === "consultas" && <ConsultasPage />}
        {page === "config" && <ConfigPage />}
      </div>
    </div>
  );
}
