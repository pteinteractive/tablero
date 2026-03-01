-- ─────────────────────────────────────────────────────────────────────────────
-- IRCNL ATLAS — Schema de hubspot_tickets
-- Versión: 1.1 (1 de marzo de 2026)
-- Nota: Todos los campos de texto definidos como TEXT (sin límite de longitud)
--       para compatibilidad con datos reales de HubSpot. No usar VARCHAR con
--       límites hasta conocer el máximo real de cada campo en producción.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hubspot_tickets (
  -- Identificador único de HubSpot
  id                                VARCHAR(50) PRIMARY KEY,

  -- Datos del trámite
  subject                           TEXT,
  expediente_catastral              TEXT,
  expediente_municipio              TEXT,
  folio                             TEXT,
  nombre_persona_tramite            TEXT,
  correo_solicitante                TEXT,
  curp                              TEXT,
  tramite_solicitado1               TEXT,
  tipo_tramite                      TEXT,
  es_masiva                         BOOLEAN,

  -- Pipeline HubSpot
  hs_pipeline                       TEXT,
  hs_pipeline_stage                 TEXT,

  -- Asignación
  hubspot_owner_id                  TEXT,
  hubspot_owner_assigneddate        TIMESTAMPTZ,
  hubspot_team_id                   TEXT,

  -- Fechas de ciclo de vida
  createdate                        TIMESTAMPTZ,
  closed_date                       TIMESTAMPTZ,
  first_agent_reply_date            TIMESTAMPTZ,
  last_reply_date                   TIMESTAMPTZ,
  hs_last_message_received_at       TIMESTAMPTZ,
  hs_last_message_sent_at           TIMESTAMPTZ,

  -- Tiempos de servicio (en milisegundos)
  time_to_close                     BIGINT,
  time_to_first_agent_reply         BIGINT,
  hs_time_to_first_rep_assignment   BIGINT,
  hs_time_to_first_response_sla_status TEXT,
  hs_time_to_close_sla_status       TEXT,

  -- Métricas de actividad
  hs_num_times_contacted            INTEGER,
  num_notes                         INTEGER,
  hs_form_id                        TEXT,

  -- Campos personalizados IRCNL
  tiempos                           TEXT,
  nombredia                         TEXT,
  solicitud                         TEXT,
  ine_ticket                        TEXT,
  content                           TEXT,

  -- Control de sincronización
  hs_lastmodifieddate               TIMESTAMPTZ,
  synced_at                         TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas frecuentes del dashboard
CREATE INDEX IF NOT EXISTS idx_tickets_pipeline_stage ON hubspot_tickets(hs_pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_tickets_createdate ON hubspot_tickets(createdate);
CREATE INDEX IF NOT EXISTS idx_tickets_owner ON hubspot_tickets(hubspot_owner_id);
CREATE INDEX IF NOT EXISTS idx_tickets_tipo ON hubspot_tickets(tipo_tramite);
CREATE INDEX IF NOT EXISTS idx_tickets_synced ON hubspot_tickets(synced_at);

-- Permisos
GRANT ALL ON hubspot_tickets TO usr_ircnl_prod;
