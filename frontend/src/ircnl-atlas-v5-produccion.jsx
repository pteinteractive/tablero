import { useState, useCallback, useEffect } from "react";
import { TabSyncLog } from "./TabSyncLog";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer
} from "recharts";

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTES GLOBALES (Fase 2)
// ═══════════════════════════════════════════════════════════════════════════════
const PIPELINE_ID = "19584269";
const TOTAL = 130639;

const STAGES_MAP = {
  "47866392":  { label:"Recibido",                    color:"#1a52c4" },
  "47866394":  { label:"Asignado",                    color:"#5b21b6" },
  "47916048":  { label:"En proceso",                  color:"#8a5c00" },
  "47916050":  { label:"Esperando por nosotros",      color:"#b52626" },
  "47916049":  { label:"Esperando recepción Oficio",  color:"#0c6e63" },
  "47916053":  { label:"Cerrado",                     color:"#1a7848" },
  "224532383": { label:"Rechazado",                   color:"#b94e1e" },
};

const AGENTES = {
  "338005281":"maria dolores briones de la fuente",
  "338005268":"MARIA GUADALUPE HEREDIA GARCIA",
};

// ─── TEMAS Y ESTILOS ─────────────────────────────────────────────────────────
const buildTheme = (dark) => dark ? {
  appBg:"#0b1120", sidebar:"#070d18", panel:"#111827", card:"#141e2e", row2:"#0f1724", topbar:"#111827",
  bd1:"#1e2d42", bd2:"#253447", t1:"#eef4ff", t2:"#9bb8d4", t3:"#607d98", t4:"#405569",
  blue:"#5b9cf6", terrac:"#e07b54", green:"#3dba7f", amber:"#e8b84b",
} : {
  appBg:"#f5f2ed", sidebar:"#1c2b3a", panel:"#ffffff", card:"#ffffff", row2:"#f9f7f4", topbar:"#ffffff",
  bd1:"#e2d9cc", bd2:"#c9bfb3", t1:"#111820", t2:"#2e3f52", t3:"#56708a", t4:"#8a9eaf",
  blue:"#1a52c4", terrac:"#b94e1e", green:"#1a7848", amber:"#8a5c00",
};

const MONOS  = "'DM Mono', monospace";
const SERIFS = "'Source Serif 4', serif";
const N      = n => (n ?? 0).toLocaleString("es-MX");

