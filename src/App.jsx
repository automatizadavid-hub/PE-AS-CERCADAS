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
  lines.push(`Total cabras: ${data.cabras.length}`);
  
  // Lotes with counts
  const loteCounts = {};
  data.cabras.forEach(c => {
    const lote = data.lotes.find(l => l.id === c.lote_id);
    if (lote) loteCounts[lote.nombre] = (loteCounts[lote.nombre] || 0) + 1;
  });
  lines.push("Lotes: " + Object.entries(loteCounts).map(([n, c]) => `${n}: ${c}`).join(", "));
  
  lines.push(`Partos registrados: ${data.partos.length}`);
  lines.push(`Ecografías: ${data.ecografias.length}`);
  lines.push(`Tratamientos: ${data.tratamientos.length}`);
  lines.push(`Cubriciones: ${data.cubriciones.length}`);
  lines.push(`Crías hembra: ${data.crias.length}`);
  lines.push(`Parideras: ${data.parideras.map(p => p.nombre).join(", ")}`);
  lines.push(`Reglas activas: ${data.reglas.length}`);
  
  // Production data
  if (data.resumenes && data.resumenes.length > 0) {
    const last = data.resumenes[0];
    lines.push(`\nÚltimo informe producción: ${last.fecha}`);
    lines.push(`Litros totales ese día: ${last.litros_totales}`);
    lines.push(`Media por cabra: ${last.media_litros} L`);
    lines.push(`Cabras con conductividad alta: ${last.cabras_alta_conductividad || 0}`);
  }
  
  // Double vacías
  const vaciasByC = {};
  data.ecografias.filter(e => e.resultado === "vacia").forEach(e => {
    const cr = e.cabra?.crotal;
    if (cr) vaciasByC[cr] = (vaciasByC[cr] || 0) + 1;
  });
  const dobleVacias = Object.entries(vaciasByC).filter(([, c]) => c >= 2).map(([cr]) => cr);
  if (dobleVacias.length > 0) lines.push(`Cabras vacías en 2+ ecografías: ${dobleVacias.join(", ")}`);
  
  return lines.join("\n");
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
      const [cabrasR, lotesR, partosR, ecosR, tratsR, cubsR, criasR, reglasR, pariderasR, muerteR, protocoloR, eventosR, produccionR, resumenR] = await Promise.all([
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
        supabase.from("evento_calendario").select("*").order("fecha", { ascending: true }),
        supabase.from("produccion_leche").select("*").order("fecha", { ascending: false }).limit(15000),
        supabase.from("resumen_diario").select("*").order("fecha", { ascending: false }).limit(30),
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
        eventos: eventosR.data || [],
        produccion: produccionR.data || [],
        resumenes: resumenR.data || [],
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
function DataModal({ title, icon, accent, data, columns, onClose, searchPH, folders }) {
  const [s, setS] = useState("");
  const [activeFolder, setActiveFolder] = useState(folders ? null : "__all__");
  
  const currentData = activeFolder === "__all__" ? data : 
    folders ? data.filter(r => r.__folder === activeFolder) : data;
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
                  <span style={{ fontSize: 13, color: "#94A3B8" }}>› {activeFolder}</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "#94A3B8" }}>{activeFolder ? `${f.length} registros` : `${folders.length} carpetas`}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {activeFolder && folders && (
              <button onClick={() => { setActiveFolder(null); setS(""); }} style={{ padding: "7px 14px", borderRadius: 9, border: "1px solid #E2E8F0", background: "#F8FAFC", cursor: "pointer", fontSize: 12, color: "#64748B", fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                ← Volver
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

        {/* Data view */}
        {activeFolder && <>
          <div style={{ padding: "14px 26px", borderBottom: "1px solid #F1F5F9" }}>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", fontSize: 15 }}>🔍</span>
              <input value={s} onChange={e => setS(e.target.value)} placeholder={searchPH || "Buscar..."} style={{ width: "100%", padding: "11px 15px 11px 40px", borderRadius: 11, border: "2px solid #E2E8F0", fontSize: 13, color: "#1E293B", outline: "none", background: "#F8FAFC", boxSizing: "border-box" }} onFocus={e => e.target.style.borderColor = accent} onBlur={e => e.target.style.borderColor = "#E2E8F0"} />
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "0 26px 18px" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 3px", marginTop: 6 }}>
              <thead><tr>{columns.map((c, i) => <th key={i} style={{ textAlign: "left", padding: "9px 13px", fontSize: 10.5, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: ".06em", position: "sticky", top: 0, background: "#FFF" }}>{c.label}</th>)}</tr></thead>
              <tbody>{f.slice(0, 300).map((r, i) => <tr key={i} onMouseEnter={e => e.currentTarget.style.background = "#F8FAFC"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
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
function ChatBox({ messages, input, setInput, onSend, examples, onExample, placeholder, height = 460 }) {
  return (
    <div style={{ background: "#FFF", border: "1px solid #EEF2F6", borderRadius: 16, display: "flex", flexDirection: "column", height, boxShadow: "0 1px 4px rgba(0,0,0,0.03)" }}>
      <div style={{ padding: "13px 18px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#059669", animation: "pulse 2s infinite" }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#1E293B" }}>Asistente Peñas Cercadas</span>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", background: m.role === "user" ? "#FEF9EE" : "#F8FAFC", border: `1px solid ${m.role === "user" ? "#FDE68A" : "#F1F5F9"}`, borderRadius: 12, padding: "10px 15px", maxWidth: m.role === "user" ? "85%" : "95%", fontSize: 13, color: "#334155", lineHeight: 1.5 }}>
            {m.role === "assistant" && (m.text.includes('##') || m.text.includes('**') || m.text.includes('\n- ')) ? <FormattedMessage text={m.text} /> : m.text}
          </div>
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

function FormattedMessage({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('## ')) {
      const title = line.replace('## ', '');
      const sectionLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('## ')) {
        if (lines[i].trim()) sectionLines.push(lines[i]);
        i++;
      }
      elements.push(
        <div key={elements.length} style={{ background: "#FFF", border: "1px solid #EEF2F6", borderRadius: 12, padding: "14px 18px", marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#E8950A", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #F1F5F9" }}>{title}</div>
          {sectionLines.map((sl, j) => <FormattedLine key={j} line={sl} />)}
        </div>
      );
      continue;
    }
    if (line.trim()) elements.push(<FormattedLine key={elements.length} line={line} />);
    i++;
  }
  return <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>{elements}</div>;
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
  const LOTE_COLORS = { "Lote 1": "#E8950A", "Lote 2": "#DB2777", "Lote 3": "#7C3AED", "Lote 4": "#DC2626", "Lote 5": "#0891B2", "Lote 6": "#EA580C", "Lote 13": "#059669" };

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
        return <DataModal title="Cabras" icon="🐐" accent="#E8950A" data={cabrasModal} columns={cabraCols} onClose={() => setModal(null)} searchPH="Buscar crotal, estado, lote..." folders={cabraFolders} />;
      })()}

      {modal === "partos" && (() => {
        const d = partosModal.map(p => ({ ...p, __folder: p.paridera || "Sin paridera" }));
        const folders = [...new Set(d.map(r => r.__folder))].map(f => ({ name: f, count: d.filter(r => r.__folder === f).length }));
        return <DataModal title="Partos" icon="🍼" accent="#059669" data={d} columns={partoCols} onClose={() => setModal(null)} searchPH="Buscar crotal, tipo..." folders={folders} />;
      })()}

      {modal === "eco" && (() => {
        const d = ecosModal.map(e => ({ ...e, __folder: e.paridera || "Sin paridera" }));
        const folders = [...new Set(d.map(r => r.__folder))].map(f => ({ name: f, count: d.filter(r => r.__folder === f).length }));
        return <DataModal title="Ecografías" icon="🔬" accent="#7C3AED" data={d} columns={ecoCols} onClose={() => setModal(null)} searchPH="Buscar crotal, resultado..." folders={folders} />;
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

function RentabilidadPage({ data }) {
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
function ImportadorPage({ data, refresh }) {
  const [dO, setDO] = useState(false);
  const [m, setM] = useState("");
  const [ms, setMs] = useState([{ role: "assistant", text: "Sube un CSV del FLM o cualquier archivo de datos. Lo analizo y puedo importarlo a la base de datos. También puedes decirme cosas como 'Se ha muerto la cabra 057600' o 'Cambia la 056749 al Lote 4'." }]);
  const [ld, setLd] = useState(false);
  const [fileName, setFileName] = useState(null);
  const [fileData, setFileData] = useState(null);
  const [rawRows, setRawRows] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
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
        
        // If not found, create it
        if (!cabra) {
          const loteName = mapGrupo(grupo);
          let lote = loteName ? data.lotes.find(l => l.nombre === loteName) : null;
          if (!lote && loteName) {
            const { data: created } = await supabase.from("lote").insert([{
              nombre: loteName, tipo: "alta_produccion", descripcion: grupo
            }]).select().single();
            if (created) { lote = created; data.lotes.push({ ...created, cabras: 0 }); }
          }
          const { data: newC, error: errC } = await supabase.from("cabra").insert([{
            crotal, estado: "lactacion", sexo: "hembra", raza: "Murciano-Granadina",
            num_lactaciones: lactacion, dias_en_leche: del_dias,
            lote_id: lote?.id || null,
            notas: `Añadida desde informe FLM ${reportDate}`
          }]).select().single();
          if (errC) { errors++; errorList.push(`${crotal}: error creando cabra — ${errC.message}`); continue; }
          cabra = newC;
          newCabras++;
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
            const { error: errU } = await supabase.from("cabra").update({ lote_id: newLote.id, dias_en_leche: del_dias, num_lactaciones: lactacion }).eq("id", cabra.id);
            if (errU) { errorList.push(`${crotal}: error actualizando lote — ${errU.message}`); }
            else { loteChanges++; }
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
    await supabase.from("resumen_diario").upsert([{
      fecha: reportDate, total_cabras: dataRows.length,
      litros_totales: Math.round(totalLitros * 100) / 100,
      media_litros: Math.round(totalLitros / dataRows.length * 1000) / 1000,
      cabras_alta_conductividad: alertas.filter(a => a.msg.includes("conductividad")).length,
      archivo_origen: fileName,
    }], { onConflict: "fecha" });

    setImportResult({ imported, errors, newCabras, loteChanges, totalLitros, alertas, errorList, total: dataRows.length });
    setImporting(false);
    refresh();
    
    // Add result to chat
    let chatMsg = `✅ Importación completada:\n• ${imported}/${dataRows.length} registros de producción importados\n• ${totalLitros.toFixed(1)} litros totales hoy\n• ${loteChanges} cambios de lote detectados`;
    if (newCabras > 0) chatMsg += `\n• ${newCabras} cabras nuevas creadas`;
    if (errors > 0) chatMsg += `\n• 🔴 ${errors} errores:\n${errorList.slice(0, 10).map(e => `  - ${e}`).join("\n")}`;
    if (alertas.length > 0) chatMsg += `\n\n🚨 ALERTAS (${alertas.length}):\n${alertas.slice(0, 10).map(a => a.msg).join("\n")}`;
    setMs(p => [...p, { role: "assistant", text: chatMsg }]);
  };

  const readFile = async (file) => {
    setFileName(file.name);
    setImportResult(null);
    try {
      const text = await readFileText(file);
      const rows = parseCSV(text);
      const cleanRows = rows.filter(r => r.length > 1 && r[0]);
      setRawRows(cleanRows);
      setFileData({ "Datos": cleanRows.slice(0, 60) });
      
      const preview = cleanRows.slice(0, 10).map(r => r.join(" | ")).join("\n");
      setMs(p => [...p, { role: "user", text: `📎 ${file.name} subido (${cleanRows.length} filas)` }]);
      
      if (isProductionCSV(cleanRows[0] || [])) {
        const colMap = buildColumnMap(cleanRows[0]);
        const colInfo = Object.entries(colMap).map(([k, v]) => `${k}→col${v}`).join(", ");
        setMs(p => [...p, { role: "assistant", text: `✅ Informe FLM detectado: ${cleanRows.length - 1} cabras, ${Object.keys(colMap).length} columnas mapeadas.\n\n📊 Columnas: ${colInfo}\n\nPulsa "Importar a Supabase" para procesarlo.` }]);
      } else {
        setLd(true);
        const response = await askClaude(
          `Archivo: "${file.name}". Primeras filas:\n\n${preview}\n\nTotal: ${cleanRows.length}. Analiza e identifica qué datos son.`,
          dataCtx
        );
        setMs(p => [...p, { role: "assistant", text: response }]);
        setLd(false);
      }
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
    const response = await askClaude(userMsg, ctx);
    setMs(p => [...p, { role: "assistant", text: response }]);
    setLd(false);
  };

  const canImport = rawRows && isProductionCSV(rawRows[0] || []);

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

        {canImport && !importResult && (
          <button onClick={() => importProduction(rawRows)} disabled={importing}
            style={{ width: "100%", marginTop: 14, padding: "14px", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 700, cursor: importing ? "wait" : "pointer",
              background: importing ? "#94A3B8" : "linear-gradient(135deg, #059669, #047857)", color: "#FFF",
            }}>
            {importing ? "⏳ Importando..." : `🚀 Importar ${rawRows.length - 1} cabras a Supabase`}
          </button>
        )}

        {importResult && (
          <Card style={{ marginTop: 14, background: importResult.errors > 0 ? "#FEF9EE" : "#F0FDF4", border: `1px solid ${importResult.errors > 0 ? "#FDE68A" : "#BBF7D0"}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#059669", marginBottom: 10 }}>✅ Importación completada</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
              <div style={{ textAlign: "center", padding: 8, background: "#FFF", borderRadius: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#059669" }}>{importResult.imported}</div>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>Importados</div>
              </div>
              <div style={{ textAlign: "center", padding: 8, background: "#FFF", borderRadius: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#E8950A" }}>{importResult.totalLitros.toFixed(0)}L</div>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>Litros hoy</div>
              </div>
              <div style={{ textAlign: "center", padding: 8, background: "#FFF", borderRadius: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#7C3AED" }}>{importResult.loteChanges}</div>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>Cambios lote</div>
              </div>
            </div>
            {importResult.alertas.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#DC2626", marginBottom: 6 }}>🚨 Alertas ({importResult.alertas.length})</div>
                {importResult.alertas.slice(0, 8).map((a, i) => (
                  <div key={i} style={{ fontSize: 11, color: "#475569", padding: "3px 0", borderBottom: "1px solid #F1F5F9" }}>{a.msg}</div>
                ))}
                {importResult.alertas.length > 8 && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>...y {importResult.alertas.length - 8} más</div>}
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
        <ChatBox messages={ms} input={m} setInput={setM} onSend={s} placeholder="Explícame qué has hecho o pregunta..." height={canImport ? 380 : 500} />
      </div>
    </div>
  );
}

function ConsultasPage({ data }) {
  const [q, setQ] = useState("");
  const [ms, setMs] = useState([{ role: "assistant", text: "Pregúntame lo que quieras sobre tu granja. Tengo acceso a todos los datos: producción, partos, ecografías, tratamientos, cubriciones, crías, lotes. Puedo cruzar cualquier dato." }]);
  const [ld, setLd] = useState(false);
  
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
    
    // Include production data when relevant
    if (msg.includes("produc") || msg.includes("leche") || msg.includes("litro") || msg.includes("mejor") || msg.includes("peor") || msg.includes("rendimiento") || msg.includes("descart") || msg.includes("matadero")) {
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
    
    // Include lote details when relevant
    if (msg.includes("lote") || msg.includes("grupo") || msg.includes("manada") || msg.includes("distribu")) {
      ctx += `\n\nDETALLE POR LOTE:`;
      data.lotes.filter(l => l.cabras > 0).sort((a, b) => b.cabras - a.cabras).forEach(l => {
        const loteProd = todayProd.filter(p => { const c = data.cabras.find(cc => cc.id === p.cabra_id); return c && c.lote_id === l.id; });
        const totalL = loteProd.reduce((s, p) => s + (p.litros || 0), 0);
        const mediaL = loteProd.length > 0 ? totalL / loteProd.length : 0;
        ctx += `\n  ${l.nombre}: ${l.cabras} cabras, ${totalL.toFixed(1)}L total, ${mediaL.toFixed(2)}L/cabra media`;
      });
    }
    
    // Specific goat lookup
    const crotalMatch = userMsg.match(/\b(\d{5,6})\b/);
    if (crotalMatch) {
      const crotal = crotalMatch[1];
      const cabra = data.cabras.find(c => c.crotal === crotal);
      const partosC = data.partos.filter(p => p.cabra?.crotal === crotal);
      const ecosC = data.ecografias.filter(e => e.cabra?.crotal === crotal);
      const tratsC = data.tratamientos.filter(t => t.cabra?.crotal === crotal);
      const cubsC = data.cubriciones.filter(c => c.cabra?.crotal === crotal);
      const criasC = data.crias.filter(c => c.madre?.crotal === crotal);
      const prodC = cabra ? prodByCabraId[cabra.id] : null;
      ctx += `\n\nFICHA COMPLETA CABRA ${crotal}:`;
      if (cabra) ctx += `\nEstado: ${cabra.estado}, Lote: ${cabra.lote?.nombre || '-'}, Lactaciones: ${cabra.num_lactaciones || '-'}, DEL: ${cabra.dias_en_leche || '-'}, Edad: ${cabra.edad_meses || '-'} meses`;
      if (prodC) ctx += `\nProducción hoy: ${prodC.litros}L, Prom10d: ${prodC.promedio_10d || prodC.media_10d || '-'}, LitTotales: ${prodC.litros_totales_lactacion}, Conductividad: ${prodC.conductividad}, Flujo: ${prodC.flujo}, Tiempo: ${prodC.tiempo_ordeno}min`;
      if (partosC.length > 0) ctx += `\nPartos (${partosC.length}): ${partosC.map(p => `${p.fecha} ${p.tipo} ${p.num_crias}crías`).join('; ')}`;
      if (ecosC.length > 0) ctx += `\nEcografías (${ecosC.length}): ${ecosC.map(e => `${e.fecha} ${e.resultado}`).join('; ')}`;
      if (tratsC.length > 0) ctx += `\nTratamientos (${tratsC.length}): ${tratsC.map(t => `${t.fecha} ${t.tipo} ${t.producto || ''}`).join('; ')}`;
      if (cubsC.length > 0) ctx += `\nCubriciones (${cubsC.length}): ${cubsC.map(c => `${c.fecha_entrada} ${c.metodo}`).join('; ')}`;
      if (criasC.length > 0) ctx += `\nCrías: ${criasC.map(c => `peseta ${c.peseta}`).join(', ')}`;
      if (!cabra) ctx += `\nEsta cabra NO existe en el sistema.`;
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
        <div style={{ padding: "13px 20px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#059669", animation: "pulse 2s infinite" }} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>Asistente Peñas Cercadas</span>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          {ms.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", background: m.role === "user" ? "#FEF9EE" : "#F8FAFC", border: `1px solid ${m.role === "user" ? "#FDE68A" : "#F1F5F9"}`, borderRadius: 13, padding: "12px 17px", maxWidth: m.role === "user" ? "80%" : "90%", fontSize: 13.5, color: "#334155", lineHeight: 1.6 }}>
              {m.role === "assistant" && (m.text.includes('##') || m.text.includes('**') || m.text.includes('\n- ')) ? <FormattedMessage text={m.text} /> : m.text}
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
        {[{ id: "calendario", l: "📅 Calendario" }, { id: "reglas", l: "📏 Reglas" }, { id: "protocolo", l: "🏥 Protocolo" }, { id: "parametros", l: "⚙️ Parámetros" }].map(t =>
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
function ProduccionPage({ data }) {
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

  // Today's production
  const todayProd = latestDate ? allProd.filter(p => p.fecha === latestDate) : [];
  const prevProd = previousDate ? allProd.filter(p => p.fecha === previousDate) : [];

  // Daily summary from all production records (more accurate than resumen_diario)
  const dailySummary = allDates.map(fecha => {
    const dayProd = allProd.filter(p => p.fecha === fecha);
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

  // Health alerts from today's production
  const healthAlerts = [];
  stats.filter(s => s.conductividad > 6.0).sort((a, b) => b.conductividad - a.conductividad)
    .forEach(s => healthAlerts.push({ tipo: "alta", msg: `${s.crotal}: conductividad ${s.conductividad.toFixed(2)} mS/cm`, icon: "🔴" }));
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
    const prodCtx = dataCtx + `\n\nDATOS DE PRODUCCIÓN DE HOY (${latestDate || "sin datos"}):\nTotal litros: ${totalLitros.toFixed(1)}\nMedia/cabra: ${avgLitros.toFixed(2)}L\nCabras en ordeño: ${stats.length}\nMedia conductividad: ${avgConductividad.toFixed(2)}\n\nTOP 10 productoras: ${sortedByProd.slice(0, 10).map(s => `${s.crotal}: ${s.litros.toFixed(2)}L (DEL=${s.del}, Lact=${s.lactacion})`).join("; ")}\n\nPEORES 10: ${sortedByProd.slice(-10).reverse().map(s => `${s.crotal}: ${s.litros.toFixed(2)}L (DEL=${s.del}, Lact=${s.lactacion})`).join("; ")}\n\nPOR LOTE: ${loteData.map(l => `${l.nombre}: ${l.cabras} cabras, media ${l.media.toFixed(2)}L`).join("; ")}\n\nALERTAS CONDUCTIVIDAD (>6.0): ${stats.filter(s => s.conductividad > 6.0).map(s => `${s.crotal}: ${s.conductividad.toFixed(2)}`).join(", ") || "ninguna"}\n\nCANDIDATAS DESCARTE (baja prod + muchas lactaciones): ${cullCandidates.slice(0, 10).map(s => `${s.crotal}: ${s.litros.toFixed(2)}L, lact=${s.lactacion}`).join("; ") || "ninguna"}\n\nESTRELLAS EMERGENTES (1ª lactación >3L): ${risingStars.slice(0, 10).map(s => `${s.crotal}: ${s.litros.toFixed(2)}L`).join(", ") || "ninguna"}`;
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
// MAIN APP
// ==========================================
const NAV = [
  { id: "dashboard", icon: "📊", label: "Dashboard" },
  { id: "produccion", icon: "🥛", label: "Producción" },
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
            {{ dashboard: "Dashboard", produccion: "Producción & Análisis", rentabilidad: "Rentabilidad y Previsiones", importador: "Importador de Datos", consultas: "Consultas y Análisis", config: "Configuración" }[page]}
          </div>
          <div style={{ fontSize: 12.5, color: "#94A3B8", marginTop: 3 }}>
            {{ dashboard: `Datos en vivo de Supabase · ${data.cabras.length} cabras · ${data.parideras.length} parideras`,
              produccion: `Análisis productivo · ${data.produccion?.length || 0} registros · Alertas sanitarias`,
              rentabilidad: "Análisis financiero · Previsión de producción · Control de ingresos y gastos",
              importador: "Sube CSV del FLM y se importa automáticamente a Supabase",
              consultas: "Pregunta lo que quieras — respuestas con datos reales",
              config: `${data.reglas.length} reglas · ${data.protocolos.length} protocolos veterinarios` }[page]}
          </div>
        </div>
        {page === "dashboard" && <DashboardPage data={data} />}
        {page === "produccion" && <ProduccionPage data={data} />}
        {page === "rentabilidad" && <RentabilidadPage data={data} />}
        {page === "importador" && <ImportadorPage data={data} refresh={refresh} />}
        {page === "consultas" && <ConsultasPage data={data} />}
        {page === "config" && <ConfigPage data={data} refresh={refresh} />}
      </div>
    </div>
  );
}
