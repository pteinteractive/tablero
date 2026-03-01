/**
 * worker.js — IRCNL HubSpot Sync Worker
 * =========================================
 * Servidor: srvu-cpan03  (10.150.111.52)
 * Ruta:     /opt/api-ircnl/worker.js
 * PM2:      api-ircnl  (fork_mode)
 * Node.js:  20.20.0
 *
 * Responsabilidades:
 *  1. Carga inicial completa del pipeline catastro (19584269)
 *  2. Sync incremental cada hora 07:00-17:00 CST, L-V
 *  3. Cache clear diario 03:00 CST (registros > 7 días)
 *  4. API REST Express para el dashboard frontend
 *  5. Registro de todos los eventos en tabla sync_log (PostgreSQL)
 *
 * Variables de entorno requeridas (.env):
 *   HUBSPOT_API_KEY, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS,
 *   PORT, PIPELINE_ID, TZ
 */

'use strict';

require('dotenv').config({ path: '/opt/api-ircnl/.env' });

const express    = require('express');
const { Pool }   = require('pg');
const cron       = require('node-cron');
const axios      = require('axios');

// ─── AUTH MIDDLEWARE ─────────────────────────────────────────────────────────
const { setupRoutes: setupAuthRoutes, requireAuth } = require('./auth-middleware');

if (!process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET no definido en .env — revisa tu archivo .env');
  process.exit(1);
}

// ─── CONSTANTES ──────────────────────────────────────────────────────────────
const PIPELINE_ID   = process.env.PIPELINE_ID || '19584269';
const HUBSPOT_BASE  = 'https://api.hubapi.com';
const PAGE_SIZE     = 100;
const MAX_RETRIES   = 3;
const RETRY_DELAY   = 60000; // 60s antes de reintentar tras 429

const TICKET_PROPS = [
  'subject','expediente_catastral','expediente_municipio','folio',
  'nombre_persona_tramite','correo_solicitante','curp',
  'tramite_solicitado1','tipo_tramite','es_masiva',
  'hs_pipeline','hs_pipeline_stage',
  'hubspot_owner_id','hubspot_owner_assigneddate','hubspot_team_id',
  'createdate','closed_date','first_agent_reply_date',
  'last_reply_date','hs_last_message_received_at','hs_last_message_sent_at',
  'time_to_close','time_to_first_agent_reply','hs_time_to_first_rep_assignment',
  'hs_time_to_first_response_sla_status','hs_time_to_close_sla_status',
  'hs_num_times_contacted','num_notes',
  'hs_form_id','tiempos','nombredia','solicitud','ine_ticket','content',
  'hs_lastmodifieddate',
].join(',');

// ─── POOL PostgreSQL ─────────────────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST     || '10.150.111.53',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'db_ircnl_main',
  user:     process.env.DB_USER     || 'usr_ircnl_prod',
  password: process.env.DB_PASS,
  max:      10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: false,
});

pool.on('error', (err) => {
  console.error('[DB] Error inesperado en pool:', err.message);
});

