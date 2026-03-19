import { useState, useEffect } from "react";
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Legend } from "recharts";

// ==========================================
// APP PEÑAS CERCADAS v3 — Full Management System
// ==========================================

// === SHARED DATA ===
const LOTES = [
  { nombre: "Lote 1 - Alta Producción", cabras: 74, color: "#E8950A" },
  { nombre: "Grupo 13 - Paridera Feb", cabras: 99, color: "#059669" },
  { nombre: "Lote 2 - Pariendo", cabras: 11, color: "#DB2777" },
  { nombre: "Lote 3 - Secándose", cabras: 98, color: "#7C3AED" },
  { nombre: "Lote 4 - Baja Producción", cabras: 28, color: "#DC2626" },
  { nombre: "Lote 5 - Chotas Nuevas", cabras: 107, color: "#0891B2" },
  { nombre: "Lote 6 - Con Machos", cabras: 109, color: "#EA580C" },
];

const ALERTAS = [
  { tipo: "alta", msg: "7 cabras vacías en dos ecografías", detalle: "056706, 057611, 057760, 057789, 699952, 700008, 701845", icon: "🔴" },
  { tipo: "alta", msg: "Vacunar enterotoxemias Lote 3 en 23 días", detalle: "98 cabras necesitan Polibascol antes del 9 de abril", icon: "💉" },
  { tipo: "media", msg: "Retirar machos Lote 6 el 20 de marzo", detalle: "Machos entraron el 20 de febrero", icon: "📅" },
  { tipo: "media", msg: "147 crías: programar coccidiosis pre-destete", detalle: "Destete próximamente", icon: "🐐" },
  { tipo: "info", msg: "36 inseminaciones pendientes de seguimiento", detalle: "5 machos utilizados", icon: "📋" },
];

const CALENDARIO = [
  { fecha: "20 Mar", evento: "Retirar machos Lote 6", tipo: "cubricion", urgente: true },
  { fecha: "09 Abr", evento: "Vacunar enterotoxemias Lote 3", tipo: "sanidad", urgente: true },
  { fecha: "26 Abr", evento: "Ecografías Paridera Octubre", tipo: "ecografia", urgente: false },
  { fecha: "May", evento: "Inicio partos Paridera Mayo", tipo: "parto", urgente: false },
  { fecha: "15 May", evento: "Entrada machos nueva paridera", tipo: "cubricion", urgente: false },
  { fecha: "Jun", evento: "Crotalado crías paridera feb", tipo: "identificacion", urgente: false },
];

const PARIDERAS = [
  { nombre: "Paridera Febrero 2026", machos: "15 Ago 2025", partos: "Ene-Mar 2026", estado: "En curso", progreso: 85, color: "#059669" },
  { nombre: "Paridera Mayo 2026", machos: "10 Dic 2025", partos: "Abr-May 2026", estado: "Gestación", progreso: 60, color: "#7C3AED" },
  { nombre: "Paridera Octubre 2026", machos: "20 Feb 2026", partos: "Jul 2026", estado: "Cubrición", progreso: 20, color: "#EA580C" },
];

// Sample table data for modal
const PARTOS_DATA = [
  { crotal: "057968", fecha: "20/01/26", crias: 1, machos: 0, hembras: 1, peseta: "149", tipo: "normal" },
  { crotal: "057997", fecha: "22/01/26", crias: 2, machos: 0, hembras: 2, peseta: "062, 128", tipo: "normal" },
  { crotal: "056938", fecha: "08/02/26", crias: 3, machos: 0, hembras: 3, peseta: "211-213", tipo: "normal" },
  { crotal: "057693", fecha: "26/02/26", crias: 3, machos: 0, hembras: 3, peseta: "235-237", tipo: "normal" },
  { crotal: "058057", fecha: "02/12/25", crias: 0, machos: 0, hembras: 0, peseta: "-", tipo: "aborto" },
  { crotal: "057005", fecha: "08/02/26", crias: 0, machos: 0, hembras: 0, peseta: "-", tipo: "nacido_muerto" },
];

const ECO_DATA = [
  { crotal: "056706", fecha: "27/11/25", resultado: "Vacía", paridera: "Febrero" },
  { crotal: "056706", fecha: "12/02/26", resultado: "Vacía", paridera: "Mayo" },
  { crotal: "057760", fecha: "27/11/25", resultado: "Vacía", paridera: "Febrero" },
  { crotal: "057760", fecha: "12/02/26", resultado: "Vacía", paridera: "Mayo" },
  { crotal: "701932", fecha: "27/11/25", resultado: "Gestante", paridera: "Febrero" },
  { crotal: "057737", fecha: "12/02/26", resultado: "Gestante", paridera: "Mayo" },
];

const TRAT_DATA = [
  { crotal: "057928", fecha: "02/01/26", tipo: "Implante", producto: "Implante" },
  { crotal: "056993", fecha: "20/02/26", tipo: "Esponja vaginal", producto: "Esponja" },
  { crotal: "057599", fecha: "20/02/26", tipo: "Esponja vaginal", producto: "Esponja" },
];

