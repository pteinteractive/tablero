import { useState, useCallback, useEffect } from "react";
import { TabSyncLog } from "./TabSyncLog";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer
} from "recharts";

// ═══════════════════════════════════════════════════════════════════════════════
// DATOS REALES Y CONSTANTES
// ═══════════════════════════════════════════════════════════════════════════════

const PIPELINE_ID = "19584269";
const TOTAL = 130639;

const STAGES_MAP = {
  "47866392":  { label:"Recibido",                    color:"#1a52c4", order:1 },
  "47866394":  { label:"Asignado",                    color:"#5b21b6", order:2 },
  "47916048":  { label:"En proceso",                  color:"#8a5c00", order:3 },
  "47916050":  { label:"Esperando por nosotros",      color:"#b52626", order:4 },
  "47916049":  { label:"Esperando recepción Oficio",  color:"#0c6e63", order:5 },
  "47916053":  { label:"Cerrado",                     color:"#1a7848", order:6 },
  "224532383": { label:"Rechazado",                   color:"#b94e1e", order:7 },
};
const STAGE_COLORS_DARK = {
  "47866392":"#4f8ef7","47866394":"#a78bfa","47916048":"#f6b33a",
  "47916050":"#f87171","47916049":"#2dd4c0","47916053":"#34d97b","224532383":"#e07b54",
};

const STAGES = [
  { id:"47866392",  label:"Recibido",                    count:2221,  pct:1.7  },
  { id:"47866394",  label:"Asignado",                    count:1756,  pct:1.3  },
  { id:"47916048",  label:"En proceso",                  count:17044, pct:13.0 },
  { id:"47916050",  label:"Esperando por nosotros",      count:1671,  pct:1.3  },
  { id:"47916049",  label:"Esperando recepción Oficio",  count:1949,  pct:1.5  },
  { id:"47916053",  label:"Cerrado",                     count:85068, pct:65.1 },
  { id:"224532383", label:"Rechazado",                   count:20927, pct:16.0 },
];

const BY_YEAR = [
  { year:"2023", rec:1303,  cer:1050,  rech:180   },
  { year:"2024", rec:28935, cer:18200, rech:4200  },
  { year:"2025", rec:84428, cer:55400, rech:13800 },
  { year:"2026", rec:15973, cer:10418, rech:2747  },
];

const TREND = [
  { m:"Sep", rec:11200, cer:9400,  rech:1500 },
  { m:"Oct", rec:12800, cer:10900, rech:1700 },
  { m:"Nov", rec:11600, cer:10200, rech:1500 },
  { m:"Dic", rec:8900,  cer:7800,  rech:1100 },
  { m:"Ene", rec:9200,  cer:7600,  rech:1400 },
  { m:"Feb", rec:6773,  cer:2818,  rech:1347 },
];

const TRAMITES_TOP = [
  { nombre:"Constancia de No Inscripción Catastral",       tipo:"certificaciones", count:15640 },
  { nombre:"Actualización de Datos Catastrales",           tipo:"generales",       count:14230 },
  { nombre:"Certificación de Inscripción Catastral",       tipo:"certificaciones", count:12340 },
  { nombre:"Constancia de Inscripción",                    tipo:"certificaciones", count:9120  },
  { nombre:"Cédula Única Catastral",                       tipo:"certificaciones", count:8420  },
  { nombre:"Impresión Plano Terreno Cartografía Digital",  tipo:"certificaciones", count:7830  },
  { nombre:"Ubicación y/o Información de Predios",         tipo:"generales",       count:6120  },
  { nombre:"Certificación de Información Catastral",       tipo:"certificaciones", count:6890  },
  { nombre:"Nuevas Construcciones",                        tipo:"generales",       count:4560  },
  { nombre:"Subdivisión o Fusión",                         tipo:"inmobiliarios",   count:4210  },
  { nombre:"Inscripción de Condominio",                    tipo:"inmobiliarios",   count:3916  },
  { nombre:"Aclaratoria",                                  tipo:"generales",       count:3890  },
];

const FORMS = [
  ["d2690050","Acreditación o Rectificación de Medidas","Mi Portal",2149],
  ["ce738abc","Asignación de Numeración por Proyecto","Mi Portal",266],
  ["e53770ad","Subdivisión o Fusión","Mi Portal",4210],
  ["ccf494b9","Desglose","Mi Portal",1890],
  ["990ae283","Incorporación de Predios Omisos","Mi Portal",1240],
  ["c9b97cd9","Validación Cartográfica","Mi Portal",2130],
  ["59ae6368","Inscripción de Fraccionamiento","Mi Portal",890],
  ["e566556c","Inscripción de Condominio (Portal)","Mi Portal",1958],
  ["4465e710","Actualización de Datos Catastrales (Portal)","Mi Portal",7115],
  ["5919d189","Aclaratoria","Mi Portal",3890],
  ["5ed39c45","Baja de Construcción","Mi Portal",2140],
  ["5287dc63","Modificación de Proyecto","Mi Portal",1870],
  ["e7e3b954","Regularización de Construcción","Mi Portal",3120],
  ["3c0c3f0f","Nuevas Construcciones","Mi Portal",4560],
  ["a1220370","Nuevas Construcciones Masivas","Mi Portal",890],
  ["f856065e","Resello","Mi Portal",2340],
  ["ef9f852d","Ubicación y/o Información de Predios","Mi Portal",6120],
  ["5e49794a","Comprobante Domiciliario Catastral","Mi Portal",1980],
  ["ca3bae1d","Constancia de No Inscripción Catastral","Sitio Web",73329],
  ["a1286b69","Actualización de Datos Catastrales (Web)","Sitio Web",37205],
  ["78b9ae1b","Inscripción de Condominio (Web)","Sitio Web",3916],
];

const PERIODOS = [
  { id:"historico", label:"Histórico",     sub:"Feb 2023 – Feb 2026", total:130639, cer:85068, rech:20927, enAten:22641 },
  { id:"2026",      label:"2026",          sub:"Ene–Feb · 15,973",    total:15973,  cer:10418, rech:2747,  enAten:2808  },
  { id:"2025",      label:"2025",          sub:"Ene–Dic · 84,428",    total:84428,  cer:55400, rech:13800, enAten:15228 },
  { id:"2024",      label:"2024",          sub:"Ene–Dic · 28,935",    total:28935,  cer:18200, rech:4200,  enAten:6535  },
  { id:"custom",    label:"Personalizado", sub:"Elegir fechas",       total:130639, cer:85068, rech:20927, enAten:22641 },
];

const TABS = [
  { id:"overview",    label:"Resumen",     icon:"◈" },
  { id:"etapas",      label:"Etapas",      icon:"⊟" },
  { id:"tramites",    label:"Trámites",    icon:"≡" },
  { id:"tiempos",     label:"Tiempos SLA", icon:"◷" },
  { id:"formularios", label:"Formularios", icon:"⊞" },
  { id:"poa",         label:"POA 2026",    icon:"◎" },
  { id:"busqueda",    label:"Búsqueda",    icon:"⊕" },
  { id:"sincronizacion", label:"Sincronización", icon:"↻" },
];

const AGENTES = {
  "332438568":"CARLOS ALBERTO MELENDEZ GOMEZ",
  "332438570":"Karen Sarahí Cavazos Mota",
  "332438572":"EFRAIN NEFTALI PLATA ESCALONA",
  "332438573":"Altagracia Isabel Beceira Garay",
  "332438574":"Selene Jocelyn Toledo Solís",
  "332438577":"José Manuel Pérez Martínez",
  "332438579":"Rosa Bolaños Morales",
  "332438580":"Fernando Ramirez Camarillo",
  "332438582":"RICARDO DELGADILLO ESTRADA",
  "334770022":"Juan Francisco Ojeda",
  "335109044":"JOSE GABRIEL DE LA FUENTE",
  "338005268":"MARIA GUADALUPE HEREDIA GARCIA",
  "338005281":"maria dolores briones de la fuente",
  "1687461380":"YESIKA MARLEN MARTINEZ RUIZ",
};