// ─── AXIOS HUBSPOT ───────────────────────────────────────────────────────────
const hs = axios.create({
  baseURL: HUBSPOT_BASE,
  timeout: 30000,
  headers: {
    'Authorization': `Bearer ${process.env.HUBSPOT_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

// ─── LOGGER ──────────────────────────────────────────────────────────────────
function log(nivel, msg, extra = {}) {
  const ts = new Date().toISOString();
  const str = JSON.stringify({ ts, nivel, msg, ...extra });
  if (nivel === 'ERROR') console.error(str);
  else console.log(str);
}

// ─── SYNC LOG ────────────────────────────────────────────────────────────────
async function iniciarSyncLog(tipo, descripcion) {
  const res = await pool.query(
    `INSERT INTO sync_log (tipo, inicio, descripcion, servidor)
     VALUES ($1, NOW(), $2, $3) RETURNING id`,
    [tipo, descripcion, 'srvu-cpan03']
  );
  return res.rows[0].id;
}

async function cerrarSyncLog(id, datos) {
  await pool.query(
    `UPDATE sync_log SET
       fin = NOW(),
       duracion_ms = EXTRACT(EPOCH FROM (NOW() - inicio)) * 1000,
       tickets_procesados = $1,
       tickets_nuevos = $2,
       tickets_actualizados = $3,
       tickets_error = $4,
       ultimo_ticket_id = $5,
       error_detalle = $6
     WHERE id = $7`,
    [
      datos.procesados || 0,
      datos.nuevos     || 0,
      datos.actualizados || 0,
      datos.errores    || 0,
      datos.ultimoId   || null,
      datos.errorDetalle || null,
      id,
    ]
  );
}

async function marcarErrorSyncLog(id, errorMsg) {
  await pool.query(
    `UPDATE sync_log SET
       fin = NOW(),
       duracion_ms = EXTRACT(EPOCH FROM (NOW() - inicio)) * 1000,
       tipo = 'error',
       error_detalle = $1
     WHERE id = $2`,
    [errorMsg, id]
  );
}

// ─── UPSERT TICKET ───────────────────────────────────────────────────────────
async function upsertTicket(client, props) {
  const p = props;
  await client.query(
    `INSERT INTO hubspot_tickets (
       id, subject, expediente_catastral, expediente_municipio, folio,
       nombre_persona_tramite, correo_solicitante, curp,
       tramite_solicitado1, tipo_tramite, es_masiva,
       hs_pipeline, hs_pipeline_stage,
       hubspot_owner_id, hubspot_owner_assigneddate, hubspot_team_id,
       createdate, closed_date, first_agent_reply_date,
       last_reply_date, hs_last_message_received_at, hs_last_message_sent_at,
       time_to_close, time_to_first_agent_reply, hs_time_to_first_rep_assignment,
       hs_time_to_first_response_sla_status, hs_time_to_close_sla_status,
       hs_num_times_contacted, num_notes, hs_form_id,
       tiempos, nombredia, solicitud, ine_ticket, content,
       hs_lastmodifieddate, synced_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
       $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
       $31,$32,$33,$34,$35,$36, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       hs_pipeline_stage = EXCLUDED.hs_pipeline_stage,
       hubspot_owner_id = EXCLUDED.hubspot_owner_id,
       hubspot_owner_assigneddate = EXCLUDED.hubspot_owner_assigneddate,
       closed_date = EXCLUDED.closed_date,
       time_to_close = EXCLUDED.time_to_close,
       time_to_first_agent_reply = EXCLUDED.time_to_first_agent_reply,
       hs_time_to_first_rep_assignment = EXCLUDED.hs_time_to_first_rep_assignment,
       hs_num_times_contacted = EXCLUDED.hs_num_times_contacted,
       num_notes = EXCLUDED.num_notes,
       last_reply_date = EXCLUDED.last_reply_date,
       hs_last_message_sent_at = EXCLUDED.hs_last_message_sent_at,
       hs_lastmodifieddate = EXCLUDED.hs_lastmodifieddate,
       synced_at = NOW()`,
    [
      p.hs_object_id,        p.subject,                   p.expediente_catastral,
      p.expediente_municipio, p.folio,                    p.nombre_persona_tramite,
      p.correo_solicitante,  p.curp,                      p.tramite_solicitado1,
      p.tipo_tramite,        p.es_masiva === 'true',       p.hs_pipeline,
      p.hs_pipeline_stage,   p.hubspot_owner_id,           p.hubspot_owner_assigneddate || null,
      p.hubspot_team_id,     p.createdate || null,          p.closed_date || null,
      p.first_agent_reply_date || null,  p.last_reply_date || null,
      p.hs_last_message_received_at || null, p.hs_last_message_sent_at || null,
      p.time_to_close ? parseInt(p.time_to_close) : null,
      p.time_to_first_agent_reply ? parseInt(p.time_to_first_agent_reply) : null,
      p.hs_time_to_first_rep_assignment ? parseInt(p.hs_time_to_first_rep_assignment) : null,
      p.hs_time_to_first_response_sla_status || null,
      p.hs_time_to_close_sla_status || null,
      p.hs_num_times_contacted ? parseInt(p.hs_num_times_contacted) : 0,
      p.num_notes ? parseInt(p.num_notes) : 0,
      p.hs_form_id || null,
      p.tiempos || null,     p.nombredia || null,
      p.solicitud || null,   p.ine_ticket || null,  p.content || null,
      p.hs_lastmodifieddate || null,
    ]
  );
}

// ─── FETCH CON REINTENTOS ────────────────────────────────────────────────────
async function fetchTicketsPage(after = null, filterGroups = null) {
  const body = {
    filterGroups: filterGroups || [{
      filters: [{ propertyName: 'hs_pipeline', operator: 'EQ', value: PIPELINE_ID }]
    }],
    properties: TICKET_PROPS.split(','),
    limit: PAGE_SIZE,
    sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
  };
  if (after) body.after = after;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await hs.post('/crm/v3/objects/tickets/search', body);
      return res.data;
    } catch (err) {
      const status = err.response?.status;
      if (status === 429 && attempt < MAX_RETRIES) {
        log('WARN', `Rate limit (429) — esperando ${RETRY_DELAY/1000}s antes de reintento ${attempt+1}/${MAX_RETRIES}`);
        await new Promise(r => setTimeout(r, RETRY_DELAY));
        continue;
      }
      throw err;
    }
  }
}

// ─── CARGA INICIAL ───────────────────────────────────────────────────────────
async function cargaInicial() {
  const syncId = await iniciarSyncLog('carga_inicial', 'Carga inicial completa pipeline 19584269');
  log('INFO', 'Iniciando carga inicial completa por rangos mensuales...');

  let total = 0, nuevos = 0, errores = 0, ultimoId = null;
  const client = await pool.connect();

  // Rangos mensuales Feb 2023 - Mar 2026 (evita límite de 10,000 de HubSpot Search API)
  const rangos = [];
  const inicio = new Date('2023-02-01T00:00:00Z');
  const fin    = new Date('2026-03-01T00:00:00Z');
  let cursor = new Date(inicio);
  while (cursor < fin) {
    const desde = new Date(cursor);
    cursor.setMonth(cursor.getMonth() + 1);
    const hasta = new Date(Math.min(cursor.getTime(), fin.getTime()));
    rangos.push({ desde: desde.getTime(), hasta: hasta.getTime() });
  }

  log('INFO', `Procesando ${rangos.length} rangos mensuales...`);

  try {
    for (const rango of rangos) {
      const filterGroups = [{
        filters: [
          { propertyName: 'hs_pipeline', operator: 'EQ',  value: PIPELINE_ID },
          { propertyName: 'createdate',  operator: 'GTE', value: String(rango.desde) },
          { propertyName: 'createdate',  operator: 'LT',  value: String(rango.hasta) },
        ]
      }];

      let after = null;
      let rangoTotal = 0;
      const fechaLabel = new Date(rango.desde).toISOString().slice(0, 7);

      do {
        const data = await fetchTicketsPage(after, filterGroups);
        const results = data.results || [];
        if (results.length === 0) break;

        await client.query('BEGIN');
        for (const ticket of results) {
          try {
            await upsertTicket(client, ticket.properties);
            nuevos++;
            ultimoId = ticket.id;
          } catch (e) {
            errores++;
            log('ERROR', `Error upsert ticket ${ticket.id}: ${e.message}`);
            await client.query('ROLLBACK').catch(() => {});
            await client.query('BEGIN');
          }
        }
        await client.query('COMMIT');

        rangoTotal += results.length;
        total += results.length;
        after = data.paging?.next?.after || null;

      } while (after);

      if (rangoTotal > 0) {
        log('INFO', `Mes ${fechaLabel}: ${rangoTotal} tickets - Total: ${total}`);
      }
    }

    await cerrarSyncLog(syncId, { procesados: total, nuevos, actualizados: 0, errores, ultimoId });
    log('INFO', `Carga inicial completada: ${total} tickets, ${errores} errores`);

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    await marcarErrorSyncLog(syncId, err.message);
    log('ERROR', `Fallo en carga inicial: ${err.message}`);
  } finally {
    client.release();
  }
}

// ─── SYNC INCREMENTAL ────────────────────────────────────────────────────────
async function syncIncremental() {
  const ahora = new Date();
  const hora  = `${String(ahora.getHours()).padStart(2,'0')}:00`;
  const syncId = await iniciarSyncLog('incremental', `Sync hora ${hora} — iniciado`);
  log('INFO', `Iniciando sync incremental hora ${hora}…`);

  // Buscar tickets modificados en la última hora + margen de 5 min
  const desde = new Date(ahora.getTime() - (65 * 60 * 1000));

  const filterGroups = [{
    filters: [
      { propertyName: 'hs_pipeline',          operator: 'EQ',  value: PIPELINE_ID },
      { propertyName: 'hs_lastmodifieddate',   operator: 'GTE', value: desde.getTime().toString() },
    ]
  }];

  let after = null;
  let procesados = 0, nuevos = 0, actualizados = 0, errores = 0, ultimoId = null;
  const client = await pool.connect();

  try {
    do {
      const data = await fetchTicketsPage(after, filterGroups);
      const results = data.results || [];

      await client.query('BEGIN');
      for (const ticket of results) {
        try {
          // Verificar si ya existe para contar nuevos vs actualizados
          const exists = await client.query(
            'SELECT id FROM tickets WHERE id = $1', [ticket.id]
          );
          await upsertTicket(client, ticket.properties);
          if (exists.rows.length === 0) nuevos++;
          else actualizados++;
          ultimoId = ticket.id;
        } catch (e) {
          errores++;
          log('ERROR', `Sync incremental — error ticket ${ticket.id}: ${e.message}`);
        }
      }
      await client.query('COMMIT');

      procesados += results.length;
      after = data.paging?.next?.after || null;
    } while (after);

    await cerrarSyncLog(syncId, { procesados, nuevos, actualizados, errores, ultimoId });
    log('INFO', `Sync incremental hora ${hora} completado: +${nuevos} nuevos, ~${actualizados} actualizados, ${errores} errores`);

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    await marcarErrorSyncLog(syncId, err.message);
    log('ERROR', `Fallo sync incremental hora ${hora}: ${err.message}`);
  } finally {
    client.release();
  }
}

// ─── CACHE CLEAR ─────────────────────────────────────────────────────────────
async function cacheClear() {
  const syncId = await iniciarSyncLog('cache_clear', 'Cache clear nocturno — eliminando registros > 7 días');
  log('INFO', 'Iniciando cache clear nocturno…');

  try {
    // Mantener siempre los tickets activos (no cerrados/rechazados), solo purgar histórico > 7 días
    const res = await pool.query(
      `DELETE FROM tickets
       WHERE createdate < NOW() - INTERVAL '7 days'
         AND hs_pipeline_stage IN ('47916053', '224532383')
         AND synced_at < NOW() - INTERVAL '7 days'`
    );
    await cerrarSyncLog(syncId, { procesados: res.rowCount || 0, nuevos: 0, actualizados: 0, errores: 0 });
    log('INFO', `Cache clear completado: ${res.rowCount} registros eliminados`);
  } catch (err) {
    await marcarErrorSyncLog(syncId, err.message);
    log('ERROR', `Fallo cache clear: ${err.message}`);
  }
}

// ─── CRON JOBS ───────────────────────────────────────────────────────────────
// Sync incremental: cada hora de 07:00 a 17:00, lunes a viernes (CST = UTC-6)
cron.schedule('0 7-17 * * 1-5', () => {
  log('INFO', 'Cron: disparando sync incremental');
  syncIncremental().catch(e => log('ERROR', `Cron sync incremental: ${e.message}`));
}, { timezone: 'America/Monterrey' });

// Cache clear: diario a las 03:00 CST
cron.schedule('0 3 * * *', () => {
  log('INFO', 'Cron: disparando cache clear nocturno');
  cacheClear().catch(e => log('ERROR', `Cron cache clear: ${e.message}`));
}, { timezone: 'America/Monterrey' });

// Cron: limpiar sesiones expiradas cada hora
cron.schedule('0 * * * *', async () => {
  try {
    const r = await pool.query('SELECT limpiar_sesiones_expiradas()');
    const n = r.rows[0]?.limpiar_sesiones_expiradas || 0;
    if (n > 0) log('INFO', `Sesiones expiradas eliminadas: ${n}`);
  } catch (e) {
    log('ERROR', `Cron limpiar_sesiones: ${e.message}`);
  }
}, { timezone: 'America/Monterrey' });

// ─── EXPRESS API ─────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Middleware: acepta red interna + NPM (10.150.130.x) + acceso desde Internet via proxy
app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.ip || req.connection.remoteAddress || '';
  const allowed = ['10.150.111','10.150.130','127.0.0.1','::1','::ffff:127'];
  if (!allowed.some(p => ip.includes(p))) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  next();
});

// ── Rutas de autenticación (prefijo /auth — sin JWT requerido aquí) ───────────
app.use('/auth', setupAuthRoutes(pool));

// ── Proteger /api/* con JWT (excepto /api/health que es público) ──────────────
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  if (req.path === '/sync/carga-inicial') return next();
  if (req.path === '/sync/manual') return next();
  return requireAuth(pool)(req, res, next);
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', ts: new Date().toISOString(), db: 'ok' });
  } catch (e) {
    res.status(503).json({ status: 'error', db: e.message });
  }
});

// Tickets — búsqueda
app.get('/api/tickets', async (req, res) => {
  const { campo, q, desde, hasta, dia, limit = 100, offset = 0 } = req.query;

  if (!q && !desde && !hasta) {
    return res.status(400).json({ error: 'Se requiere parámetro q o desde/hasta' });
  }

  const conditions = ['hs_pipeline = $1'];
  const values = [PIPELINE_ID];
  let idx = 2;

  if (q && campo) {
    const camposPermitidos = [
      'expediente_catastral','correo_solicitante','nombre_persona_tramite',
      'folio','id','curp',
    ];
    if (!camposPermitidos.includes(campo)) {
      return res.status(400).json({ error: 'Campo de búsqueda no permitido' });
    }
    conditions.push(`${campo} ILIKE $${idx++}`);
    values.push(`%${q}%`);
  }

  if (dia) {
    conditions.push(`DATE(createdate AT TIME ZONE 'America/Monterrey') = $${idx++}`);
    values.push(dia);
  } else {
    if (desde) { conditions.push(`createdate >= $${idx++}`); values.push(desde); }
    if (hasta)  { conditions.push(`createdate <= $${idx++}`); values.push(hasta + 'T23:59:59Z'); }
  }

  values.push(parseInt(limit), parseInt(offset));

  try {
    const sql = `
      SELECT *, COUNT(*) OVER() AS total_count
      FROM tickets
      WHERE ${conditions.join(' AND ')}
      ORDER BY createdate DESC
      LIMIT $${idx++} OFFSET $${idx}
    `;
    const result = await pool.query(sql, values);
    res.json({
      total: result.rows[0]?.total_count || 0,
      results: result.rows,
    });
  } catch (e) {
    log('ERROR', `GET /api/tickets: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// Ticket individual por ID
app.get('/api/tickets/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tickets WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Ticket no encontrado' });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Sync logs
app.get('/api/sync/logs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const result = await pool.query(
      `SELECT * FROM sync_log ORDER BY inicio DESC LIMIT $1`,
      [limit]
    );
    res.json({ total: result.rowCount, logs: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Estadísticas por período
app.get('/api/stats', async (req, res) => {
  const { desde, hasta } = req.query;
  try {
    const result = await pool.query(
      `SELECT
         COUNT(*)                                                    AS total,
         COUNT(*) FILTER (WHERE hs_pipeline_stage = '47916053')     AS cerrados,
         COUNT(*) FILTER (WHERE hs_pipeline_stage = '224532383')    AS rechazados,
         COUNT(*) FILTER (WHERE tipo_tramite = 'certificaciones')   AS certificaciones,
         COUNT(*) FILTER (WHERE tipo_tramite = 'generales')         AS generales,
         COUNT(*) FILTER (WHERE tipo_tramite = 'inmobiliarias')     AS inmobiliarios,
         AVG(time_to_close)          FILTER (WHERE time_to_close IS NOT NULL)   AS avg_time_to_close,
         AVG(time_to_first_agent_reply) FILTER (WHERE time_to_first_agent_reply IS NOT NULL) AS avg_first_reply
       FROM tickets
       WHERE hs_pipeline = $1
         AND ($2::TIMESTAMPTZ IS NULL OR createdate >= $2)
         AND ($3::TIMESTAMPTZ IS NULL OR createdate <= $3)`,
      [PIPELINE_ID, desde || null, hasta ? hasta + 'T23:59:59Z' : null]
    );
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Disparar carga inicial (protegida por token)
app.post('/api/sync/carga-inicial', async (req, res) => {
  if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  res.json({ message: 'Carga inicial iniciada en background' });
  cargaInicial().catch(e => log('ERROR', `POST carga-inicial: ${e.message}`));
});

// Disparar sync manual
app.post('/api/sync/manual', async (req, res) => {
  if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  res.json({ message: 'Sync manual iniciado en background' });
  syncIncremental().catch(e => log('ERROR', `POST sync/manual: ${e.message}`));
});

// 404
app.use((req, res) => res.status(404).json({ error: 'Endpoint no encontrado' }));

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  log('INFO', `API IRCNL iniciada`, { port: PORT, pipeline: PIPELINE_ID, node: process.version });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  log('INFO', 'SIGTERM recibido, cerrando conexiones…');
  await pool.end();
  process.exit(0);
});