// === RENTABILIDAD DATA ===
const MONTHLY_FINANCE = [
  { mes: "Oct 25", ingresos: 38200, gastos: 22100, leche: 35800, cabritos: 2400, pienso: 12500, veterinario: 1800, personal: 5200, otros: 2600 },
  { mes: "Nov 25", ingresos: 36800, gastos: 21800, leche: 34500, cabritos: 2300, pienso: 12200, veterinario: 2100, personal: 5200, otros: 2300 },
  { mes: "Dic 25", ingresos: 33500, gastos: 23200, leche: 31200, cabritos: 2300, pienso: 13100, veterinario: 2400, personal: 5200, otros: 2500 },
  { mes: "Ene 26", ingresos: 31200, gastos: 24100, leche: 28900, cabritos: 2300, pienso: 13800, veterinario: 2800, personal: 5200, otros: 2300 },
  { mes: "Feb 26", ingresos: 35600, gastos: 23500, leche: 33100, cabritos: 2500, pienso: 13200, veterinario: 2600, personal: 5200, otros: 2500 },
  { mes: "Mar 26", ingresos: 39800, gastos: 22800, leche: 37200, cabritos: 2600, pienso: 12800, veterinario: 1900, personal: 5200, otros: 2900 },
];

const PRODUCTION_FORECAST = [
  { mes: "Mar 26", litros: 950, cabrasOrdeño: 420, precioL: 1.31, ingresoEst: 37345 },
  { mes: "Abr 26", litros: 1020, cabrasOrdeño: 440, precioL: 1.31, ingresoEst: 40086 },
  { mes: "May 26", litros: 1180, cabrasOrdeño: 490, precioL: 1.31, ingresoEst: 46375 },
  { mes: "Jun 26", litros: 1280, cabrasOrdeño: 510, precioL: 1.31, ingresoEst: 50323 },
  { mes: "Jul 26", litros: 1350, cabrasOrdeño: 530, precioL: 1.31, ingresoEst: 53064 },
  { mes: "Ago 26", litros: 1250, cabrasOrdeño: 505, precioL: 1.31, ingresoEst: 49125 },
  { mes: "Sep 26", litros: 1100, cabrasOrdeño: 460, precioL: 1.31, ingresoEst: 43230 },
  { mes: "Oct 26", litros: 980, cabrasOrdeño: 410, precioL: 1.31, ingresoEst: 38514 },
  { mes: "Nov 26", litros: 1050, cabrasOrdeño: 435, precioL: 1.31, ingresoEst: 41266 },
  { mes: "Dic 26", litros: 1150, cabrasOrdeño: 470, precioL: 1.31, ingresoEst: 45196 },
  { mes: "Ene 27", litros: 1220, cabrasOrdeño: 495, precioL: 1.31, ingresoEst: 47946 },
  { mes: "Feb 27", litros: 1300, cabrasOrdeño: 520, precioL: 1.31, ingresoEst: 51090 },
];

const REPOSICION_TIMELINE = [
  { evento: "107 chotas paridera Feb 2026", nacimiento: "Ene-Mar 2026", primerParto: "May-Jul 2027", estado: "Criándose", color: "#0891B2" },
  { evento: "~80 chotas paridera May 2026 (est.)", nacimiento: "Abr-May 2026", primerParto: "Ago-Sep 2027", estado: "Pendiente", color: "#7C3AED" },
  { evento: "~90 chotas paridera Oct 2026 (est.)", nacimiento: "Jul 2026", primerParto: "Nov 2027", estado: "Pendiente", color: "#EA580C" },
];

const CHAT_EXAMPLES = [
  "Dime las 40 mejores cabras por producción",
  "¿Qué cabras han salido vacías dos veces?",
  "Ficha completa de la cabra 057997",
  "Cabras del Lote 3 sin vacuna enterotoxemias",
  "Resumen de la paridera de febrero",
  "Cabras candidatas a cubrición anticipada",
];

const FINANCE_CHAT_EXAMPLES = [
  "He pagado 3.200€ de pienso esta semana",
  "Vendidos 45 cabritos a 38€ cada uno",
  "¿Cuál es el margen de beneficio este trimestre?",
  "¿Cuánto nos cuesta producir un litro de leche?",
  "Previsión de ingresos para los próximos 3 meses",
  "¿Me sale rentable quedarme 100 chotas o 60?",
];

// === SHARED COMPONENTS ===
function AnimNum({ target, prefix = "", suffix = "" }) {
  const [cur, setCur] = useState(0);
  useEffect(() => {
    let s = 0; const step = target / 75;
    const t = setInterval(() => { s += step; if (s >= target) { setCur(target); clearInterval(t); } else setCur(Math.floor(s)); }, 16);
    return () => clearInterval(t);
  }, [target]);
  return <span>{prefix}{cur.toLocaleString("es-ES")}{suffix}</span>;
}

function Badge({ text, color }) {
  return <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: `${color}14`, color, fontWeight: 600 }}>{text}</span>;
}

function Card({ children, style = {} }) {
  return <div style={{ background: "#FFF", border: "1px solid #EEF2F6", borderRadius: 16, padding: 22, boxShadow: "0 1px 4px rgba(0,0,0,0.03)", ...style }}>{children}</div>;
}

function SectionTitle({ icon, text, color = "#1E293B" }) {
  return <div style={{ fontSize: 15, fontWeight: 700, color, marginBottom: 16, fontFamily: "'Outfit', sans-serif", display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 18 }}>{icon}</span>{text}</div>;
}