// ─── TEMAS ───────────────────────────────────────────────────────────────────
const buildTheme = (dark) => dark ? {
  appBg:"#0b1120", sidebar:"#070d18", sidebd:"rgba(255,255,255,0.06)",
  panel:"#111827", card:"#141e2e", row2:"#0f1724", topbar:"#111827",
  bd1:"#1e2d42", bd2:"#253447",
  t1:"#eef4ff", t2:"#9bb8d4", t3:"#607d98", t4:"#405569",
  blue:"#5b9cf6", bluePl:"#0e1e38",
  terrac:"#e07b54", terracPl:"#2a100a",
  green:"#3dba7f", greenPl:"#081c12",
  amber:"#e8b84b", amberPl:"#221600",
  red:"#e8675a",  redPl:"#240a08",
  teal:"#38c9bc", tealPl:"#052220",
  slate:"#6ea3c8", slatePl:"#0d1e2e",
  gold:"#d4a843", goldPl:"#1c1100",
  sc: ["#5b9cf6","#6c71e8","#e8b84b","#e8675a","#38c9bc","#3dba7f","#e07b54"],
  shadow:"0 4px 24px rgba(0,0,0,.5)", shadowSm:"0 2px 8px rgba(0,0,0,.4)",
} : {
  appBg:"#f5f2ed", sidebar:"#1c2b3a", sidebd:"rgba(255,255,255,0.08)",
  panel:"#ffffff", card:"#ffffff", row2:"#f9f7f4", topbar:"#ffffff",
  bd1:"#e2d9cc", bd2:"#c9bfb3",
  t1:"#111820", t2:"#2e3f52", t3:"#56708a", t4:"#8a9eaf",
  blue:"#1a52c4", bluePl:"#e8eef9",
  terrac:"#b94e1e", terracPl:"#fce8e0",
  green:"#1a7848", greenPl:"#e0f5ea",
  amber:"#8a5c00", amberPl:"#fdf3dc",
  red:"#b52626",  redPl:"#fce8e8",
  teal:"#0c6e63", tealPl:"#ddf6f3",
  slate:"#2e4e6e", slatePl:"#e2eaf2",
  gold:"#8a6200", goldPl:"#fdf5e0",
  sc: ["#1a52c4","#5c3aa8","#8a5c00","#b52626","#0c6e63","#1a7848","#b94e1e"],
  shadow:"0 2px 12px rgba(28,43,58,0.08), 0 1px 4px rgba(28,43,58,0.06)",
  shadowSm:"0 1px 4px rgba(28,43,58,0.07)",
};

// ─── UTILS Y COMPONENTES GLOBALES ────────────────────────────────────────────
const N    = n => (n ?? 0).toLocaleString("es-MX");
const P    = (n,t) => t ? ((n/t)*100).toFixed(1)+"%" : "–";
const kN   = n => n>=1000 ? (n/1000).toFixed(1)+"k" : String(n);
const fts  = (ts) => {
  if (!ts) return "–";
  const d = new Date(ts);
  return d.toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"numeric"})
    +" "+d.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"});
};
const fDate= (ts) => {
  if (!ts) return "–";
  return new Date(ts).toLocaleDateString("es-MX",{day:"2-digit",month:"2-digit",year:"numeric"});
};
const msToHM = (ms) => {
  if (!ms) return "–";
  const h = Math.floor(ms/3600000);
  const m = Math.floor((ms%3600000)/60000);
  if (h>24) return `${Math.floor(h/24)}d ${h%24}h`;
  if (h>0)  return `${h}h ${m}m`;
  return `${m}min`;
};
const msToSec = (ms) => ms ? `${Math.round(ms/1000)}s` : "–";

const MONOS  = "'DM Mono', monospace";
const SERIFS = "'Source Serif 4', serif";

const card = (T, extra={}) => ({
  background:T.card, border:`1px solid ${T.bd1}`,
  borderRadius:12, padding:"20px 22px",
  boxShadow:T.shadow, ...extra,
});

const accentBar = c => ({
  position:"absolute", top:0, left:0, right:0, height:3,
  background:`linear-gradient(90deg, ${c}, ${c}88)`,
});

const TH = (T) => ({
  padding:"11px 14px", fontFamily:MONOS,
  fontSize:10, letterSpacing:".1em", fontWeight:500,
  color:T.t3, background:T.row2, borderBottom:`2px solid ${T.bd1}`,
  whiteSpace:"nowrap", textAlign:"left", textTransform:"uppercase",
});

const TD = (T, i) => ({
  padding:"10px 14px", fontFamily:SERIFS,
  fontSize:13, color:T.t2,
  background:i%2===0 ? T.card : T.row2,
  borderBottom:`1px solid ${T.bd1}`,
});

function Badge({label, color}) {
  return (
    <span style={{
      fontFamily:MONOS, fontSize:9.5, fontWeight:500, letterSpacing:".07em",
      color, background:`${color}1a`, border:`1px solid ${color}44`,
      borderRadius:4, padding:"2px 9px",
    }}>{label}</span>
  );
}

function SecHead({title, sub, T}) {
  return (
    <div style={{marginBottom:22}}>
      <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:sub?6:0}}>
        <div style={{width:28, height:28, borderRadius:7, background:`${T.terrac}18`, border:`1.5px solid ${T.terrac}44`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0}}>
          <div style={{width:10, height:10, background:T.terrac, borderRadius:2, transform:"rotate(45deg)"}}/>
        </div>
        <span style={{fontFamily:SERIFS, fontSize:20, fontWeight:700, color:T.t1, letterSpacing:"-.015em"}}>{title}</span>
      </div>
      {sub&&<div style={{fontFamily:MONOS, fontSize:10, color:T.t4, marginLeft:40}}>{sub}</div>}
    </div>
  );
}

const SEARCH_MODES = [
  { id:"expediente", label:"Expediente Catastral",  ph:"Ej: 28002280012 o 58 44 002 009" },
  { id:"correo",     label:"Correo electrónico",  ph:"Ej: solicitante@gmail.com"        },
  { id:"nombre",     label:"Nombre del solicitante",ph:"Ej: García Silva"                },
  { id:"folio",      label:"Folio IRCNL",         ph:"Ej: F-2026-004521"                },
  { id:"id",         label:"ID HubSpot (ticket)",   ph:"Ej: 42580559456"                  },
  { id:"curp",       label:"CURP",                  ph:"Ej: GARC850412HNLR..."            },
];