// ─── COMPONENTES UI COMPARTIDOS ──────────────────────────────────────────────
function Badge({label, color}) {
  return (
    <span style={{
      fontFamily:MONOS, fontSize:9.5, fontWeight:600, color, 
      background:`${color}1a`, border:`1px solid ${color}44`,
      borderRadius:4, padding:"2px 9px",
    }}>{label}</span>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// COMPONENTE LOGIN (Seguridad Fase 1 + 2)
// ══════════════════════════════════════════════════════════════════════════
function LoginView({ onLoginSuccess, T }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      // 🚀 RUTA RELATIVA: Pasa por Nginx (.50) -> Rewrite -> API (.52)
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('token', data.token);
        onLoginSuccess();
      } else {
        setError(data.msg || "Acceso denegado");
      }
    } catch (err) {
      setError("Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{display:'flex', height:'100vh', alignItems:'center', justifyContent:'center', background:T.appBg}}>
      <form onSubmit={handleLogin} style={{background:T.card, padding:40, borderRadius:16, border:`1px solid ${T.bd1}`, width:350, boxShadow:'0 10px 30px rgba(0,0,0,0.1)'}}>
        <div style={{fontFamily:SERIFS, fontSize:24, fontWeight:800, marginBottom:25, textAlign:'center', color:T.t1}}>ATLAS v5</div>
        {error && <div style={{background:'#fee2e2', color:'#b91c1c', padding:10, borderRadius:8, fontSize:12, marginBottom:15, textAlign:'center'}}>{error}</div>}
        <input type="text" placeholder="Correo IRCNL" value={user} onChange={e=>setUser(e.target.value)} style={{width:'100%', padding:12, marginBottom:15, borderRadius:8, border:`1px solid ${T.bd2}`, background:T.panel, color:T.t1}} required />
        <input type="password" placeholder="Contraseña" value={pass} onChange={e=>setPass(e.target.value)} style={{width:'100%', padding:12, marginBottom:20, borderRadius:8, border:`1px solid ${T.bd2}`, background:T.panel, color:T.t1}} required />
        <button type="submit" disabled={loading} style={{width:'100%', padding:12, background:T.blue, color:'#fff', border:'none', borderRadius:8, fontWeight:700, cursor:'pointer'}}>
          {loading ? 'Validando...' : 'ENTRAR'}
        </button>
      </form>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// TAB BÚSQUEDA (Conectada a Clúster PostgreSQL)
// ══════════════════════════════════════════════════════════════════════════
function TabBusqueda({ T }) {
  const [mode, setMode] = useState("expediente");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const buscar = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const url = new URL('/api/tickets', window.location.origin);
      url.searchParams.append('campo', mode);
      url.searchParams.append('q', query);

      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      setResults(data.tickets || data);
    } catch (err) { setResults([]); } finally { setLoading(false); }
  };

  return (
    <div className="emerge">
      <div style={{background:T.card, padding:22, borderRadius:12, border:`1px solid ${T.bd1}`, marginBottom:20}}>
        <div style={{display:'flex', gap:10, marginBottom:15}}>
          {['expediente', 'correo', 'nombre', 'id'].map(m => (
            <button key={m} onClick={()=>setMode(m)} style={{background:mode===m?T.terrac:'transparent', color:mode===m?'#fff':T.t2, border:`1px solid ${T.bd2}`, padding:'8px 15px', borderRadius:8, fontSize:11, fontFamily:MONOS}}>{m.toUpperCase()}</button>
          ))}
        </div>
        <div style={{display:'flex', gap:10}}>
          <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&buscar()} placeholder="Valor de búsqueda..." style={{flex:1, padding:12, borderRadius:8, border:`1px solid ${T.bd2}`, background:T.panel, color:T.t1}} />
          <button onClick={buscar} style={{background:T.terrac, color:'#fff', border:'none', padding:'0 25px', borderRadius:8, fontWeight:700}}>{loading?'...':'BUSCAR'}</button>
        </div>
      </div>
      {results && (
        <div style={{background:T.card, borderRadius:12, border:`1px solid ${T.bd1}`, overflow:'hidden'}}>
          <table style={{width:'100%', borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:T.row2, borderBottom:`2px solid ${T.bd1}`}}>
                <th style={{padding:12, textAlign:'left', fontFamily:MONOS, fontSize:10, color:T.t3}}>ID TICKET</th>
                <th style={{padding:12, textAlign:'left', fontFamily:MONOS, fontSize:10, color:T.t3}}>SOLICITANTE</th>
                <th style={{padding:12, textAlign:'left', fontFamily:MONOS, fontSize:10, color:T.t3}}>ETAPA</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r,i) => (
                <tr key={r.id} style={{background: i%2===0?T.card:T.row2, borderBottom:`1px solid ${T.bd1}`}}>
                  <td style={{padding:12, fontFamily:MONOS, fontSize:11, color:T.blue}}>{r.id}</td>
                  <td style={{padding:12, fontFamily:SERIFS, fontSize:13, color:T.t1}}>{r.nombre_persona_tramite}</td>
                  <td style={{padding:12}}><Badge label={STAGES_MAP[r.hs_pipeline_stage]?.label || "En proceso"} color={T.green} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── DASHBOARD PRINCIPAL ─────────────────────────────────────────────────────
export default function AtlasDashboard() {
  const [isAuth, setIsAuth] = useState(!!localStorage.getItem('token'));
  const [dark, setDark] = useState(false);
  const [tab, setTab] = useState("overview");
  const T = buildTheme(dark);

  if (!isAuth) return <LoginView onLoginSuccess={()=>setIsAuth(true)} T={T} />;

  return (
    <div style={{display:"flex", minHeight:"100vh", background:T.appBg, fontFamily:SERIFS}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600;700&family=DM+Mono:wght@400;500;600&display=swap');
        .emerge { animation: emerge .3s ease-out both; }
        @keyframes emerge { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* SIDEBAR */}
      <div style={{width:230, background:T.sidebar, padding:25, color:'#fff', display:'flex', flexDirection:'column', gap:12}}>
        <div style={{fontSize:22, fontWeight:900, marginBottom:30}}>ATLAS v5</div>
        {['overview', 'busqueda', 'sincronizacion'].map(id => (
          <button key={id} onClick={()=>setTab(id)} style={{
            background: tab===id ? 'rgba(255,255,255,0.1)' : 'transparent',
            color: tab===id ? '#fff' : 'rgba(255,255,255,0.4)',
            border:'none', textAlign:'left', padding:12, borderRadius:8, fontFamily:MONOS, fontSize:12, cursor:'pointer'
          }}>{id.toUpperCase()}</button>
        ))}
        <button onClick={()=>{localStorage.removeItem('token'); setIsAuth(false);}} style={{marginTop:'auto', background:'transparent', border:`1px solid rgba(255,255,255,0.2)`, color:'rgba(255,255,255,0.5)', padding:10, borderRadius:8, fontSize:10}}>CERRAR SESIÓN</button>
      </div>

      {/* CONTENIDO */}
      <div style={{flex:1, display:'flex', flexDirection:'column'}}>
        <header style={{height:65, background:T.topbar, borderBottom:`1px solid ${T.bd1}`, display:'flex', alignItems:'center', padding:'0 30px', justifyContent:'space-between'}}>
          <div style={{fontWeight:700, color:T.t1}}>{tab.toUpperCase()}</div>
          <button onClick={()=>setDark(!dark)} style={{background:T.row2, border:`1px solid ${T.bd1}`, color:T.t2, padding:'5px 15px', borderRadius:8, fontSize:11}}>{dark?'☀️ DÍA':'🌙 NOCHE'}</button> <button onClick={()=>{localStorage.clear();window.location.reload()}} style={{background:"#ff4d4f", border:"none", color:"white", padding:"5px 15px", borderRadius:8, fontSize:11, marginLeft:10, cursor:"pointer"}}>🚪 SALIR</button>
        </header>
        
        <main style={{flex:1, padding:30, overflowY:'auto'}}>
          {tab === 'overview' && <div className="emerge" style={{color:T.t3}}>Bienvenido al Tablero IRCNL. Seleccione Búsqueda para consultar la Base de Datos.</div>}
          {tab === 'busqueda' && <TabBusqueda T={T} />}
          {tab === 'sincronizacion' && <div className="emerge"><TabSyncLog T={T} /></div>}
        </main>
      </div>
    </div>
  );
}
