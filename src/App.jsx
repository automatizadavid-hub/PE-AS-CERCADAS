import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Legend } from "recharts";

// ==========================================
// SUPABASE CONNECTION
// ==========================================
const supabase = createClient(
  "https://lgorvuqlehnljuaqtlet.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxnb3J2dXFsZWhubGp1YXF0bGV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2ODYyNzcsImV4cCI6MjA4OTI2MjI3N30.xnkFU8Eo9-XRnVtiDghlyHi-ENl3cd1Iak1f8x60lLw"
);

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
      const [cabrasR, lotesR, partosR, ecosR, tratsR, cubsR, criasR, reglasR, pariderasR, muerteR, protocoloR] = await Promise.all([
        supabase.from("cabra").select("id, crotal, estado, raza, fecha_nacimiento, num_lactaciones, dias_en_leche, edad_meses, estado_ginecologico, lote_id, notas, lote:lote_id(nombre)"),
        supabase.from("lote").select("*"),
        supabase.from("parto").select("*, cabra:cabra_id(crotal), paridera:paridera_id(nombre)"),
        supabase.from("ecografia").select("*, cabra:cabra_id(crotal), paridera:paridera_id(nombre)"),
        supabase.from("tratamiento").select("*, cabra:cabra_id(crotal)"),
        supabase.from("cubricion").select("*, cabra:cabra_id(crotal), paridera:paridera_id(nombre), macho:macho_id(crotal)"),
        supabase.from("cria").select("*, madre:madre_id(crotal)"),
        supabase.from("regla").select("id, nombre, categoria, tipo, severidad"),
        supabase.from("paridera").select("*"),
        supabase.from("muerte").select("*, cabra:cabra_id(crotal)"),
        supabase.from("protocolo_veterinario").select("*"),
      ]);

      // Process lotes with counts
      const cabras = cabrasR.data || [];
      const lotes = (lotesR.data || []).map(l => ({
        ...l,
        cabras: cabras.filter(c => c.lote_id === l.id).length
      }));

      setData({
        cabras,
        lotes,
        partos: partosR.data || [],
        ecografias: ecosR.data || [],
        tratamientos: tratsR.data || [],
        cubriciones: cubsR.data || [],
        crias: criasR.data || [],
        reglas: reglasR.data || [],
        parideras: pariderasR.data || [],
        muertes: muerteR.data || [],
        protocolos: protocoloR.data || [],
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
function DataModal({ title, icon, accent, data, columns, onClose, searchPH }) {
  const [s, setS] = useState("");
  const f = data.filter(r => Object.values(r).some(v => String(v || "").toLowerCase().includes(s.toLowerCase())));
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.25)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn .2s" }} onClick={onClose}>
      <div style={{ background: "#FFF", borderRadius: 20, width: "88%", maxWidth: 950, maxHeight: "82vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 50px rgba(0,0,0,0.12)", animation: "slideUp .3s" }} onClick={e => e.stopPropagation()}>
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
            <input value={s} onChange={e => setS(e.target.value)} placeholder={searchPH || "Buscar..."} style={{ width: "100%", padding: "11px 15px 11px 40px", borderRadius: 11, border: "2px solid #E2E8F0", fontSize: 13, color: "#1E293B", outline: "none", background: "#F8FAFC", boxSizing: "border-box" }} onFocus={e => e.target.style.borderColor = accent} onBlur={e => e.target.style.borderColor = "#E2E8F0"} />
          </div>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "0 26px 18px" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 3px", marginTop: 6 }}>
            <thead><tr>{columns.map((c, i) => <th key={i} style={{ textAlign: "left", padding: "9px 13px", fontSize: 10.5, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: ".06em", position: "sticky", top: 0, background: "#FFF" }}>{c.label}</th>)}</tr></thead>
            <tbody>{f.slice(0, 200).map((r, i) => <tr key={i} onMouseEnter={e => e.currentTarget.style.background = "#F8FAFC"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              {columns.map((c, j) => <td key={j} style={{ padding: "10px 13px", fontSize: 13, color: "#334155", fontFamily: c.mono ? "'Space Mono', monospace" : "'Outfit', sans-serif", fontWeight: c.bold ? 700 : 400, borderBottom: "1px solid #F5F7FA" }}>{c.render ? c.render(r[c.key], r) : (r[c.key] ?? "-")}</td>)}
            </tr>)}</tbody>
          </table>
          {f.length === 0 && <div style={{ padding: 32, textAlign: "center", color: "#94A3B8" }}>No se encontraron resultados</div>}
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
          <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", background: m.role === "user" ? "#FEF9EE" : "#F8FAFC", border: `1px solid ${m.role === "user" ? "#FDE68A" : "#F1F5F9"}`, borderRadius: 12, padding: "10px 15px", maxWidth: "85%", fontSize: 13, color: "#334155", lineHeight: 1.5 }}>{m.text}</div>
        ))}
      </div>
      {examples && <div style={{ padding: "0 16px 8px", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {examples.slice(0, 3).map((ex, i) => <div key={i} onClick={() => onExample(ex)} style={{ fontSize: 11, color: "#94A3B8", padding: "5px 10px", background: "#F8FAFC", border: "1px solid #F1F5F9", borderRadius: 7, cursor: "pointer" }} onMouseEnter={e => { e.currentTarget.style.color = "#E8950A"; e.currentTarget.style.borderColor = "#FDE68A"; }} onMouseLeave={e => { e.currentTarget.style.color = "#94A3B8"; e.currentTarget.style.borderColor = "#F1F5F9"; }}>{ex}</div>)}
      </div>}
      <div style={{ padding: "11px 14px", borderTop: "1px solid #F1F5F9", display: "flex", gap: 9 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && onSend()} placeholder={placeholder}
          style={{ flex: 1, background: "#F8FAFC", border: "2px solid #E2E8F0", borderRadius: 10, padding: "10px 15px", color: "#1E293B", fontSize: 13, outline: "none", boxSizing: "border-box" }}
          onFocus={e => e.target.style.borderColor = "#E8950A"} onBlur={e => e.target.style.borderColor = "#E2E8F0"} />
        <button onClick={onSend} style={{ background: "linear-gradient(135deg, #E8950A, #CA8106)", border: "none", borderRadius: 10, padding: "10px 18px", color: "#FFF", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Enviar</button>
      </div>
    </div>
  );
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
  const LOTE_COLORS = { "Lote 1": "#E8950A", "Grupo 13": "#059669", "Lote 2": "#DB2777", "Lote 3": "#7C3AED", "Lote 4": "#DC2626", "Lote 5": "#0891B2", "Lote 6": "#EA580C" };

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

  // Calendario
  const calendario = [
    { fecha: "20 Mar 2026", evento: "Retirar machos Lote 6", tipo: "cubricion", urgente: true },
    { fecha: "09 Abr 2026", evento: "Vacunar enterotoxemias Lote 3", tipo: "sanidad", urgente: true },
    { fecha: "09 Abr 2026", evento: "Desparasitación Lote 3", tipo: "sanidad", urgente: true },
    { fecha: "26 Abr 2026", evento: "Ecografías Paridera Octubre", tipo: "ecografia", urgente: false },
    { fecha: "May 2026", evento: "Inicio partos Paridera Mayo", tipo: "parto", urgente: false },
    { fecha: "15 May 2026", evento: "Entrada machos nueva paridera", tipo: "cubricion", urgente: false },
    { fecha: "Jun 2026", evento: "Crotalado crías paridera feb", tipo: "identificacion", urgente: false },
  ];

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
        <KPI icon="🐐" label="Cabras" value={totalCabras} sub={`en ${lotesSorted.length} lotes`} accent="#E8950A" />
        <KPI icon="🍼" label="Partos" value={data.partos.length} sub="registrados" accent="#059669" onClick={() => setModal("partos")} />
        <KPI icon="🔬" label="Ecografías" value={data.ecografias.length} sub={`${dobleVacias.length} doble vacías`} accent="#7C3AED" onClick={() => setModal("eco")} />
        <KPI icon="💉" label="Tratamientos" value={data.tratamientos.length} sub="registrados" accent="#0891B2" onClick={() => setModal("trat")} />
        <KPI icon="🐣" label="Crías" value={data.crias.length} sub="hembras con peseta" accent="#DB2777" onClick={() => setModal("crias")} />
        <KPI icon="🔗" label="Cubriciones" value={data.cubriciones.length} sub={`${data.parideras.length} parideras`} accent="#EA580C" onClick={() => setModal("cubs")} />
      </div>

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
              const color = Object.entries(LOTE_COLORS).find(([k]) => l.nombre.includes(k))?.[1] || "#64748B";
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

      {modal === "partos" && <DataModal title="Partos" icon="🍼" accent="#059669" data={partosModal} columns={partoCols} onClose={() => setModal(null)} searchPH="Buscar crotal, tipo, paridera..." />}
      {modal === "eco" && <DataModal title="Ecografías" icon="🔬" accent="#7C3AED" data={ecosModal} columns={ecoCols} onClose={() => setModal(null)} searchPH="Buscar crotal, resultado..." />}
      {modal === "trat" && <DataModal title="Tratamientos" icon="💉" accent="#0891B2" data={tratsModal} columns={tratCols} onClose={() => setModal(null)} searchPH="Buscar crotal, tipo..." />}
      {modal === "cubs" && <DataModal title="Cubriciones" icon="🔗" accent="#EA580C" data={cubsModal} columns={cubCols} onClose={() => setModal(null)} searchPH="Buscar crotal, método..." />}
      {modal === "crias" && <DataModal title="Crías Hembra" icon="🐣" accent="#DB2777" data={criasModal} columns={criasCols} onClose={() => setModal(null)} searchPH="Buscar peseta, madre..." />}
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

function RentabilidadPage({ data }) {
  const [finMsg, setFinMsg] = useState("");
  const [finMsgs, setFinMsgs] = useState([{ role: "assistant", text: "Soy el asistente financiero. Puedo registrar gastos e ingresos y hacer previsiones. Dime qué necesitas." }]);
  const [tab, setTab] = useState("general");
  const examples = ["He pagado 3.200€ de pienso", "Vendidos 45 cabritos a 38€", "Previsión de ingresos 3 meses", "¿Cuánto cuesta producir un litro?"];
  const send = () => {
    if (!finMsg.trim()) return;
    setFinMsgs(p => [...p, { role: "user", text: finMsg }]); setFinMsg("");
    setTimeout(() => setFinMsgs(p => [...p, { role: "assistant", text: "⚡ Cuando conectemos Claude API, aquí responderé con datos reales y registraré gastos/ingresos en Supabase." }]), 1000);
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
          <ChatBox messages={finMsgs} input={finMsg} setInput={setFinMsg} onSend={send} examples={examples} onExample={setFinMsg} placeholder="Registra gastos o pregunta..." height={520} />
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
function ImportadorPage() {
  const [dO, setDO] = useState(false);
  const [m, setM] = useState("");
  const [ms, setMs] = useState([{ role: "assistant", text: "Sube un Excel y dime qué contiene. Lo proceso y lo meto en la base de datos." }]);
  const s = () => { if (!m.trim()) return; setMs(p => [...p, { role: "user", text: m }]); setM(""); setTimeout(() => setMs(p => [...p, { role: "assistant", text: "⚡ Cuando conectemos Claude API, procesaré el Excel automáticamente." }]), 1000); };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <div>
        <SectionTitle icon="📁" text="Subir Excel" />
        <div style={{ border: `2px dashed ${dO ? "#E8950A" : "#E2E8F0"}`, borderRadius: 16, padding: "42px 28px", textAlign: "center", background: dO ? "#FEF9EE" : "#FAFAFA", cursor: "pointer" }}
          onDragOver={e => { e.preventDefault(); setDO(true); }} onDragLeave={() => setDO(false)} onDrop={e => { e.preventDefault(); setDO(false); }}>
          <div style={{ fontSize: 42, marginBottom: 12 }}>📎</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1E293B" }}>Arrastra el Excel aquí</div>
          <div style={{ fontSize: 12.5, color: "#94A3B8", marginTop: 4 }}>o haz clic para seleccionar</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 14 }}>
          {[{ i: "📊", n: "Producción" }, { i: "🔬", n: "Ecografías" }, { i: "💉", n: "Tratamientos" }, { i: "🐣", n: "Paridera" }, { i: "🐐", n: "Cubriciones" }, { i: "📋", n: "Otro" }].map((t, j) =>
            <div key={j} style={{ background: "#FFF", border: "1px solid #F1F5F9", borderRadius: 10, padding: 11, textAlign: "center", cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "#E8950A80"} onMouseLeave={e => e.currentTarget.style.borderColor = "#F1F5F9"}>
              <div style={{ fontSize: 20 }}>{t.i}</div><div style={{ fontSize: 11.5, fontWeight: 600, color: "#334155", marginTop: 2 }}>{t.n}</div>
            </div>
          )}
        </div>
      </div>
      <ChatBox messages={ms} input={m} setInput={setM} onSend={s} placeholder="Explícame qué has hecho..." height={470} />
    </div>
  );
}

function ConsultasPage() {
  const [q, setQ] = useState("");
  const [ms, setMs] = useState([{ role: "assistant", text: "Pregúntame lo que quieras. Solo datos reales de Supabase, nunca invento." }]);
  const [ld, setLd] = useState(false);
  const send = () => { if (!q.trim()) return; setMs(p => [...p, { role: "user", text: q }]); setQ(""); setLd(true); setTimeout(() => { setMs(p => [...p, { role: "assistant", text: "⚡ Cuando conectemos Claude API, responderé con consultas SQL reales a tu base de datos." }]); setLd(false); }, 1200); };
  const exs = ["Dime las 40 mejores cabras", "¿Qué cabras han salido vacías dos veces?", "Ficha de la cabra 057997", "Cabras del Lote 3 sin vacuna", "Resumen paridera febrero", "Candidatas a cubrición anticipada"];
  return (
    <div style={{ display: "flex", gap: 20, height: "calc(100vh - 155px)" }}>
      <div style={{ flex: 1, background: "#FFF", border: "1px solid #EEF2F6", borderRadius: 16, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "13px 20px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#059669", animation: "pulse 2s infinite" }} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>Asistente Peñas Cercadas</span>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          {ms.map((m, i) => <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", background: m.role === "user" ? "#FEF9EE" : "#F8FAFC", border: `1px solid ${m.role === "user" ? "#FDE68A" : "#F1F5F9"}`, borderRadius: 13, padding: "12px 17px", maxWidth: "80%", fontSize: 13.5, color: "#334155", lineHeight: 1.6 }}>{m.text}</div>)}
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

function ConfigPage({ data }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
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
          <SectionTitle icon="🏥" text={`Protocolo Veterinario (${data.protocolos.length})`} />
          {data.protocolos.length > 0 ? [...new Set(data.protocolos.map(p => p.fase))].map((fase, i) => {
            const items = data.protocolos.filter(p => p.fase === fase);
            const cc = { nodriza: "#DB2777", post_destete: "#E8950A", recria: "#0891B2", preparto: "#059669" };
            return <div key={i} style={{ background: `${cc[fase] || "#64748B"}08`, border: `1px solid ${cc[fase] || "#64748B"}20`, borderRadius: 10, padding: "12px 15px", marginBottom: 7 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: cc[fase] || "#64748B", marginBottom: 2, textTransform: "capitalize" }}>{fase.replace("_", " ")}</div>
              <div style={{ fontSize: 11.5, color: "#64748B" }}>{items.map(i => i.tratamiento).join(", ")}</div>
            </div>;
          }) : <div style={{ color: "#94A3B8", fontSize: 13 }}>No hay protocolos cargados</div>}
        </Card>
      </div>
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
            {{ dashboard: "Dashboard", rentabilidad: "Rentabilidad y Previsiones", importador: "Importador de Datos", consultas: "Consultas y Análisis", config: "Configuración" }[page]}
          </div>
          <div style={{ fontSize: 12.5, color: "#94A3B8", marginTop: 3 }}>
            {{ dashboard: `Datos en vivo de Supabase · ${data.cabras.length} cabras · ${data.parideras.length} parideras`,
              rentabilidad: "Análisis financiero · Previsión de producción · Control de ingresos y gastos",
              importador: "Sube Excel y el asistente los procesa automáticamente",
              consultas: "Pregunta lo que quieras — respuestas con datos reales",
              config: `${data.reglas.length} reglas · ${data.protocolos.length} protocolos veterinarios` }[page]}
          </div>
        </div>
        {page === "dashboard" && <DashboardPage data={data} />}
        {page === "rentabilidad" && <RentabilidadPage data={data} />}
        {page === "importador" && <ImportadorPage />}
        {page === "consultas" && <ConsultasPage />}
        {page === "config" && <ConfigPage data={data} />}
      </div>
    </div>
  );
}