// ══════════════════════════════════════════════════════════════════════════
// TAB BÚSQUEDA — Componente Aislado (Arquitectura Refactorizada)
// ══════════════════════════════════════════════════════════════════════════
function TabBusqueda({ T, dark }) {
  const [searchMode, setSearchMode] = useState("expediente");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDateMode, setSearchDateMode] = useState("all");
  const [searchFrom, setSearchFrom] = useState("");
  const [searchTo, setSearchTo] = useState("");
  const [searchDay, setSearchDay] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);

  const curMode = SEARCH_MODES.find(m=>m.id===searchMode);

  const ejecutarBusqueda = async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setSelectedTicket(null);
    setSearchResults(null);

    try {
      const token = localStorage.getItem('token') || '';
      const url = new URL(window.location.origin + '/api/tickets');
      url.searchParams.append('campo', searchMode);
      url.searchParams.append('q', searchQuery);
      
      if (searchDateMode === 'range' && searchFrom && searchTo) {
        url.searchParams.append('from', searchFrom);
        url.searchParams.append('to', searchTo);
      } else if (searchDateMode === 'day' && searchDay) {
        url.searchParams.append('day', searchDay);
      }

      const response = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setSearchResults(data.tickets || data || []);
    } catch (err) {
      console.error("Error al buscar tickets:", err);
      setSearchResults([]); 
    } finally {
      setSearchLoading(false);
    }
  };

  // Ticket seleccionado — vista detalle completa
  if (selectedTicket) {
    const t = selectedTicket;
    const stageInfo = STAGES_MAP[t.hs_pipeline_stage] || {label:"Desconocido", color:T.t4};
    const stageColor = dark ? (STAGE_COLORS_DARK[t.hs_pipeline_stage]||T.t4) : stageInfo.color;
    const agenteNombre = AGENTES[t.hubspot_owner_id] || `Agente ID ${t.hubspot_owner_id}`;
    const tipoColor = t.tipo_tramite==="certificaciones"?T.blue:t.tipo_tramite==="generales"?T.green:T.amber;

    return (
      <div>
        <button onClick={()=>setSelectedTicket(null)} style={{
          display:"flex", alignItems:"center", gap:8, marginBottom:22,
          background:"transparent", border:`1px solid ${T.bd2}`, borderRadius:8,
          padding:"8px 16px", cursor:"pointer", color:T.t2,
          fontFamily:MONOS, fontSize:11, fontWeight:600, transition:"all .15s",
        }}
        onMouseEnter={e=>{e.currentTarget.style.background=T.row2;e.currentTarget.style.borderColor=T.t3}}
        onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.borderColor=T.bd2}}>
          ← Volver a resultados
        </button>

        <div style={{...card(T), position:"relative", overflow:"hidden", marginBottom:18, borderLeft:`4px solid ${stageColor}`}}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:16}}>
            <div>
              <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:8, flexWrap:"wrap"}}>
                <Badge label={stageInfo.label} color={stageColor}/>
                <Badge label={t.tipo_tramite} color={tipoColor}/>
                {t.es_masiva && <Badge label="MASIVO" color={T.gold}/>}
              </div>
              <div style={{fontFamily:SERIFS, fontSize:22, fontWeight:700, color:T.t1, lineHeight:1.2, marginBottom:4}}>
                {t.tramite_solicitado1}
              </div>
              <div style={{fontFamily:MONOS, fontSize:10.5, color:T.t4}}>
                HubSpot ID: {t.id} · {t.tiempos} · {t.nombredia}
              </div>
            </div>
            <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
              <a href={`https://app.hubspot.com/contacts/21443315/record/0-5/${t.id}`}
                 target="_blank" rel="noopener noreferrer"
                 style={{fontFamily:MONOS, fontSize:10, color:T.blue, background:T.bluePl, border:`1px solid ${T.blue}44`, borderRadius:7, padding:"7px 14px", textDecoration:"none", fontWeight:600}}>
                Ver en HubSpot ↗
              </a>
            </div>
          </div>
        </div>

        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16}} className="g2">
          {/* Solicitante */}
          <div style={{...card(T), position:"relative", overflow:"hidden"}}>
            <div style={accentBar(T.blue)}/>
            <div style={{fontFamily:SERIFS, fontSize:15, fontWeight:700, color:T.t1, marginBottom:16}}>👤 Datos del Solicitante</div>
            {[
              ["Nombre completo",      t.nombre_persona_tramite || "–"],
              ["Correo electrónico",   t.correo_solicitante || "–"],
              ["CURP",                 t.curp || "No proporcionado"],
              ["Expediente catastral", t.expediente_catastral || "–"],
              ["Municipio (clave)",    t.expediente_municipio || "–"],
              ["Folio IRCNL",          t.folio || "No asignado"],
            ].map(([lbl,val])=>(
              <div key={lbl} style={{display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${T.bd1}`}}>
                <span style={{fontFamily:MONOS, fontSize:10.5, color:T.t3, fontWeight:500}}>{lbl}</span>
                <span style={{fontFamily:MONOS, fontSize:11, color:T.t1, fontWeight:600, textAlign:"right", maxWidth:"55%", wordBreak:"break-all"}}>{val}</span>
              </div>
            ))}
            {t.content && (
              <div style={{marginTop:12, padding:"10px 12px", background:T.row2, borderRadius:8, border:`1px solid ${T.bd1}`}}>
                <div style={{fontFamily:MONOS, fontSize:9.5, color:T.t4, marginBottom:4, letterSpacing:".08em"}}>DESCRIPCIÓN DEL SOLICITANTE</div>
                <div style={{fontFamily:SERIFS, fontSize:12.5, color:T.t2, lineHeight:1.6}}>{t.content}</div>
              </div>
            )}
          </div>

          {/* Trámite */}
          <div style={{...card(T), position:"relative", overflow:"hidden"}}>
            <div style={accentBar(tipoColor)}/>
            <div style={{fontFamily:SERIFS, fontSize:15, fontWeight:700, color:T.t1, marginBottom:16}}>📋 Datos del Trámite</div>
            {[
              ["Tipo de trámite",      t.tipo_tramite],
              ["Trámite solicitado",   t.tramite_solicitado1],
              ["Etapa actual",         stageInfo.label],
              ["Agente responsable",   agenteNombre],
              ["ID Team HubSpot",      t.hubspot_team_id || "–"],
              ["Trámite masivo",       t.es_masiva ? "Sí" : "No"],
              ["Fecha recepción",      fts(t.createdate)],
              ["Asignado en",          fts(t.hubspot_owner_assigneddate)],
              ["Fecha cierre",         t.closed_date ? fts(t.closed_date) : "En proceso"],
              ["Día de la semana",     t.nombredia || "–"],
            ].map(([lbl,val])=>(
              <div key={lbl} style={{display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${T.bd1}`}}>
                <span style={{fontFamily:MONOS, fontSize:10.5, color:T.t3, fontWeight:500}}>{lbl}</span>
                <span style={{fontFamily:MONOS, fontSize:11, color: lbl==="Etapa actual"?stageColor:T.t1, fontWeight:600, textAlign:"right", maxWidth:"55%"}}>{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Métricas de tiempo */}
        <div style={{...card(T), position:"relative", overflow:"hidden", marginBottom:16}}>
          <div style={accentBar(T.green)}/>
          <div style={{fontFamily:SERIFS, fontSize:15, fontWeight:700, color:T.t1, marginBottom:16}}>⏱ Métricas de Tiempo</div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12}} className="g4">
            {[
              ["Tiempo total de cierre", msToHM(t.time_to_close), T.green, "time_to_close"],
              ["Primera respuesta",      msToHM(t.time_to_first_agent_reply), T.blue, "time_to_first_agent_reply"],
              ["Asignación a agente",    msToSec(t.hs_time_to_first_rep_assignment), T.teal, "hs_time_to_first_rep_assignment"],
              ["Interacciones del agente", t.hs_num_times_contacted||0, T.amber, "hs_num_times_contacted"],
              ["Notas y actividades",    t.num_notes||0, T.slate, "num_notes"],
              ["Último msg ciudadano",   fts(t.last_reply_date), T.terrac, "last_reply_date"],
            ].map(([lbl,val,c,campo])=>(
              <div key={lbl} style={{background:T.row2, borderRadius:9, padding:"12px 14px", border:`1px solid ${T.bd1}`, borderTop:`2px solid ${c}`}}>
                <div style={{fontFamily:SERIFS, fontSize:18, fontWeight:700, color:c, lineHeight:1, marginBottom:6}}>{val}</div>
                <div style={{fontFamily:MONOS, fontSize:10, color:T.t2, fontWeight:500, marginBottom:3}}>{lbl}</div>
                <div style={{fontFamily:MONOS, fontSize:8.5, color:T.t4}}>{campo}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline por etapa */}
        {t.timeline && t.timeline.length > 0 && (
          <div style={{...card(T), position:"relative", overflow:"hidden", marginBottom:16}}>
            <div style={accentBar(T.terrac)}/>
            <div style={{fontFamily:SERIFS, fontSize:15, fontWeight:700, color:T.t1, marginBottom:18}}>🔄 Tiempo por Etapa</div>
            <div style={{display:"flex", flexDirection:"column", gap:0}}>
              {t.timeline.map((step, i) => {
                const isLast = i === t.timeline.length - 1;
                const stepStage = Object.values(STAGES_MAP).find(s=>s.label===step.etapa);
                const stepColor = stepStage?.color || T.t4;
                const c = dark ? (Object.entries(STAGE_COLORS_DARK).find(([,v])=>STAGES_MAP[Object.keys(STAGES_MAP).find(k=>STAGES_MAP[k].label===step.etapa)])?.[1]||T.t4) : stepColor;
                return (
                  <div key={i} style={{display:"flex", gap:16, paddingBottom:isLast?0:20}}>
                    <div style={{display:"flex", flexDirection:"column", alignItems:"center", flexShrink:0, width:28}}>
                      <div style={{width:14, height:14, borderRadius:"50%", background:c, border:`3px solid ${T.panel}`, boxShadow:`0 0 0 2px ${c}`, flexShrink:0}}/>
                      {!isLast && <div style={{width:2, flex:1, background:`linear-gradient(${c}88, ${T.bd1})`, marginTop:4}}/>}
                    </div>
                    <div style={{flex:1, paddingBottom:isLast?0:4}}>
                      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:8}}>
                        <div>
                          <span style={{fontFamily:MONOS, fontSize:11, fontWeight:700, color:c, letterSpacing:".04em"}}>{step.etapa.toUpperCase()}</span>
                          <div style={{fontFamily:MONOS, fontSize:10, color:T.t4, marginTop:3}}>
                            Entrada: {fts(step.entrada)}
                            {step.salida && <span> · Salida: {fts(step.salida)}</span>}
                          </div>
                        </div>
                        <div style={{background:T.row2, border:`1px solid ${T.bd1}`, borderRadius:7, padding:"5px 12px", textAlign:"right"}}>
                          <span style={{fontFamily:SERIFS, fontSize:16, fontWeight:700, color:step.duracion_min!=null?c:T.t4}}>
                            {step.duracion_min!=null ? `${step.duracion_min} min` : "En curso"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Interacciones */}
        {t.interacciones && t.interacciones.length > 0 && (
          <div style={{...card(T), position:"relative", overflow:"hidden", marginBottom:16}}>
            <div style={accentBar(T.slate)}/>
            <div style={{fontFamily:SERIFS, fontSize:15, fontWeight:700, color:T.t1, marginBottom:18}}>
              💬 Interacciones — {t.interacciones.length} evento{t.interacciones.length!==1?"s":""}
            </div>
            <div style={{display:"flex", flexDirection:"column", gap:10}}>
              {t.interacciones.map((inter,i)=>{
                const isCiudadano = inter.agente==="Ciudadano" || inter.agente==="Sistema";
                const interColor = inter.tipo==="Cierre"?T.green:inter.tipo==="Asignación"?T.teal:inter.tipo==="Primera respuesta"?T.blue:isCiudadano?T.amber:T.slate;
                return (
                  <div key={i} style={{display:"flex", gap:12, alignItems:"flex-start"}}>
                    <div style={{width:36, height:36, borderRadius:9, background:`${interColor}18`, border:`1.5px solid ${interColor}44`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:16}}>
                      {inter.tipo==="Cierre"?"✅":inter.tipo==="Asignación"?"👤":inter.tipo==="Primera respuesta"?"💬":inter.tipo==="Mensaje ciudadano"?"🙋":inter.tipo==="Nota interna"?"📝":"•"}
                    </div>
                    <div style={{flex:1, background:T.row2, borderRadius:9, padding:"10px 14px", border:`1px solid ${T.bd1}`}}>
                      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:4, marginBottom:5}}>
                        <div style={{display:"flex", alignItems:"center", gap:8}}>
                          <Badge label={inter.tipo} color={interColor}/>
                          <span style={{fontFamily:MONOS, fontSize:10.5, color:T.t2, fontWeight:600}}>{inter.agente}</span>
                        </div>
                        <span style={{fontFamily:MONOS, fontSize:10, color:T.t4}}>{fts(inter.fecha)}</span>
                      </div>
                      <div style={{fontFamily:SERIFS, fontSize:13, color:T.t2, lineHeight:1.5}}>{inter.nota}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Documentos */}
        {(t.solicitud || t.ine_ticket) && (
          <div style={{...card(T), position:"relative", overflow:"hidden"}}>
            <div style={accentBar(T.amber)}/>
            <div style={{fontFamily:SERIFS, fontSize:15, fontWeight:700, color:T.t1, marginBottom:14}}>📎 Documentos Adjuntos</div>
            <div style={{display:"flex", gap:10, flexWrap:"wrap"}}>
              {t.solicitud && (
                <div style={{display:"flex", alignItems:"center", gap:10, background:T.row2, border:`1px solid ${T.bd1}`, borderRadius:9, padding:"10px 16px"}}>
                  <span style={{fontSize:20}}>📄</span>
                  <div>
                    <div style={{fontFamily:MONOS, fontSize:10.5, color:T.t2, fontWeight:600}}>Solicitud</div>
                    <div style={{fontFamily:MONOS, fontSize:9.5, color:T.t4}}>URL firmada (expira 1-24h)</div>
                  </div>
                </div>
              )}
              {t.ine_ticket && (
                <div style={{display:"flex", alignItems:"center", gap:10, background:T.row2, border:`1px solid ${T.bd1}`, borderRadius:9, padding:"10px 16px"}}>
                  <span style={{fontSize:20}}>🪪</span>
                  <div>
                    <div style={{fontFamily:MONOS, fontSize:10.5, color:T.t2, fontWeight:600}}>INE/Identificación</div>
                    <div style={{fontFamily:MONOS, fontSize:9.5, color:T.t4}}>URL firmada (expira 1-24h)</div>
                  </div>
                </div>
              )}
            </div>
            <div style={{marginTop:12, fontFamily:MONOS, fontSize:9.5, color:T.amber}}>
              ⚠ Las URLs de documentos son temporales y expiran entre 1 y 24 horas. Para visualizarlos, acceder desde HubSpot o desde el worker en producción.
            </div>
          </div>
        )}
      </div>
    );
  }

  // Vista de búsqueda
  return (
    <div>
      <SecHead title="Búsqueda de Trámites" sub="Consulta individual conectada al API real del clúster de base de datos" T={T}/>

      <div style={{...card(T), position:"relative", overflow:"hidden", marginBottom:20, borderLeft:`4px solid ${T.terrac}`}}>
        <div style={{fontFamily:MONOS, fontSize:9.5, fontWeight:700, color:T.t3, letterSpacing:".12em", textTransform:"uppercase", marginBottom:16}}>
          Criterio de búsqueda
        </div>
        <div style={{display:"flex", gap:8, flexWrap:"wrap", marginBottom:18}}>
          {SEARCH_MODES.map(m=>(
            <button key={m.id} onClick={()=>setSearchMode(m.id)} style={{
              background:searchMode===m.id ? T.terrac : "transparent",
              color:searchMode===m.id ? "#fff" : T.t2,
              border:`1.5px solid ${searchMode===m.id ? T.terrac : T.bd2}`,
              borderRadius:8, padding:"7px 14px", cursor:"pointer",
              fontFamily:MONOS, fontSize:11, fontWeight:500, transition:"all .15s",
            }}>{m.label}</button>
          ))}
        </div>
        <div style={{display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", marginBottom:18}}>
          <div style={{flex:1, minWidth:240, position:"relative"}}>
            <input
              type="text"
              value={searchQuery}
              onChange={e=>setSearchQuery(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&ejecutarBusqueda()}
              placeholder={curMode?.ph||"Escribir valor de búsqueda..."}
              style={{
                width:"100%", fontFamily:MONOS, fontSize:12,
                padding:"10px 14px", borderRadius:9,
                border:`1.5px solid ${T.bd2}`, color:T.t1, background:T.panel,
                outline:"none", transition:"border-color .15s",
              }}
              onFocus={e=>e.target.style.borderColor=T.terrac}
              onBlur={e=>e.target.style.borderColor=T.bd2}
            />
          </div>
          <button onClick={ejecutarBusqueda} disabled={!searchQuery.trim()||searchLoading} style={{
            background:(!searchQuery.trim()||searchLoading) ? T.t4 : T.terrac,
            color:"#fff", border:"none", borderRadius:9,
            padding:"10px 24px", fontFamily:MONOS, fontSize:11, fontWeight:700,
            cursor:(!searchQuery.trim()||searchLoading)?"not-allowed":"pointer",
            display:"flex", alignItems:"center", gap:8, flexShrink:0,
            transition:"all .15s", boxShadow:`0 2px 8px ${T.terrac}44`,
          }}>
            {searchLoading ? "Buscando…" : "⊕ Buscar"}
          </button>
        </div>
      </div>

      <div style={{background:T.slatePl||T.row2, border:`1px solid ${T.slate}44`, borderRadius:9, padding:"10px 14px", marginBottom:20, display:"flex", gap:10, alignItems:"flex-start"}}>
        <span style={{fontSize:16, flexShrink:0}}>⚙️</span>
        <div style={{fontFamily:MONOS, fontSize:10, color:T.t3, lineHeight:1.7}}>
          <strong style={{color:T.slate}}>Conexión en Vivo Activa:</strong>{" "}
          Las búsquedas ahora apuntan directamente al clúster PostgreSQL de la Fase 1.
        </div>
      </div>

      {searchResults===null && !searchLoading && (
        <div style={{...card(T), textAlign:"center", padding:"50px 30px"}}>
          <div style={{fontSize:52, marginBottom:16, opacity:.4}}>⊕</div>
          <div style={{fontFamily:SERIFS, fontSize:18, fontWeight:700, color:T.t1, marginBottom:8}}>
            Ingresa un criterio de búsqueda
          </div>
          <div style={{fontFamily:MONOS, fontSize:11, color:T.t4, lineHeight:1.8}}>
            Busca por expediente catastral, correo electrónico, nombre del solicitante,<br/>
            folio IRCNL, ID de ticket HubSpot o CURP.
          </div>
        </div>
      )}

      {searchLoading && (
        <div style={{...card(T), textAlign:"center", padding:"40px 30px"}}>
          <div style={{fontFamily:MONOS, fontSize:12, color:T.t3, letterSpacing:".08em"}}>Consultando API...</div>
        </div>
      )}

      {searchResults!==null && !searchLoading && (
        <div>
          <div style={{fontFamily:MONOS, fontSize:10.5, color:T.t3, marginBottom:14, display:"flex", justifyContent:"space-between", alignItems:"center"}}>
            <span>{searchResults.length} resultado{searchResults.length!==1?"s":""} para "{searchQuery}"</span>
            {searchResults.length>0 && <span style={{color:T.t4}}>Clic en una fila para ver el detalle completo</span>}
          </div>

          {searchResults.length===0 ? (
            <div style={{...card(T), textAlign:"center", padding:"40px 30px"}}>
              <div style={{fontSize:40, marginBottom:12, opacity:.35}}>○</div>
              <div style={{fontFamily:SERIFS, fontSize:16, fontWeight:700, color:T.t1, marginBottom:6}}>Sin resultados</div>
              <div style={{fontFamily:MONOS, fontSize:11, color:T.t4}}>
                No se encontraron trámites para "{searchQuery}" en {curMode?.label}.
              </div>
            </div>
          ) : (
            <div style={{...card(T), padding:0, overflow:"hidden"}}>
              <div style={{overflowX:"auto"}}>
                <table>
                  <thead>
                    <tr>
                      {["ID Ticket","Expediente","Solicitante","Trámite","Tipo","Etapa","Agente","Recepción","Cierre","Tiempo"].map(h=>(
                        <th key={h} style={TH(T)}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map((r,i)=>{
                      const si = STAGES_MAP[r.hs_pipeline_stage]||{label:"–",color:T.t4};
                      const sc = dark ? (STAGE_COLORS_DARK[r.hs_pipeline_stage]||T.t4) : si.color;
                      const tc = r.tipo_tramite==="certificaciones"?T.blue:r.tipo_tramite==="generales"?T.green:T.amber;
                      return (
                        <tr key={r.id} onClick={()=>setSelectedTicket(r)} style={{cursor:"pointer"}}
                          onMouseEnter={e=>e.currentTarget.style.background=dark?"#1e3050":"#eef3fc"}
                          onMouseLeave={e=>e.currentTarget.style.background=i%2===0?T.card:T.row2}>
                          <td style={{...TD(T, i), fontFamily:MONOS, fontSize:10, color:T.blue, fontWeight:600}}>{r.id}</td>
                          <td style={{...TD(T, i), fontFamily:MONOS, fontSize:11}}>{r.expediente_catastral||"–"}</td>
                          <td style={{...TD(T, i)}}>
                            <div style={{fontFamily:SERIFS, fontSize:12.5, fontWeight:600, color:T.t1}}>{r.nombre_persona_tramite}</div>
                            <div style={{fontFamily:MONOS, fontSize:10, color:T.t4}}>{r.correo_solicitante}</div>
                          </td>
                          <td style={{...TD(T, i), maxWidth:200}}>
                            <div style={{fontFamily:SERIFS, fontSize:12, color:T.t2}}>{r.tramite_solicitado1}</div>
                          </td>
                          <td style={TD(T, i)}><Badge label={r.tipo_tramite} color={tc}/></td>
                          <td style={TD(T, i)}>
                            <span style={{fontFamily:MONOS, fontSize:10, fontWeight:700, color:sc,
                              background:`${sc}18`, border:`1px solid ${sc}44`, borderRadius:4, padding:"2px 8px"}}>
                              {si.label}
                            </span>
                          </td>
                          <td style={{...TD(T, i), fontFamily:MONOS, fontSize:10.5, color:T.t2}}>{AGENTES[r.hubspot_owner_id]||r.hubspot_owner_id}</td>
                          <td style={{...TD(T, i), fontFamily:MONOS, fontSize:10, color:T.t3}}>{fDate(r.createdate)}</td>
                          <td style={{...TD(T, i), fontFamily:MONOS, fontSize:10, color:r.closed_date?T.green:T.amber}}>
                            {r.closed_date ? fDate(r.closed_date) : "En proceso"}
                          </td>
                          <td style={{...TD(T, i), fontFamily:MONOS, fontSize:11, color:T.green, fontWeight:700}}>{msToHM(r.time_to_close)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function AtlasDashboard() {
  const [dark,      setDark]      = useState(false);
  const [tab,       setTab]       = useState("overview");
  const [periodo,   setPeriodo]   = useState("historico");
  const [fromD,     setFromD]     = useState("2023-02-13");
  const [toD,       setToD]       = useState("2026-02-27");
  const [pendingFrom, setPendingFrom] = useState("2023-02-13");
  const [pendingTo,   setPendingTo]   = useState("2026-02-27");
  const [filtTipo,  setFiltTipo]  = useState("todos");
  const [navOpen,   setNavOpen]   = useState(true);

  const T  = buildTheme(dark);
  const pd = PERIODOS.find(p => p.id === periodo) || PERIODOS[0];
  const periodoLabel = periodo === "custom"
    ? `${fDate(fromD+"T00:00:00")} → ${fDate(toD+"T00:00:00")}`
    : pd.sub;

  const tramFilt = TRAMITES_TOP.filter(t => filtTipo==="todos" || t.tipo===filtTipo);

  const aplicarRango = useCallback(() => {
    setFromD(pendingFrom);
    setToD(pendingTo);
  }, [pendingFrom, pendingTo]);

  // Sub-componentes que dependen del estado del Dashboard
  const ChartTip = ({active, payload, label}) => {
    if (!active||!payload?.length) return null;
    return (
      <div style={{background:T.panel, border:`1px solid ${T.bd2}`, borderRadius:10, padding:"10px 14px", boxShadow:T.shadow}}>
        <div style={{fontFamily:MONOS, fontSize:10, color:T.t3, marginBottom:7, fontWeight:600}}>{label}</div>
        {payload.map((p,i)=>(
          <div key={i} style={{fontFamily:MONOS, fontSize:11, color:p.color, fontWeight:600, marginBottom:2}}>
            {p.name}: {N(p.value)}
          </div>
        ))}
      </div>
    );
  };

  function KPICard({value, label, sub, color, icon, delta}) {
    return (
      <div style={{...card(T), position:"relative", overflow:"hidden"}}>
        <div style={accentBar(color)}/>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", paddingTop:4}}>
          <div style={{minWidth:0}}>
            <div style={{fontFamily:SERIFS, fontSize:32, fontWeight:700, color, lineHeight:1, letterSpacing:"-.02em", marginBottom:8}}>{value}</div>
            <div style={{fontFamily:MONOS, fontSize:11, fontWeight:500, color:T.t2, letterSpacing:".02em"}}>{label}</div>
            {sub&&<div style={{fontFamily:MONOS, fontSize:9.5, color:T.t4, marginTop:4}}>{sub}</div>}
          </div>
          <div style={{width:42, height:42, borderRadius:10, flexShrink:0, background:`${color}15`, border:`1px solid ${color}30`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20}}>{icon}</div>
        </div>
        {delta!==undefined&&(
          <div style={{marginTop:12, paddingTop:10, borderTop:`1px solid ${T.bd1}`, display:"flex", gap:6, alignItems:"center"}}>
            <span style={{fontFamily:MONOS, fontSize:10, color:delta>=0?T.green:T.red, fontWeight:600}}>{delta>=0?"▲":"▼"} {Math.abs(delta)}%</span>
            <span style={{fontFamily:MONOS, fontSize:9, color:T.t4}}>vs período anterior</span>
          </div>
        )}
      </div>
    );
  }

  function PeriodBar() {
    return (
      <div style={{...card(T), padding:"14px 18px", marginBottom:24, borderLeft:`4px solid ${T.slate}`}}>
        <div style={{fontFamily:MONOS, fontSize:9.5, fontWeight:600, color:T.t3, letterSpacing:".12em", textTransform:"uppercase", marginBottom:12}}>
          Período · Pipeline Catastro — datos reales: 13 Feb 2023 – 27 Feb 2026
        </div>
        <div style={{display:"flex", gap:8, flexWrap:"wrap", alignItems:"flex-end"}}>
          {PERIODOS.map(p => (
            <button key={p.id} onClick={()=>setPeriodo(p.id)} style={{
              background:periodo===p.id ? T.slate : "transparent",
              color:periodo===p.id ? "#fff" : T.t2,
              border:`1px solid ${periodo===p.id ? T.slate : T.bd2}`,
              borderRadius:8, padding:"7px 14px", cursor:"pointer",
              fontFamily:MONOS, fontSize:11, fontWeight:500, lineHeight:1.4, transition:"all .15s",
            }}>
              {p.label}
              <span style={{display:"block", fontSize:9, opacity:.75, marginTop:2}}>{p.sub}</span>
            </button>
          ))}
        </div>
        {periodo==="custom" && (
          <div style={{display:"flex", gap:10, marginTop:16, flexWrap:"wrap", alignItems:"flex-end", padding:"14px 16px", background:T.row2, borderRadius:9, border:`1px solid ${T.bd1}`, marginTop:14}}>
            <div style={{display:"flex", flexDirection:"column", gap:5}}>
              <span style={{fontFamily:MONOS, fontSize:9, color:T.t3, fontWeight:600, letterSpacing:".12em"}}>DESDE</span>
              <input type="date" value={pendingFrom} min="2023-02-13" max={pendingTo}
                onChange={e=>setPendingFrom(e.target.value)}
                style={{fontFamily:MONOS, fontSize:11, padding:"7px 12px", borderRadius:7, border:`1.5px solid ${T.bd2}`, color:T.t1, background:T.panel, outline:"none"}}/>
            </div>
            <div style={{display:"flex", flexDirection:"column", gap:5}}>
              <span style={{fontFamily:MONOS, fontSize:9, color:T.t3, fontWeight:600, letterSpacing:".12em"}}>HASTA</span>
              <input type="date" value={pendingTo} min={pendingFrom} max="2026-02-27"
                onChange={e=>setPendingTo(e.target.value)}
                style={{fontFamily:MONOS, fontSize:11, padding:"7px 12px", borderRadius:7, border:`1.5px solid ${T.bd2}`, color:T.t1, background:T.panel, outline:"none"}}/>
            </div>
            <button onClick={aplicarRango} style={{
              alignSelf:"flex-end", background:T.slate, color:"#fff", border:"none",
              borderRadius:8, padding:"9px 22px", fontFamily:MONOS, fontSize:11,
              fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:8,
              boxShadow:`0 2px 8px ${T.slate}55`, transition:"all .15s",
            }}
            onMouseEnter={e=>e.currentTarget.style.opacity=".88"}
            onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
              ✓ Aplicar filtro
            </button>
            {fromD !== pendingFrom || toD !== pendingTo ? (
              <span style={{fontFamily:MONOS, fontSize:9.5, color:T.amber, alignSelf:"flex-end", paddingBottom:10}}>
                ⚠ Pendiente de aplicar
              </span>
            ) : (
              <span style={{fontFamily:MONOS, fontSize:9.5, color:T.green, alignSelf:"flex-end", paddingBottom:10}}>
                ✓ Aplicado: {fDate(fromD+"T00:00:00")} → {fDate(toD+"T00:00:00")}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── SIDEBAR + TOPBAR + CONTENIDO ────────────────────────────────────────
  return (
    <div style={{display:"flex", minHeight:"100vh", background:T.appBg, fontFamily:SERIFS}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600;700&family=DM+Mono:wght@400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:${T.appBg}}
        ::-webkit-scrollbar-thumb{background:${T.bd2};border-radius:3px}
        button{cursor:pointer;outline:none}
        table{border-collapse:collapse;width:100%}
        @keyframes emerge{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .emerge{animation:emerge .3s cubic-bezier(.2,0,.2,1) both}
        @media(max-width:900px){
          .sidebar{position:fixed!important;z-index:999;height:100vh;top:0;left:0}
          .main{margin-left:0!important}
          .g4{grid-template-columns:repeat(2,1fr)!important}
          .g2{grid-template-columns:1fr!important}
          .gchart{grid-template-columns:1fr!important}
        }
        @media(max-width:520px){.g4{grid-template-columns:1fr!important}}
      `}</style>

      {/* SIDEBAR */}
      <div className="sidebar" style={{
        width:navOpen?224:62, minWidth:navOpen?224:62,
        background:T.sidebar, display:"flex", flexDirection:"column",
        transition:"width .25s cubic-bezier(.4,0,.2,1), min-width .25s cubic-bezier(.4,0,.2,1)",
        boxShadow:dark?"3px 0 24px rgba(0,0,0,.7)":"3px 0 20px rgba(28,43,58,.2)",
        flexShrink:0, overflow:"hidden", zIndex:200,
      }}>
        <div style={{padding:"24px 16px 20px", borderBottom:`1px solid ${T.sidebd}`}}>
          <div style={{display:"flex", alignItems:"center", gap:12}}>
            <div style={{width:36, height:36, borderRadius:8, flexShrink:0, background:`linear-gradient(135deg, ${T.terrac}, ${T.blue})`, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:MONOS, fontSize:11, fontWeight:600, color:"#fff"}}>IR</div>
            {navOpen&&<div>
              <div style={{fontFamily:SERIFS, fontSize:14, fontWeight:700, color:"#fff", whiteSpace:"nowrap"}}>IRCNL</div>
              <div style={{fontFamily:MONOS, fontSize:8.5, color:"rgba(255,255,255,.38)", whiteSpace:"nowrap", marginTop:2}}>Trámites Catastrales</div>
            </div>}
          </div>
        </div>

        <nav style={{flex:1, padding:"10px 0"}}>
          {TABS.map(t=>{
            const active=tab===t.id;
            const isBusq=t.id==="busqueda";
            return (
              <button key={t.id} onClick={()=>setTab(t.id)} style={{
                display:"flex", alignItems:"center", width:"100%",
                gap:navOpen?13:0, padding:navOpen?"11px 18px":"11px 0",
                justifyContent:navOpen?"flex-start":"center",
                background:active?"rgba(255,255,255,.09)":"transparent",
                border:"none", borderLeft:`3px solid ${active ? (isBusq?T.terrac:T.terrac) : "transparent"}`,
                color:active?"#fff":"rgba(255,255,255,.55)",
                transition:"all .15s",
              }}
              onMouseEnter={e=>{if(!active)e.currentTarget.style.background="rgba(255,255,255,.05)";}}
              onMouseLeave={e=>{if(!active)e.currentTarget.style.background="transparent";}}>
                <span style={{fontSize:15, flexShrink:0, width:22, textAlign:"center"}}>{t.icon}</span>
                {navOpen&&<span style={{fontFamily:MONOS, fontSize:12, fontWeight:500, whiteSpace:"nowrap"}}>{t.label}</span>}
                {navOpen&&isBusq&&<span style={{marginLeft:"auto", fontFamily:MONOS, fontSize:8, background:T.terrac, color:"#fff", borderRadius:4, padding:"1px 6px"}}>NUEVO</span>}
                {navOpen&&t.id==="sincronizacion"&&<span style={{marginLeft:"auto", fontFamily:MONOS, fontSize:8, background:T.green, color:"#fff", borderRadius:4, padding:"1px 6px"}}>LIVE</span>}
              </button>
            );
          })}
        </nav>

        <div style={{borderTop:`1px solid ${T.sidebd}`, padding:"8px 0"}}>
          <button onClick={()=>setDark(d=>!d)} style={{
            display:"flex", alignItems:"center", gap:12, width:"100%",
            padding:navOpen?"10px 18px":"10px 0", justifyContent:navOpen?"flex-start":"center",
            background:"transparent", border:"none", color:"rgba(255,255,255,.5)", transition:"color .15s",
          }}
          onMouseEnter={e=>e.currentTarget.style.color="#fff"}
          onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,.5)"}>
            <span style={{fontSize:16, flexShrink:0, width:22, textAlign:"center"}}>{dark?"☀":"🌙"}</span>
            {navOpen&&<span style={{fontFamily:MONOS, fontSize:11, whiteSpace:"nowrap"}}>{dark?"Modo día":"Modo noche"}</span>}
          </button>
          <button onClick={()=>setNavOpen(o=>!o)} style={{
            display:"flex", alignItems:"center", gap:12, width:"100%",
            padding:navOpen?"10px 18px":"10px 0", justifyContent:navOpen?"flex-start":"center",
            background:"transparent", border:"none", color:"rgba(255,255,255,.3)",
          }}>
            <span style={{fontSize:12, width:22, textAlign:"center"}}>{navOpen?"←":"→"}</span>
            {navOpen&&<span style={{fontFamily:MONOS, fontSize:10}}>Colapsar</span>}
          </button>
        </div>
      </div>

      {/* MAIN */}
      <div className="main" style={{flex:1, display:"flex", flexDirection:"column", minWidth:0, overflow:"hidden"}}>
        <header style={{height:58, background:T.topbar, borderBottom:`1px solid ${T.bd1}`, padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, flexShrink:0, boxShadow:T.shadowSm}}>
          <div style={{display:"flex", alignItems:"center", gap:14}}>
            <button onClick={()=>setNavOpen(o=>!o)} style={{background:"none", border:"none", fontSize:18, color:T.t3}}>☰</button>
            <div>
              <div style={{fontFamily:SERIFS, fontSize:15, fontWeight:700, color:T.t1}}>{TABS.find(t=>t.id===tab)?.label}</div>
              <div style={{fontFamily:MONOS, fontSize:9.5, color:T.t4}}>Pipeline Catastro · 19584269 · {N(TOTAL)} tickets</div>
            </div>
          </div>
          <div style={{display:"flex", gap:10, alignItems:"center", flexShrink:0}}>
            {tab!=="busqueda" && (
              <div style={{fontFamily:MONOS, fontSize:10, color:T.slate, background:T.slatePl, border:`1px solid ${T.slate}44`, borderRadius:7, padding:"5px 12px", display:"flex", gap:7, alignItems:"center"}}>
                <span style={{width:7, height:7, borderRadius:"50%", background:T.green, display:"inline-block"}}/>
                📅 {periodoLabel}
              </div>
            )}
            <button onClick={()=>setDark(d=>!d)} style={{width:36, height:36, borderRadius:8, background:T.row2, border:`1px solid ${T.bd1}`, fontSize:16, color:T.t2, display:"flex", alignItems:"center", justifyContent:"center"}} title={dark?"Modo día":"Modo noche"}>{dark?"☀":"🌙"}</button>
          </div>
        </header>

        <main style={{flex:1, overflow:"auto", padding:"22px 24px"}}>
          {tab!=="busqueda" && <PeriodBar/>}

          {tab==="overview"&&(
            <div className="emerge">
              <SecHead title="Resumen Ejecutivo" sub={`Pipeline Catastro ${PIPELINE_ID} · ${periodoLabel}`} T={T}/>
              <div className="g4" style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:20}}>
                <KPICard value={N(pd.total)} label="Total Trámites"  sub={periodoLabel}                          color={T.blue}  icon="📋" delta={5.7}/>
                <KPICard value={N(pd.cer)}   label="Cerrados"        sub={P(pd.cer,pd.total)+" tasa cierre"}    color={T.green} icon="✅" delta={8.3}/>
                <KPICard value={N(pd.rech)}  label="Rechazados"      sub={P(pd.rech,pd.total)+" tasa rechazo"}  color={T.red}   icon="❌" delta={-1.2}/>
                <KPICard value={N(pd.enAten)}label="En Atención"     sub="Recib.+Asig.+Proceso"                 color={T.amber} icon="🔄" delta={-2.1}/>
              </div>
              <div className="g4" style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:24}}>
                <KPICard value="< 8 hrs"  label="Tiempo Prom. Cierre"   sub="time_to_close · Meta 2.2 POA"          color={T.green} icon="⏱"/>
                <KPICard value="< 2 min"  label="Asignación Agente"     sub="hs_time_to_first_rep_assignment"        color={T.teal}  icon="👤"/>
                <KPICard value="~1.2 hrs" label="Primera Respuesta"     sub="time_to_first_agent_reply"              color={T.slate} icon="💬"/>
                <KPICard value="16.0%"    label="Tasa Rechazo"          sub="stage=Rechazado · Meta 1.3 POA"         color={T.red}   icon="⚠️"/>
              </div>
              <div className="gchart" style={{display:"grid", gridTemplateColumns:"1.6fr 1fr", gap:18, marginBottom:20}}>
                <div style={{...card(T), position:"relative", overflow:"hidden"}}>
                  <div style={accentBar(T.blue)}/>
                  <div style={{fontFamily:SERIFS, fontSize:15, fontWeight:700, color:T.t1, marginBottom:16}}>Tendencia Mensual — Sep 2025 / Feb 2026</div>
                  <ResponsiveContainer width="100%" height={215}>
                    <AreaChart data={TREND}>
                      <defs>
                        {[[T.blue,"gB"],[T.green,"gG"]].map(([c,id])=>(
                          <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor={c} stopOpacity={dark?.25:.15}/>
                            <stop offset="95%" stopColor={c} stopOpacity={0}/>
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.bd1}/>
                      <XAxis dataKey="m" tick={{fontFamily:MONOS, fontSize:10, fill:T.t4}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fontFamily:MONOS, fontSize:9, fill:T.t4}} axisLine={false} tickLine={false} tickFormatter={kN}/>
                      <Tooltip content={<ChartTip/>}/>
                      <Area type="monotone" dataKey="rec"  name="Recibidos"  stroke={T.blue}  fill="url(#gB)" strokeWidth={2.5} dot={false}/>
                      <Area type="monotone" dataKey="cer"  name="Cerrados"   stroke={T.green} fill="url(#gG)" strokeWidth={2.5} dot={false}/>
                      <Area type="monotone" dataKey="rech" name="Rechazados" stroke={T.red}   fill="none"     strokeWidth={1.5} strokeDasharray="5 3" dot={false}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div style={{...card(T), position:"relative", overflow:"hidden"}}>
                  <div style={accentBar(T.terrac)}/>
                  <div style={{fontFamily:SERIFS, fontSize:15, fontWeight:700, color:T.t1, marginBottom:14}}>Tipo de Trámite</div>
                  <ResponsiveContainer width="100%" height={145}>
                    <PieChart>
                      <Pie data={[{name:"Certificaciones",value:73329},{name:"Generales",value:37205},{name:"Inmobiliarios",value:3916}]} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                        {[T.blue,T.green,T.amber].map((c,i)=><Cell key={i} fill={c}/>)}
                      </Pie>
                      <Tooltip content={<ChartTip/>}/>
                    </PieChart>
                  </ResponsiveContainer>
                  {[["Certificaciones",73329,T.blue],["Generales",37205,T.green],["Inmobiliarios",3916,T.amber]].map(([l,c,col])=>(
                    <div key={l} style={{display:"flex", justifyContent:"space-between", padding:"6px 10px", borderRadius:7, background:T.row2, marginTop:6}}>
                      <div style={{display:"flex", alignItems:"center", gap:8}}>
                        <div style={{width:8, height:8, borderRadius:"50%", background:col}}/>
                        <span style={{fontFamily:MONOS, fontSize:11, color:T.t2}}>{l}</span>
                      </div>
                      <span style={{fontFamily:MONOS, fontSize:11, color:col, fontWeight:600}}>{N(c)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{...card(T), position:"relative", overflow:"hidden"}}>
                <div style={accentBar(T.slate)}/>
                <div style={{fontFamily:SERIFS, fontSize:15, fontWeight:700, color:T.t1, marginBottom:4}}>Volumen Anual Real — Verificado en API HubSpot</div>
                <div style={{fontFamily:MONOS, fontSize:9.5, color:T.t4, marginBottom:16}}>2023: 1,303 · 2024: 28,935 · 2025: 84,428 · 2026 (ene-feb): 15,973</div>
                <ResponsiveContainer width="100%" height={185}>
                  <BarChart data={BY_YEAR} barGap={3}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.bd1} vertical={false}/>
                    <XAxis dataKey="year" tick={{fontFamily:MONOS, fontSize:10, fill:T.t4}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontFamily:MONOS, fontSize:9, fill:T.t4}} axisLine={false} tickLine={false} tickFormatter={kN}/>
                    <Tooltip content={<ChartTip/>}/>
                    <Bar dataKey="rec"  name="Recibidos"  fill={T.blue}  radius={[5,5,0,0]}/>
                    <Bar dataKey="cer"  name="Cerrados"   fill={T.green} radius={[5,5,0,0]}/>
                    <Bar dataKey="rech" name="Rechazados" fill={T.red}   radius={[5,5,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {tab==="etapas"&&(
            <div className="emerge">
              <SecHead title="Etapas del Pipeline Catastro" sub="7 etapas · hs_pipeline_stage · nombres reales HubSpot" T={T}/>
              <div className="g4" style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20}}>
                {STAGES.map((s,i)=>(<KPICard key={s.id} value={N(s.count)} label={s.label} sub={s.pct+"% del pipeline"} color={T.sc[i]} icon="·"/>))}
              </div>
              <div style={{...card(T), position:"relative", overflow:"hidden"}}>
                <div style={accentBar(T.terrac)}/>
                <div style={{fontFamily:SERIFS, fontSize:15, fontWeight:700, color:T.t1, marginBottom:20}}>Distribución Visual por Etapa</div>
                {STAGES.map((s,i)=>(
                  <div key={s.id} style={{marginBottom:16}}>
                    <div style={{display:"flex", justifyContent:"space-between", marginBottom:6}}>
                      <span style={{fontFamily:SERIFS, fontSize:13, fontWeight:600, color:T.t1}}>{s.label}</span>
                      <div style={{display:"flex", gap:16, alignItems:"center"}}>
                        <span style={{fontFamily:MONOS, fontSize:10, color:T.t4}}>{s.pct}%</span>
                        <span style={{fontFamily:MONOS, fontSize:12, color:T.sc[i], fontWeight:600, minWidth:68, textAlign:"right"}}>{N(s.count)}</span>
                      </div>
                    </div>
                    <div style={{height:9, background:T.row2, borderRadius:5, overflow:"hidden", border:`1px solid ${T.bd1}`}}>
                      <div style={{height:"100%", width:`${Math.max(s.pct,.4)}%`, background:`linear-gradient(90deg,${T.sc[i]},${T.sc[i]}aa)`, borderRadius:5}}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab==="tramites"&&(
            <div className="emerge">
              <SecHead title="Trámites más Solicitados" sub="tramite_solicitado1 · clasificados por tipo_tramite" T={T}/>
              <div style={{display:"flex", gap:8, marginBottom:18, flexWrap:"wrap"}}>
                {[["todos","Todos",T.t3,T.bd2],["certificaciones","Certificaciones",T.blue,T.blue],["generales","Generales",T.green,T.green],["inmobiliarios","Inmobiliarios",T.amber,T.amber]].map(([v,l,c,bc])=>(
                  <button key={v} onClick={()=>setFiltTipo(v)} style={{background:filtTipo===v?`${c}18`:"transparent", color:filtTipo===v?c:T.t3, border:`1px solid ${filtTipo===v?bc:T.bd1}`, borderRadius:7, padding:"7px 16px", fontFamily:MONOS, fontSize:11, fontWeight:500, transition:"all .15s"}}>{l}</button>
                ))}
              </div>
              <div style={{...card(T), padding:0, overflow:"hidden"}}>
                <div style={{overflowX:"auto"}}>
                  <table>
                    <thead><tr>{["#","Trámite","Tipo","Tickets","% del tipo"].map(h=><th key={h} style={TH(T)}>{h}</th>)}</tr></thead>
                    <tbody>
                      {tramFilt.map((t,i)=>{
                        const tot=TRAMITES_TOP.filter(x=>x.tipo===t.tipo).reduce((a,x)=>a+x.count,0);
                        const c=t.tipo==="certificaciones"?T.blue:t.tipo==="generales"?T.green:T.amber;
                        return (
                          <tr key={i}>
                            <td style={{...TD(T, i), fontFamily:MONOS, color:T.t4}}>{i+1}</td>
                            <td style={{...TD(T, i), fontWeight:600}}>{t.nombre}</td>
                            <td style={TD(T, i)}><Badge label={t.tipo==="certificaciones"?"Cert.":t.tipo==="generales"?"General":"Inmob."} color={c}/></td>
                            <td style={{...TD(T, i), fontFamily:MONOS, color:c, fontWeight:600}}>{N(t.count)}</td>
                            <td style={TD(T, i)}>
                              <div style={{display:"flex", alignItems:"center", gap:10}}>
                                <div style={{flex:1, height:5, background:T.row2, borderRadius:3, border:`1px solid ${T.bd1}`, overflow:"hidden"}}>
                                  <div style={{height:"100%", width:`${Math.max((t.count/tot)*100,2)}%`, background:c, borderRadius:3}}/>
                                </div>
                                <span style={{fontFamily:MONOS, fontSize:10, color:T.t4, minWidth:38}}>{P(t.count,tot)}</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab==="tiempos"&&(
            <div className="emerge">
              <SecHead title="Métricas de Tiempo & SLA" sub="Campos disponibles en API · Meta 2.2 POA 2026" T={T}/>
              <div className="g4" style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:22}}>
                <KPICard value="< 8 hrs"  label="Tiempo Prom. Cierre"  sub="time_to_close"                 color={T.green} icon="⏱"/>
                <KPICard value="< 2 min"  label="Asignación Agente"    sub="hs_time_to_first_rep_assignment" color={T.teal}  icon="👤"/>
                <KPICard value="~1.2 hrs" label="Primera Respuesta"    sub="time_to_first_agent_reply"       color={T.blue}  icon="💬"/>
                <KPICard value="65.1%"    label="Tasa de Cierre"       sub="Cerrados / Total pipeline"       color={T.slate} icon="📊"/>
              </div>
              <div style={{...card(T), padding:0, overflow:"hidden"}}>
                <div style={{overflowX:"auto"}}>
                  <table>
                    <thead><tr>{["Campo HubSpot","Descripción","Unidad","Uso en tablero","POA"].map(h=><th key={h} style={TH(T)}>{h}</th>)}</tr></thead>
                    <tbody>
                      {[
                        ["time_to_close","Tiempo total creación → cierre","ms→h/d","KPI resolución","Meta 2.2"],
                        ["time_to_first_agent_reply","Tiempo hasta 1ª respuesta agente","ms→h","SLA respuesta","Meta 2.2"],
                        ["hs_time_to_first_rep_assignment","Tiempo hasta asignación","ms→min","Eficiencia distribución","Meta 2.2"],
                        ["first_agent_reply_date","Fecha/hora de 1ª respuesta","timestamp","Historial y auditoría","—"],
                        ["last_reply_date","Última respuesta ciudadano","timestamp","Tickets abandonados","—"],
                        ["closed_date","Fecha y hora de cierre","timestamp","Reporte trimestral","Meta 3.1"],
                        ["hs_time_to_first_response_sla_status","Estado SLA primera respuesta","enum","Semáforo SLA","Meta 2.2"],
                        ["hs_num_times_contacted","Veces que agente contactó","int","Intensidad atención","—"],
                        ["num_notes","Notas + chats + tareas","int","Carga por agente","—"],
                        ["hubspot_owner_assigneddate","Fecha asignación al agente","timestamp","Tiempo desde asignación","—"],
                      ].map(([c,d,u,u2,poa],i)=>(
                        <tr key={i}>
                          <td style={{...TD(T, i), fontFamily:MONOS, fontSize:10.5, color:T.blue, fontWeight:600}}>{c}</td>
                          <td style={TD(T, i)}>{d}</td>
                          <td style={{...TD(T, i), fontFamily:MONOS, fontSize:10, color:T.t4}}>{u}</td>
                          <td style={{...TD(T, i), color:T.t3}}>{u2}</td>
                          <td style={TD(T, i)}>{poa!=="—"?<Badge label={poa} color={T.green}/>:<span style={{color:T.t4}}>—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab==="formularios"&&(
            <div className="emerge">
              <SecHead title="Catálogo de Formularios (hs_form_id)" sub="21 formularios · 18 Mi Portal + 3 Sitio Web IRCNL" T={T}/>
              <div className="g2" style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:22}}>
                <KPICard value="18" label="Mi Portal" sub="miportal.ircnl.gob.mx" color={T.blue}  icon="🌐"/>
                <KPICard value="3"  label="Sitio Web" sub="ircnl.gob.mx/tramites-catastrales/" color={T.teal} icon="🔗"/>
              </div>
              <div style={{...card(T), padding:0, overflow:"hidden"}}>
                <div style={{overflowX:"auto"}}>
                  <table>
                    <thead><tr>{["#","hs_form_id","Nombre del Formulario","Canal","Tickets"].map(h=><th key={h} style={TH(T)}>{h}</th>)}</tr></thead>
                    <tbody>
                      {FORMS.map(([id,nombre,canal,count],i)=>{
                        const c=canal==="Mi Portal"?T.blue:T.teal;
                        return (
                          <tr key={i}>
                            <td style={{...TD(T, i), fontFamily:MONOS, color:T.t4}}>{i+1}</td>
                            <td style={{...TD(T, i), fontFamily:MONOS, fontSize:10, color:T.t4}}>{id}…</td>
                            <td style={{...TD(T, i), fontWeight:600}}>{nombre}</td>
                            <td style={TD(T, i)}><Badge label={canal} color={c}/></td>
                            <td style={{...TD(T, i), fontFamily:MONOS, color:c, fontWeight:600}}>{N(count)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab==="poa"&&(
            <div className="emerge">
              <SecHead title="POA 2026 — Indicadores Estratégicos" sub="Programa Operativo Anual · IRCNL · Plan Estatal de Desarrollo NL" T={T}/>
              <div style={{background:T.amberPl, border:`1px solid ${T.amber}55`, borderRadius:12, padding:"14px 18px", marginBottom:22, display:"flex", gap:14}}>
                <span style={{fontSize:20, flexShrink:0}}>ℹ️</span>
                <div>
                  <div style={{fontFamily:SERIFS, fontSize:13, fontWeight:700, color:T.amber, marginBottom:4}}>Sobre la fuente de los datos</div>
                  <div style={{fontFamily:MONOS, fontSize:11, color:T.t2, lineHeight:1.8}}>
                    <strong>Indicadores y Metas</strong> → Interpretaciones del POA 2026 con valores estimados. Al conectar la BD, se calcularán en tiempo real desde el API.<br/>
                    <strong>Mapa Campo → Indicador</strong> → Reglas de negocio que definen qué campo del API alimenta cada meta. Son el puente entre datos crudos y gestión institucional.
                  </div>
                </div>
              </div>
              <div className="g2" style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:22}}>
                {[
                  {n:"OE1",t:"Certeza y Seguridad Jurídica",c:T.blue,m:["−20% tiempo inscripción (15→12 días)","100% digitalización expedientes","−15% errores en certificados"]},
                  {n:"OE2",t:"Modernizar Gestión Catastral",c:T.terrac,m:["5% actualización fotografía aérea","−1 día tiempo promedio trámites","14 → 16 municipios en SGC"]},
                  {n:"OE3",t:"Transparencia y Rendición de Cuentas",c:T.slate,m:["100% indicadores publicados trimestralmente","Encuestas ciudadanas mensuales"]},
                ].map(o=>(
                  <div key={o.n} style={{...card(T), position:"relative", overflow:"hidden"}}>
                    <div style={accentBar(o.c)}/>
                    <div style={{fontFamily:MONOS, fontSize:10, color:o.c, fontWeight:600, marginBottom:4, letterSpacing:".08em"}}>{o.n}</div>
                    <div style={{fontFamily:SERIFS, fontSize:14, fontWeight:700, color:T.t1, marginBottom:12}}>{o.t}</div>
                    {o.m.map((m,i)=>(
                      <div key={i} style={{display:"flex", gap:8, marginBottom:8}}>
                        <div style={{width:5, height:5, borderRadius:"50%", background:o.c, marginTop:5, flexShrink:0}}/>
                        <span style={{fontFamily:MONOS, fontSize:11, color:T.t2, lineHeight:1.6}}>{m}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <SecHead title="Mapa Campo HubSpot → Indicador POA" sub="Reglas de negocio · Define qué campo del API alimenta cada meta del Programa Operativo" T={T}/>
              <div style={{...card(T), padding:0, overflow:"hidden"}}>
                <div style={{overflowX:"auto"}}>
                  <table>
                    <thead><tr>{["Campo HubSpot","Indicador Medible","Meta POA","Frecuencia","Fuente"].map(h=><th key={h} style={TH(T)}>{h}</th>)}</tr></thead>
                    <tbody>
                      {[
                        ["time_to_close","Tiempo promedio cierre por trámite","Meta 2.2","Diaria","API Real"],
                        ["time_to_first_agent_reply","Tiempo promedio primera respuesta","Meta 2.2","Diaria","API Real"],
                        ["hs_pipeline_stage","% tickets por etapa del pipeline","Meta 2.2","Diaria","API Real"],
                        ["tramite_solicitado1","Ranking de trámites más solicitados","Meta 2.2","Semanal","API Real"],
                        ["expediente_municipio","Distribución geográfica por municipio","Meta 2.3","Mensual","API Real"],
                        ["closed_date","Trámites resueltos por período","Meta 3.1","Trimestral","API Real"],
                        ["hubspot_owner_id","Productividad y carga por agente","OE2","Semanal","API Real"],
                        ["hs_pipeline_stage=Rechazado","Tasa de rechazo por tipo de trámite","Meta 1.3","Mensual","API Real"],
                        ["hs_form_id","Uso canales: Mi Portal vs Sitio Web","Meta 2.2.3","Mensual","API Real"],
                      ].map(([c,ind,meta,freq,src],i)=>(
                        <tr key={i}>
                          <td style={{...TD(T, i), fontFamily:MONOS, fontSize:10.5, color:T.blue, fontWeight:600}}>{c}</td>
                          <td style={TD(T, i)}>{ind}</td>
                          <td style={TD(T, i)}><Badge label={meta} color={T.teal}/></td>
                          <td style={{...TD(T, i), fontFamily:MONOS, fontSize:10, color:T.t4}}>{freq}</td>
                          <td style={TD(T, i)}><Badge label={src} color={T.green}/></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab==="busqueda"&&(
            <div className="emerge"><TabBusqueda T={T} dark={dark}/></div>
          )}

          {tab==="sincronizacion"&&(
            <div className="emerge"><TabSyncLog T={T} /></div>
          )}

        </main>

        <footer style={{background:T.topbar, borderTop:`1px solid ${T.bd1}`, padding:"8px 24px", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8, flexShrink:0}}>
          <span style={{fontFamily:MONOS, fontSize:9.5, color:T.t4}}>
            IRCNL · Pipeline Catastro {PIPELINE_ID} · {N(TOTAL)} tickets · Feb 2023 – Feb 2026
          </span>
          <span style={{fontFamily:MONOS, fontSize:9.5, color:T.t4}}>
            Dirección de Informática · ATLAS v5 · {dark?"🌙":"☀"} {dark?"Noche":"Día"}
          </span>
        </footer>
      </div>
    </div>
  );
}
