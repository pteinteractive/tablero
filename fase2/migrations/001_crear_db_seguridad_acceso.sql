-- 001_crear_db_seguridad_acceso.sql
-- Sprint 1 — DT-15: Crear db_seguridad_acceso y migrar 4 tablas auth desde db_ircnl_main
-- Ejecutar como: sudo -i -u postgres psql
-- REQUIERE APROBACIÓN: Maricarmen Valdez + Javier Hernández

-- Crear base de datos de seguridad
CREATE DATABASE db_seguridad_acceso
    WITH OWNER = usr_ircnl_prod
    ENCODING = 'UTF8'
    LC_COLLATE = 'es_MX.UTF-8'
    LC_CTYPE = 'es_MX.UTF-8'
    TEMPLATE = template0;

\c db_seguridad_acceso

-- Extensiones
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tabla roles
CREATE TABLE IF NOT EXISTS roles (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(50) NOT NULL UNIQUE CHECK (nombre IN ('ADMIN', 'DIRECTOR', 'SUPERVISOR', 'CONSULTA')),
    descripcion TEXT,
    permisos    JSONB,       -- DT-14: actualizar permisos con tabs Fase 2 en S1
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabla usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id                  SERIAL PRIMARY KEY,
    username            VARCHAR(200) NOT NULL UNIQUE,  -- email
    nombre_completo     VARCHAR(300) NOT NULL,
    password_hash       TEXT NOT NULL,                  -- bcrypt (BCrypt.Net-Next compatible)
    rol_id              INT NOT NULL REFERENCES roles(id),
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    debe_cambiar_pass   BOOLEAN NOT NULL DEFAULT FALSE,
    intentos_fallidos   INT NOT NULL DEFAULT 0,
    bloqueado_hasta     TIMESTAMPTZ,
    ultimo_login        TIMESTAMPTZ,
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    modificado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_username ON usuarios(username);

-- Tabla sesiones
CREATE TABLE IF NOT EXISTS sesiones (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id  INT NOT NULL REFERENCES usuarios(id),
    token_hash  TEXT NOT NULL,
    ip_origen   INET,
    user_agent  TEXT,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expira_en   TIMESTAMPTZ NOT NULL,
    activa      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_token ON sesiones(token_hash);

-- Tabla auditoria_accesos
CREATE TABLE IF NOT EXISTS auditoria_accesos (
    id          BIGSERIAL PRIMARY KEY,
    usuario_id  INT REFERENCES usuarios(id),
    username    VARCHAR(200),
    evento      VARCHAR(100) NOT NULL,
    ip_origen   INET,
    user_agent  TEXT,
    detalle     TEXT,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_creado ON auditoria_accesos(creado_en DESC);

-- Roles base del sistema
INSERT INTO roles (nombre, descripcion, permisos) VALUES
    ('ADMIN',      'Administrador completo',       '{"todos": true}'::jsonb),
    ('DIRECTOR',   'Director con acceso completo', '{"tabs": [1,2,3,4,5,6,7,8], "exportar": true}'::jsonb),
    ('SUPERVISOR', 'Supervisor operativo',         '{"tabs": [1,2,4,5,6], "exportar": false}'::jsonb),
    ('CONSULTA',   'Solo lectura',                 '{"tabs": [1,5], "exportar": false}'::jsonb)
ON CONFLICT (nombre) DO NOTHING;

-- NOTA: Migrar datos existentes de db_ircnl_main.{roles,usuarios,sesiones,auditoria_accesos}
-- con script 002_migrar_datos_auth.sql (requiere coordinación con Maricarmen Valdez)
