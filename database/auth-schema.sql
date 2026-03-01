-- ═══════════════════════════════════════════════════════════════════════════
-- auth-schema.sql — Tablas de Autenticación y Autorización
-- IRCNL Sistema de Trámites Catastrales
-- Base de datos : db_ircnl_main  (srv-cpan04  10.150.111.53)
-- PostgreSQL    : 16.11
-- Aplicar como : postgres (superusuario)
-- ═══════════════════════════════════════════════════════════════════════════

-- Extensión para hashing seguro de contraseñas
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── TABLA: roles ─────────────────────────────────────────────────────────────
-- 4 roles fijos: ADMIN, DIRECTOR, SUPERVISOR, CONSULTA
CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL        PRIMARY KEY,
  nombre      VARCHAR(20)   NOT NULL UNIQUE,   -- ADMIN | DIRECTOR | SUPERVISOR | CONSULTA
  descripcion TEXT,
  permisos    JSONB         NOT NULL DEFAULT '{}',
  creado_en   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Permisos por rol (qué tabs puede ver cada uno)
INSERT INTO roles (nombre, descripcion, permisos) VALUES
  ('ADMIN',
   'Acceso total al dashboard y gestión de usuarios',
   '{
     "tabs": ["resumen","etapas","tramites","tiempos","formularios","poa","busqueda","sincronizacion"],
     "gestion_usuarios": true,
     "ver_datos_nominativos": true,
     "exportar": true
   }'::jsonb
  ),
  ('DIRECTOR',
   'Lectura completa de todos los tabs, sin gestión de usuarios',
   '{
     "tabs": ["resumen","etapas","tramites","tiempos","formularios","poa","busqueda","sincronizacion"],
     "gestion_usuarios": false,
     "ver_datos_nominativos": true,
     "exportar": true
   }'::jsonb
  ),
  ('SUPERVISOR',
   'Todos los tabs excepto gestión de usuarios',
   '{
     "tabs": ["resumen","etapas","tramites","tiempos","formularios","poa","busqueda","sincronizacion"],
     "gestion_usuarios": false,
     "ver_datos_nominativos": true,
     "exportar": false
   }'::jsonb
  ),
  ('CONSULTA',
   'Solo tabs de resumen, etapas y trámites — sin datos nominativos ni búsqueda',
   '{
     "tabs": ["resumen","etapas","tramites"],
     "gestion_usuarios": false,
     "ver_datos_nominativos": false,
     "exportar": false
   }'::jsonb
  )
ON CONFLICT (nombre) DO UPDATE SET
  descripcion = EXCLUDED.descripcion,
  permisos    = EXCLUDED.permisos;

-- ─── TABLA: usuarios ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id                  SERIAL        PRIMARY KEY,
  username            VARCHAR(100)  NOT NULL UNIQUE,  -- correo institucional
  nombre_completo     TEXT          NOT NULL,
  password_hash       TEXT          NOT NULL,          -- bcrypt via pgcrypto
  rol_id              INTEGER       NOT NULL REFERENCES roles(id),
  activo              BOOLEAN       NOT NULL DEFAULT TRUE,
  debe_cambiar_pass   BOOLEAN       NOT NULL DEFAULT TRUE,  -- forzar cambio en primer login
  intentos_fallidos   INTEGER       NOT NULL DEFAULT 0,
  bloqueado_hasta     TIMESTAMPTZ,                         -- bloqueo temporal tras 5 intentos
  ultimo_login        TIMESTAMPTZ,
  creado_en           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  modificado_en       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── TABLA: sesiones ──────────────────────────────────────────────────────────
-- JWT stateless + tabla de sesiones activas para invalidación inmediata
CREATE TABLE IF NOT EXISTS sesiones (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    INTEGER       NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash    TEXT          NOT NULL UNIQUE,   -- SHA-256 del JWT para revocación
  ip_origen     INET,
  user_agent    TEXT,
  creado_en     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  expira_en     TIMESTAMPTZ   NOT NULL,           -- NOW() + 30 minutos
  activa        BOOLEAN       NOT NULL DEFAULT TRUE
);