// Modal
function DataModal({ title, icon, accent, data, columns, onClose, searchPH }) {
  const [s, setS] = useState("");
  const f = data.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(s.toLowerCase())));
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.25)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn .2s" }} onClick={onClose}>
      <div style={{ background: "#FFF", borderRadius: 20, width: "85%", maxWidth: 880, maxHeight: "78vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 50px rgba(0,0,0,0.12)", animation: "slideUp .3s" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "18px 26px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: `${accent}12`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>{icon}</div>
            <div><div style={{ fontSize: 16, fontWeight: 700, color: "#1E293B" }}>{title}</div><div style={{ fontSize: 12, color: "#94A3B8" }}>{f.length} registros</div></div>
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 9, border: "1px solid #E2E8F0", background: "#F8FAFC", cursor: "pointer", fontSize: 17, color: "#94A3B8", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
        <div style={{ padding: "14px 26px", borderBottom: "1px solid #F1F5F9" }}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", fontSize: 15 }}>🔍</span>
            <input value={s} onChange={e => setS(e.target.value)} placeholder={searchPH || "Buscar..."} style={{ width: "100%", padding: "11px 15px 11px 40px", borderRadius: 11, border: "2px solid #E2E8F0", fontSize: 13, color: "#1E293B", outline: "none", background: "#F8FAFC", fontFamily: "'Outfit', sans-serif" }} onFocus={e => e.target.style.borderColor = accent} onBlur={e => e.target.style.borderColor = "#E2E8F0"} />
          </div>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "0 26px 18px" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 3px", marginTop: 6 }}>
            <thead><tr>{columns.map((c, i) => <th key={i} style={{ textAlign: "left", padding: "9px 13px", fontSize: 10.5, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: ".06em", position: "sticky", top: 0, background: "#FFF" }}>{c.label}</th>)}</tr></thead>
            <tbody>{f.map((r, i) => <tr key={i} onMouseEnter={e => e.currentTarget.style.background = "#F8FAFC"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              {columns.map((c, j) => <td key={j} style={{ padding: "10px 13px", fontSize: 13, color: "#334155", fontFamily: c.mono ? "'Space Mono', monospace" : "'Outfit', sans-serif", fontWeight: c.bold ? 700 : 400, borderBottom: "1px solid #F5F7FA" }}>{c.render ? c.render(r[c.key], r) : r[c.key]}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ChatBox({ messages, input, setInput, onSend, examples, onExample, placeholder, height = 460 }) {
  return (
    <div style={{ background: "#FFF", border: "1px solid #EEF2F6", borderRadius: 16, display: "flex", flexDirection: "column", height, boxShadow: "0 1px 4px rgba(0,0,0,0.03)" }}>
      <div style={{ padding: "13px 18px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#059669", animation: "pulse 2s infinite" }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#1E293B" }}>Asistente Peñas Cercadas</span>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", background: m.role === "user" ? "#FEF9EE" : "#F8FAFC", border: `1px solid ${m.role === "user" ? "#FDE68A" : "#F1F5F9"}`, borderRadius: 12, padding: "10px 15px", maxWidth: "85%", fontSize: 13, color: "#334155", lineHeight: 1.5 }}>
            {m.text}
          </div>
        ))}
      </div>
      {examples && <div style={{ padding: "0 16px 8px", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {examples.slice(0, 3).map((ex, i) => <div key={i} onClick={() => onExample(ex)} style={{ fontSize: 11, color: "#94A3B8", padding: "5px 10px", background: "#F8FAFC", border: "1px solid #F1F5F9", borderRadius: 7, cursor: "pointer" }} onMouseEnter={e => { e.currentTarget.style.color = "#E8950A"; e.currentTarget.style.borderColor = "#FDE68A"; }} onMouseLeave={e => { e.currentTarget.style.color = "#94A3B8"; e.currentTarget.style.borderColor = "#F1F5F9"; }}>{ex}</div>)}
      </div>}
      <div style={{ padding: "11px 14px", borderTop: "1px solid #F1F5F9", display: "flex", gap: 9 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && onSend()} placeholder={placeholder}
          style={{ flex: 1, background: "#F8FAFC", border: "2px solid #E2E8F0", borderRadius: 10, padding: "10px 15px", color: "#1E293B", fontSize: 13, outline: "none", fontFamily: "'Outfit', sans-serif" }}
          onFocus={e => e.target.style.borderColor = "#E8950A"} onBlur={e => e.target.style.borderColor = "#E2E8F0"} />
        <button onClick={onSend} style={{ background: "linear-gradient(135deg, #E8950A, #CA8106)", border: "none", borderRadius: 10, padding: "10px 18px", color: "#FFF", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Enviar</button>
      </div>
    </div>
  );
}

// === KPI Card ===
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

// === CUSTOM TOOLTIP ===
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
// DASHBOARD PAGE
// ==========================================
function DashboardPage() {
  const [modal, setModal] = useState(null);
  const partoCols = [
    { key: "crotal", label: "Crotal", mono: true, bold: true },
    { key: "fecha", label: "Fecha", mono: true },
    { key: "crias", label: "Crías" },
    { key: "hembras", label: "♀" },
    { key: "peseta", label: "Pesetas", mono: true },
    { key: "tipo", label: "Tipo", render: v => <Badge text={v} color={v === "normal" ? "#059669" : v === "aborto" ? "#DC2626" : "#94A3B8"} /> },
  ];
  const ecoCols = [
    { key: "crotal", label: "Crotal", mono: true, bold: true },
    { key: "fecha", label: "Fecha", mono: true },
    { key: "resultado", label: "Resultado", render: v => <Badge text={v} color={v === "Vacía" ? "#DC2626" : "#059669"} /> },
    { key: "paridera", label: "Paridera" },
  ];
  const tratCols = [
    { key: "crotal", label: "Crotal", mono: true, bold: true },
    { key: "fecha", label: "Fecha", mono: true },
    { key: "tipo", label: "Tratamiento" },
    { key: "producto", label: "Producto", render: v => <Badge text={v} color={v === "Implante" ? "#7C3AED" : "#E8950A"} /> },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <KPI icon="🐐" label="Cabras" value={<AnimNum target={580} />} sub="en 7 lotes" accent="#E8950A" />
        <KPI icon="🍼" label="Partos" value={<AnimNum target={226} />} sub="paridera febrero" accent="#059669" onClick={() => setModal("partos")} />
        <KPI icon="🔬" label="Ecografías" value={<AnimNum target={296} />} sub="2 campañas" accent="#7C3AED" onClick={() => setModal("eco")} />
        <KPI icon="💉" label="Tratamientos" value={<AnimNum target={98} />} sub="implantes + esponjas" accent="#0891B2" onClick={() => setModal("trat")} />
        <KPI icon="🐣" label="Crías" value={<AnimNum target={147} />} sub="hembras con peseta" accent="#DB2777" />
        <KPI icon="🔗" label="Cubriciones" value={<AnimNum target={230} />} sub="3 campañas" accent="#EA580C" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Card>
          <SectionTitle icon="⚠️" text="Alertas y Advertencias" color="#DC2626" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {ALERTAS.map((a, i) => {
              const bg = { alta: "#FEF2F2", media: "#FFFBEB", info: "#EFF6FF" }[a.tipo];
              const bd = { alta: "#FECACA", media: "#FDE68A", info: "#BFDBFE" }[a.tipo];
              return <div key={i} style={{ background: bg, border: `1px solid ${bd}`, borderRadius: 11, padding: "11px 15px", display: "flex", gap: 11, alignItems: "flex-start", animation: `fadeSlideIn .4s ease ${i * .07}s both` }}>
                <span style={{ fontSize: 19, flexShrink: 0 }}>{a.icon}</span>
                <div><div style={{ fontSize: 13, fontWeight: 600, color: "#1E293B", lineHeight: 1.35 }}>{a.msg}</div><div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{a.detalle}</div></div>
              </div>;
            })}
          </div>
        </Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Card>
            <SectionTitle icon="📅" text="Próximos Eventos" color="#0891B2" />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {CALENDARIO.map((c, i) => {
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
            <SectionTitle icon="📊" text="Distribución por Lotes" />
            {LOTES.map((l, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "7px 0" }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: l.color }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "#475569" }}>{l.nombre}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: l.color, fontFamily: "'Space Mono', monospace" }}>{l.cabras}</span>
                </div>
                <div style={{ height: 4.5, background: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 3, background: l.color, width: `${(l.cabras / 580 * 100)}%`, transition: "width 1.5s" }} />
                </div>
              </div>
            </div>)}
          </Card>
        </div>
      </div>
      <div>
        <SectionTitle icon="🗓️" text="Estado de Parideras" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {PARIDERAS.map((p, i) => <Card key={i}>
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
      </div>
      {modal === "partos" && <DataModal title="Partos — Paridera Febrero" icon="🍼" accent="#059669" data={PARTOS_DATA} columns={partoCols} onClose={() => setModal(null)} />}
      {modal === "eco" && <DataModal title="Ecografías" icon="🔬" accent="#7C3AED" data={ECO_DATA} columns={ecoCols} onClose={() => setModal(null)} />}
      {modal === "trat" && <DataModal title="Tratamientos" icon="💉" accent="#0891B2" data={TRAT_DATA} columns={tratCols} onClose={() => setModal(null)} />}
    </div>
  );
}

// ==========================================
// RENTABILIDAD PAGE — THE BIG ONE
// ==========================================
function RentabilidadPage() {
  const [finMsg, setFinMsg] = useState("");
  const [finMessages, setFinMessages] = useState([
    { role: "assistant", text: "Soy el asistente financiero de Peñas Cercadas. Puedo registrar gastos e ingresos, analizar rentabilidades, y hacer previsiones basadas en los datos reales de la granja. Dime qué necesitas." }
  ]);
  const [tab, setTab] = useState("general");

  const handleFinSend = () => {
    if (!finMsg.trim()) return;
    setFinMessages(p => [...p, { role: "user", text: finMsg }]);
    setFinMsg("");
    setTimeout(() => setFinMessages(p => [...p, { role: "assistant", text: "⚡ Versión demo. Al conectar Supabase + Claude API, aquí registraré gastos/ingresos y responderé con datos reales de contabilidad." }]), 1000);
  };

  const lastMonth = MONTHLY_FINANCE[5];
  const prevMonth = MONTHLY_FINANCE[4];
  const balanceLast = lastMonth.ingresos - lastMonth.gastos;
  const margenL = ((lastMonth.leche - lastMonth.gastos) / (lastMonth.leche / 1.31)).toFixed(2);
  const costeL = (lastMonth.gastos / (lastMonth.leche / 1.31)).toFixed(2);

  // Forecast totals
  const forecastTotal = PRODUCTION_FORECAST.reduce((s, m) => s + m.ingresoEst, 0);
  const forecastAvgDaily = Math.round(PRODUCTION_FORECAST.reduce((s, m) => s + m.litros, 0) / 12);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* KPIs financieros */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
        <KPI icon="💰" label="Ingresos Mar" value={<AnimNum target={39800} prefix="" suffix="€" />} sub={`+${((39800 - 35600) / 35600 * 100).toFixed(1)}% vs feb`} accent="#059669" />
        <KPI icon="📉" label="Gastos Mar" value={<AnimNum target={22800} prefix="" suffix="€" />} sub="pienso + personal + vet" accent="#DC2626" />
        <KPI icon="✅" label="Balance Mar" value={<AnimNum target={17000} prefix="+" suffix="€" />} sub="beneficio neto" accent="#059669" />
        <KPI icon="🥛" label="Margen/Litro" value={`${margenL}€`} sub="ingreso - coste" accent="#E8950A" />
        <KPI icon="📊" label="Coste/Litro" value={`${costeL}€`} sub="gastos ÷ litros" accent="#7C3AED" />
        <KPI icon="🐐" label="Rent./Cabra" value={`${Math.round(17000 / 580)}€`} sub="balance ÷ 580 cabras" accent="#0891B2" />
      </div>

      {/* Tab selector */}
      <div style={{ display: "flex", gap: 4, background: "#F1F5F9", borderRadius: 12, padding: 4, width: "fit-content" }}>
        {[
          { id: "general", label: "📈 Rentabilidad Mensual" },
          { id: "prevision", label: "🔮 Previsión 12 Meses" },
          { id: "reposicion", label: "🐣 Reposición" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "8px 18px", borderRadius: 9, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
            background: tab === t.id ? "#FFF" : "transparent", color: tab === t.id ? "#E8950A" : "#64748B",
            boxShadow: tab === t.id ? "0 1px 4px rgba(0,0,0,0.06)" : "none", transition: "all .2s",
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20 }}>
        {/* Main content area */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {tab === "general" && <>
            {/* Ingresos vs Gastos */}
            <Card>
              <SectionTitle icon="💶" text="Ingresos vs Gastos — Últimos 6 Meses" />
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={MONTHLY_FINANCE} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#94A3B8" }} axisLine={{ stroke: "#E2E8F0" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={{ stroke: "#E2E8F0" }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip formatter={v => `${v.toLocaleString("es-ES")}€`} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="ingresos" name="Ingresos" fill="#059669" radius={[6, 6, 0, 0]} barSize={32} />
                  <Bar dataKey="gastos" name="Gastos" fill="#F87171" radius={[6, 6, 0, 0]} barSize={32} />
                  <Line dataKey="leche" name="Ingresos leche" stroke="#E8950A" strokeWidth={2.5} dot={{ r: 4, fill: "#E8950A" }} />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>

            {/* Desglose gastos */}
            <Card>
              <SectionTitle icon="🧾" text="Desglose de Gastos — Marzo 2026" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                {[
                  { label: "Pienso", value: 12800, pct: 56, color: "#E8950A", icon: "🌾" },
                  { label: "Personal", value: 5200, pct: 23, color: "#7C3AED", icon: "👷" },
                  { label: "Veterinario", value: 1900, pct: 8, color: "#DC2626", icon: "🏥" },
                  { label: "Otros", value: 2900, pct: 13, color: "#64748B", icon: "📦" },
                ].map((g, i) => (
                  <div key={i} style={{ background: "#FAFAFA", border: "1px solid #F1F5F9", borderRadius: 12, padding: 16, textAlign: "center" }}>
                    <div style={{ fontSize: 24, marginBottom: 6 }}>{g.icon}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 3 }}>{g.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: g.color, fontFamily: "'Space Mono', monospace" }}>{(g.value).toLocaleString("es-ES")}€</div>
                    <div style={{ height: 4, background: "#F1F5F9", borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
                      <div style={{ height: "100%", background: g.color, borderRadius: 2, width: `${g.pct}%` }} />
                    </div>
                    <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 3 }}>{g.pct}% del total</div>
                  </div>
                ))}
              </div>
            </Card>
          </>}

          {tab === "prevision" && <>
            {/* Producción estimada */}
            <Card>
              <SectionTitle icon="🔮" text="Previsión de Producción — Litros/Día" />
              <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "10px 16px", flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>Pico estimado</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#059669", fontFamily: "'Space Mono', monospace" }}>1.350 L/día</div>
                  <div style={{ fontSize: 11, color: "#64748B" }}>Julio 2026 — 530 cabras en ordeño</div>
                </div>
                <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "10px 16px", flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#2563EB", fontWeight: 600 }}>Media estimada 12 meses</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#2563EB", fontFamily: "'Space Mono', monospace" }}>{forecastAvgDaily} L/día</div>
                  <div style={{ fontSize: 11, color: "#64748B" }}>~{Math.round(forecastAvgDaily * 30)} L/mes</div>
                </div>
                <div style={{ background: "#FEF9EE", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 16px", flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#E8950A", fontWeight: 600 }}>Ingresos estimados 12m</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#E8950A", fontFamily: "'Space Mono', monospace" }}>{Math.round(forecastTotal / 1000)}k€</div>
                  <div style={{ fontSize: 11, color: "#64748B" }}>a 1,31€/litro</div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={PRODUCTION_FORECAST} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <defs>
                    <linearGradient id="gLitros" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gCabras" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E8950A" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#E8950A" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={{ stroke: "#E2E8F0" }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={{ stroke: "#E2E8F0" }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={{ stroke: "#E2E8F0" }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area yAxisId="left" type="monotone" dataKey="litros" name="Litros/día" stroke="#059669" fill="url(#gLitros)" strokeWidth={2.5} dot={{ r: 4, fill: "#059669" }} />
                  <Area yAxisId="right" type="monotone" dataKey="cabrasOrdeño" name="Cabras ordeño" stroke="#E8950A" fill="url(#gCabras)" strokeWidth={2} dot={{ r: 3, fill: "#E8950A" }} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            {/* Ingresos estimados */}
            <Card>
              <SectionTitle icon="💰" text="Previsión de Ingresos Mensuales" />
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={PRODUCTION_FORECAST} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={{ stroke: "#E2E8F0" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={{ stroke: "#E2E8F0" }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip formatter={v => `${v.toLocaleString("es-ES")}€`} />} />
                  <Bar dataKey="ingresoEst" name="Ingresos estimados" fill="#E8950A" radius={[6, 6, 0, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </>}

          {tab === "reposicion" && <>
            <Card>
              <SectionTitle icon="🐣" text="Plan de Reposición — Chotas Entrando a Producción" />
              <p style={{ fontSize: 13, color: "#64748B", lineHeight: 1.6, marginBottom: 18 }}>
                Las chotas paren por primera vez a los 16 meses de edad. Este es el calendario de cuándo cada grupo de reposición empezará a producir leche, lo que impacta directamente en la previsión de producción a largo plazo.
              </p>
              {REPOSICION_TIMELINE.map((r, i) => (
                <div key={i} style={{ background: `${r.color}08`, border: `1px solid ${r.color}20`, borderRadius: 14, padding: "18px 22px", marginBottom: 12, display: "flex", alignItems: "center", gap: 18 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: `${r.color}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>🐐</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1E293B", marginBottom: 4 }}>{r.evento}</div>
                    <div style={{ display: "flex", gap: 20, fontSize: 12, color: "#64748B" }}>
                      <span>Nacimiento: <b style={{ color: "#334155" }}>{r.nacimiento}</b></span>
                      <span>Primer parto estimado: <b style={{ color: r.color }}>{r.primerParto}</b></span>
                    </div>
                  </div>
                  <Badge text={r.estado} color={r.color} />
                </div>
              ))}
            </Card>

            <Card>
              <SectionTitle icon="📈" text="Impacto de la Reposición en Producción" />
              <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 12, padding: 18 }}>
                <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.7 }}>
                  <b style={{ color: "#059669" }}>Proyección:</b> Si mantienes la tasa actual de reposición (107 chotas en paridera Feb 2026), y asumiendo un promedio de 2,6L/día en primera lactación, las chotas aportarán aproximadamente <b>278 litros/día adicionales</b> cuando entren en producción en mayo-julio 2027. Esto representa un incremento del ~25% sobre la producción actual.
                </div>
              </div>
              <div style={{ background: "#FEF9EE", border: "1px solid #FDE68A", borderRadius: 12, padding: 18, marginTop: 12 }}>
                <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.7 }}>
                  <b style={{ color: "#E8950A" }}>Consejo:</b> Para mantener 580 cabras en producción, necesitas reponer las bajas (~8-10% anual = 50-60 cabras). Con 107 chotas en esta paridera cubres reposición + crecimiento. El excedente (~50 chotas) puede venderse o ampliar el rebaño según rentabilidad.
                </div>
              </div>
            </Card>
          </>}
        </div>

        {/* Chat financiero */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ChatBox
            messages={finMessages} input={finMsg} setInput={setFinMsg} onSend={handleFinSend}
            examples={FINANCE_CHAT_EXAMPLES} onExample={setFinMsg}
            placeholder="Registra gastos, ingresos, o pregunta..."
            height={520}
          />

          {/* Advisory section */}
          <Card style={{ background: "linear-gradient(135deg, #FEF9EE 0%, #FFF7ED 100%)", border: "1px solid #FDE68A" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#E8950A", marginBottom: 10, display: "flex", alignItems: "center", gap: 7 }}>
              <span>💡</span> Recomendaciones
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                "El pienso supone el 56% de los gastos. Un 5% de ahorro = 640€/mes",
                "Jul 2026 será el mes de mayor producción: preparar capacidad de ordeño",
                "Oct 2026 bajará producción: planificar ajuste de personal o gastos",
                "Las 7 doble vacías generan ~0€ ingresos con coste de mantenimiento",
              ].map((c, i) => (
                <div key={i} style={{ fontSize: 12, color: "#78590A", lineHeight: 1.45, padding: "6px 0", borderBottom: i < 3 ? "1px solid #FDE68A40" : "none", display: "flex", gap: 7 }}>
                  <span style={{ color: "#E8950A", flexShrink: 0 }}>→</span>{c}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// IMPORTADOR PAGE
// ==========================================
function ImportadorPage() {
  const [dragOver, setDragOver] = useState(false);
  const [msg, setMsg] = useState("");
  const [messages, setMessages] = useState([{ role: "assistant", text: "Sube un Excel y dime qué contiene. Lo proceso y lo meto en la base de datos." }]);
  const tipos = [
    { icon: "📊", n: "Producción", d: "Excel FLM" },
    { icon: "🔬", n: "Ecografías", d: "Lector crotales" },
    { icon: "💉", n: "Tratamientos", d: "Esponjas, vacunas" },
    { icon: "🐣", n: "Paridera", d: "Partos y crías" },
    { icon: "🐐", n: "Cubriciones", d: "Entrada machos" },
    { icon: "📋", n: "Otro", d: "Lo interpreto" },
  ];
  const handleSend = () => {
    if (!msg.trim()) return;
    setMessages(p => [...p, { role: "user", text: msg }]); setMsg("");
    setTimeout(() => setMessages(p => [...p, { role: "assistant", text: "⚡ Versión demo. Al conectar, aquí procesaré el Excel y lo importaré a Supabase." }]), 1000);
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <div>
        <SectionTitle icon="📁" text="Subir Excel" />
        <div style={{ border: `2px dashed ${dragOver ? "#E8950A" : "#E2E8F0"}`, borderRadius: 16, padding: "42px 28px", textAlign: "center", background: dragOver ? "#FEF9EE" : "#FAFAFA", transition: "all .3s", cursor: "pointer" }}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); }}>
          <div style={{ fontSize: 42, marginBottom: 12 }}>📎</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1E293B", marginBottom: 5 }}>Arrastra el Excel aquí</div>
          <div style={{ fontSize: 12.5, color: "#94A3B8" }}>o haz clic para seleccionar</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 14 }}>
          {tipos.map((t, i) => <div key={i} style={{ background: "#FFF", border: "1px solid #F1F5F9", borderRadius: 10, padding: 11, textAlign: "center", cursor: "pointer", transition: "all .2s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#E8950A80"; e.currentTarget.style.background = "#FFFBF0"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#F1F5F9"; e.currentTarget.style.background = "#FFF"; }}>
            <div style={{ fontSize: 20, marginBottom: 3 }}>{t.icon}</div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: "#334155" }}>{t.n}</div>
            <div style={{ fontSize: 10, color: "#94A3B8" }}>{t.d}</div>
          </div>)}
        </div>
      </div>
      <ChatBox messages={messages} input={msg} setInput={setMsg} onSend={handleSend} placeholder="Ej: 'Hoy hemos ecografiado las del lote 3...'" height={470} />
    </div>
  );
}

// ==========================================
// CONSULTAS PAGE
// ==========================================
function ConsultasPage() {
  const [q, setQ] = useState("");
  const [msgs, setMsgs] = useState([{ role: "assistant", text: "Pregúntame lo que quieras sobre tu granja. Solo datos reales, nunca invento." }]);
  const [loading, setLoading] = useState(false);
  const send = () => {
    if (!q.trim()) return;
    setMsgs(p => [...p, { role: "user", text: q }]); setQ(""); setLoading(true);
    setTimeout(() => { setMsgs(p => [...p, { role: "assistant", text: "⚡ Versión demo. Al conectar, responderé con datos reales de tus 580 cabras." }]); setLoading(false); }, 1200);
  };
  return (
    <div style={{ display: "flex", gap: 20, height: "calc(100vh - 155px)" }}>
      <div style={{ flex: 1, background: "#FFF", border: "1px solid #EEF2F6", borderRadius: 16, display: "flex", flexDirection: "column", boxShadow: "0 1px 4px rgba(0,0,0,0.03)" }}>
        <div style={{ padding: "13px 20px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#059669", animation: "pulse 2s infinite" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#1E293B" }}>Asistente Peñas Cercadas</span>
          <span style={{ fontSize: 11, color: "#94A3B8" }}>· 62 reglas activas</span>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          {msgs.map((m, i) => <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", background: m.role === "user" ? "#FEF9EE" : "#F8FAFC", border: `1px solid ${m.role === "user" ? "#FDE68A" : "#F1F5F9"}`, borderRadius: 13, padding: "12px 17px", maxWidth: "80%", fontSize: 13.5, color: "#334155", lineHeight: 1.6, animation: "fadeSlideIn .3s" }}>{m.text}</div>)}
          {loading && <div style={{ alignSelf: "flex-start", padding: "13px 17px", background: "#F8FAFC", borderRadius: 13, border: "1px solid #F1F5F9" }}>
            <div style={{ display: "flex", gap: 5 }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#E8950A", animation: `bounce 1.4s ease ${i * .2}s infinite`, opacity: .5 }} />)}</div>
          </div>}
        </div>
        <div style={{ padding: "13px 16px", borderTop: "1px solid #F1F5F9", display: "flex", gap: 10 }}>
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Pregunta lo que quieras..."
            style={{ flex: 1, background: "#F8FAFC", border: "2px solid #E2E8F0", borderRadius: 11, padding: "12px 16px", color: "#1E293B", fontSize: 13.5, outline: "none" }}
            onFocus={e => e.target.style.borderColor = "#E8950A"} onBlur={e => e.target.style.borderColor = "#E2E8F0"} />
          <button onClick={send} style={{ background: "linear-gradient(135deg, #E8950A, #CA8106)", border: "none", borderRadius: 11, padding: "12px 20px", color: "#FFF", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>Consultar</button>
        </div>
      </div>
      <div style={{ width: 250, display: "flex", flexDirection: "column", gap: 14 }}>
        <Card><div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".05em" }}>💡 Ejemplos</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {CHAT_EXAMPLES.map((ex, i) => <div key={i} onClick={() => setQ(ex)} style={{ fontSize: 11.5, color: "#64748B", padding: "8px 11px", background: "#FAFAFA", border: "1px solid #F1F5F9", borderRadius: 7, cursor: "pointer", lineHeight: 1.35, transition: "all .2s" }}
              onMouseEnter={e => { e.currentTarget.style.color = "#E8950A"; e.currentTarget.style.borderColor = "#FDE68A"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "#64748B"; e.currentTarget.style.borderColor = "#F1F5F9"; }}>{ex}</div>)}
          </div>
        </Card>
        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#059669", marginBottom: 5 }}>🛡️ Anti-invención</div>
          <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.45 }}>Solo datos reales. Si no existe, dice "sin datos" y avisa si es anómalo.</div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// CONFIG PAGE
// ==========================================
function ConfigPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Card>
          <SectionTitle icon="📏" text="Reglas Activas (62)" />
          {[
            { cat: "Sanidad", c: 18, col: "#DC2626" }, { cat: "Reproducción", c: 16, col: "#7C3AED" },
            { cat: "Producción", c: 8, col: "#059669" }, { cat: "Identificación", c: 6, col: "#0891B2" },
            { cat: "Protocolo veterinario", c: 9, col: "#E8950A" }, { cat: "Muertes", c: 3, col: "#94A3B8" },
            { cat: "Decisión productiva", c: 2, col: "#DB2777" },
          ].map((r, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #F8FAFC" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 7, height: 7, borderRadius: "50%", background: r.col }} /><span style={{ fontSize: 12.5, color: "#475569" }}>{r.cat}</span></div>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: r.col, fontFamily: "'Space Mono', monospace" }}>{r.c}</span>
          </div>)}
        </Card>
        <Card>
          <SectionTitle icon="🏥" text="Protocolo Veterinario" />
          {[
            { fase: "Nodriza", items: "Selenio+VitE, Ombligo, Coccidiosis", col: "#DB2777" },
            { fase: "Post-destete", items: "Probióticos, Heptavac×2, Fiebre Q×2", col: "#E8950A" },
            { fase: "Recría", items: "Paratuberculosis (Gudair)", col: "#0891B2" },
            { fase: "Preparto", items: "Enterotoxemias + Desparasitación", col: "#059669" },
          ].map((p, i) => <div key={i} style={{ background: `${p.col}08`, border: `1px solid ${p.col}20`, borderRadius: 10, padding: "12px 15px", marginBottom: 7 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: p.col, marginBottom: 2 }}>{p.fase}</div>
            <div style={{ fontSize: 11.5, color: "#64748B" }}>{p.items}</div>
          </div>)}
        </Card>
      </div>
      <Card>
        <SectionTitle icon="⚙️" text="Parámetros de la Granja" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 11 }}>
          {[
            { p: "Lactación máxima", v: "210 días", i: "🥛" }, { p: "Gestación", v: "150 días", i: "🤰" },
            { p: "Ecografías", v: "65-80 días", i: "🔬" }, { p: "Secado", v: "90 días gest.", i: "⏸️" },
            { p: "Crotalado", v: "2-3 meses", i: "🏷️" }, { p: "Parideras/año", v: "4", i: "📅" },
            { p: "Umbral alta", v: ">2 L/día", i: "📈" }, { p: "Raza", v: "M-Granadina", i: "🐐" },
          ].map((x, i) => <div key={i} style={{ background: "#FAFAFA", border: "1px solid #F1F5F9", borderRadius: 10, padding: 13, textAlign: "center" }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{x.i}</div>
            <div style={{ fontSize: 10.5, color: "#94A3B8", marginBottom: 3 }}>{x.p}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#E8950A", fontFamily: "'Space Mono', monospace" }}>{x.v}</div>
          </div>)}
        </div>
      </Card>
    </div>
  );
}

// ==========================================
// MAIN APP
// ==========================================
const NAV = [
  { id: "dashboard", icon: "📊", label: "Dashboard" },
  { id: "rentabilidad", icon: "💰", label: "Rentabilidad" },
  { id: "importador", icon: "📁", label: "Importador" },
  { id: "consultas", icon: "💬", label: "Consultas" },
  { id: "config", icon: "⚙️", label: "Configuración" },
];

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [time, setTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 60000); return () => clearInterval(t); }, []);

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

      {/* Header */}
      <div style={{ background: "#FFF", borderBottom: "1px solid #E2E8F0", padding: "0 28px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ width: 35, height: 35, borderRadius: 10, background: "linear-gradient(135deg, #E8950A, #CA8106)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, color: "#FFF" }}>🐐</div>
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: "-.02em" }}>
              <span style={{ color: "#E8950A" }}>PEÑAS</span> <span style={{ color: "#1E293B" }}>CERCADAS</span>
            </div>
            <div style={{ fontSize: 9, color: "#94A3B8", letterSpacing: ".1em", textTransform: "uppercase" }}>Sistema de Gestión Ganadera</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {NAV.map(item => (
            <button key={item.id} onClick={() => setPage(item.id)} style={{
              background: page === item.id ? "#FEF9EE" : "transparent",
              border: page === item.id ? "1px solid #FDE68A" : "1px solid transparent",
              borderRadius: 9, padding: "6px 14px",
              color: page === item.id ? "#E8950A" : "#64748B",
              fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6, transition: "all .2s",
              fontFamily: "'Outfit', sans-serif",
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
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "#FEF9EE", border: "1px solid #FDE68A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#E8950A" }}>D</div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "22px 28px", maxWidth: 1360, margin: "0 auto" }}>
        <div style={{ marginBottom: 22, animation: "fadeSlideIn .3s" }}>
          <div style={{ fontSize: 23, fontWeight: 800, color: "#1E293B", letterSpacing: "-.02em" }}>
            {{ dashboard: "Dashboard", rentabilidad: "Rentabilidad y Previsiones", importador: "Importador de Datos", consultas: "Consultas y Análisis", config: "Configuración" }[page]}
          </div>
          <div style={{ fontSize: 12.5, color: "#94A3B8", marginTop: 3 }}>
            {{ dashboard: "Vista general · 580 cabras · 3 parideras · Clic en tarjetas para explorar datos",
              rentabilidad: "Análisis financiero · Previsión de producción · Control de ingresos y gastos",
              importador: "Sube Excel y el asistente los procesa automáticamente",
              consultas: "Pregunta lo que quieras — respuestas con datos reales",
              config: "Reglas, protocolo veterinario y parámetros" }[page]}
          </div>
        </div>
        {page === "dashboard" && <DashboardPage />}
        {page === "rentabilidad" && <RentabilidadPage />}
        {page === "importador" && <ImportadorPage />}
        {page === "consultas" && <ConsultasPage />}
        {page === "config" && <ConfigPage />}
      </div>
    </div>
  );
}