-- ─── TABLA: auditoria_accesos ─────────────────────────────────────────────────
-- Registro completo: quién entró, cuándo, desde dónde, qué hizo
CREATE TABLE IF NOT EXISTS auditoria_accesos (
  id            SERIAL        PRIMARY KEY,
  usuario_id    INTEGER       REFERENCES usuarios(id),
  username      VARCHAR(100),                    -- guardar aunque el usuario se elimine
  evento        VARCHAR(30)   NOT NULL,          -- LOGIN_OK | LOGIN_FAIL | LOGOUT | BLOQUEADO
  ip_origen     INET,
  user_agent    TEXT,
  detalle       TEXT,                            -- mensaje adicional si aplica
  creado_en     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── ÍNDICES ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_usuarios_username    ON usuarios(username);
CREATE INDEX IF NOT EXISTS idx_usuarios_activo      ON usuarios(activo);
CREATE INDEX IF NOT EXISTS idx_sesiones_usuario     ON sesiones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_expira      ON sesiones(expira_en);
CREATE INDEX IF NOT EXISTS idx_sesiones_token       ON sesiones(token_hash);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario    ON auditoria_accesos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_evento     ON auditoria_accesos(evento);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha      ON auditoria_accesos(creado_en DESC);

-- ─── FUNCIÓN: limpiar sesiones expiradas ──────────────────────────────────────
CREATE OR REPLACE FUNCTION limpiar_sesiones_expiradas()
RETURNS INTEGER AS $$
DECLARE
  eliminadas INTEGER;
BEGIN
  DELETE FROM sesiones WHERE expira_en < NOW() OR activa = FALSE;
  GET DIAGNOSTICS eliminadas = ROW_COUNT;
  RETURN eliminadas;
END;
$$ LANGUAGE plpgsql;

-- ─── FUNCIÓN: actualizar modificado_en automáticamente ───────────────────────
CREATE OR REPLACE FUNCTION set_modificado_en()
RETURNS TRIGGER AS $$
BEGIN
  NEW.modificado_en = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_usuarios_modificado ON usuarios;
CREATE TRIGGER trg_usuarios_modificado
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION set_modificado_en();

-- ─── PERMISOS para usr_ircnl_prod ─────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON usuarios             TO usr_ircnl_prod;
GRANT SELECT                  ON roles                TO usr_ircnl_prod;
GRANT SELECT, INSERT, UPDATE  ON sesiones             TO usr_ircnl_prod;
GRANT SELECT, INSERT          ON auditoria_accesos    TO usr_ircnl_prod;
GRANT USAGE, SELECT           ON SEQUENCE usuarios_id_seq            TO usr_ircnl_prod;
GRANT USAGE, SELECT           ON SEQUENCE auditoria_accesos_id_seq   TO usr_ircnl_prod;

-- ─── USUARIOS INICIALES ───────────────────────────────────────────────────────
-- Contraseñas temporales: Ircnl2026! (debe cambiarse en primer login)
-- Hash generado con: SELECT crypt('Ircnl2026!', gen_salt('bf', 12));
-- debe_cambiar_pass = TRUE fuerza el cambio en el primer acceso

DO $$
DECLARE
  rol_admin      INTEGER := (SELECT id FROM roles WHERE nombre = 'ADMIN');
  rol_director   INTEGER := (SELECT id FROM roles WHERE nombre = 'DIRECTOR');
  rol_supervisor INTEGER := (SELECT id FROM roles WHERE nombre = 'SUPERVISOR');
  rol_consulta   INTEGER := (SELECT id FROM roles WHERE nombre = 'CONSULTA');
  pass_tmp       TEXT    := crypt('Ircnl2026!', gen_salt('bf', 12));
BEGIN

  INSERT INTO usuarios (username, nombre_completo, password_hash, rol_id, debe_cambiar_pass)
  VALUES
    ('javier.hernandez@ircnl.gob.mx', 'Javier Hernández Dueñas',  pass_tmp, rol_admin,      TRUE),
    ('josemaria.urrutia@ircnl.gob.mx','José María Urrutia',        pass_tmp, rol_director,   TRUE),
    ('hector.garza@ircnl.gob.mx',     'Héctor Garza',              pass_tmp, rol_director,   TRUE),
    ('alma.reynoso@ircnl.gob.mx',     'Alma Reynoso',              pass_tmp, rol_supervisor, TRUE),
    ('lizeth.santillan@ircnl.gob.mx', 'Lizeth Santillán',          pass_tmp, rol_supervisor, TRUE),
    ('patricia.deleon@ircnl.gob.mx',  'Patricia De León',          pass_tmp, rol_consulta,   TRUE)
  ON CONFLICT (username) DO NOTHING;

END $$;

-- ─── VERIFICACIÓN FINAL ───────────────────────────────────────────────────────
SELECT
  u.username,
  u.nombre_completo,
  r.nombre AS rol,
  u.activo,
  u.debe_cambiar_pass
FROM usuarios u
JOIN roles r ON r.id = u.rol_id
ORDER BY r.nombre, u.username;
