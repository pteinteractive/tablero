-- 002_migrar_datos_auth.sql
-- Sprint 1 — DT-15: Migrar datos de auth desde db_ircnl_main a db_seguridad_acceso
-- REQUIERE APROBACIÓN: Maricarmen Valdez + Javier Hernández
-- Ejecutar DESPUÉS de 001_crear_db_seguridad_acceso.sql

-- Verificar que db_seguridad_acceso existe antes de continuar
\c db_seguridad_acceso

-- Migrar roles (los hashes bcrypt existentes son compatibles con BCrypt.Net-Next — DT-03)
INSERT INTO roles (id, nombre, descripcion, permisos, creado_en)
SELECT id, nombre, descripcion, permisos, creado_en
FROM dblink('dbname=db_ircnl_main user=usr_ircnl_prod',
    'SELECT id, nombre, descripcion, permisos, creado_en FROM roles')
AS t(id int, nombre varchar, descripcion text, permisos jsonb, creado_en timestamptz)
ON CONFLICT (nombre) DO UPDATE SET
    descripcion = EXCLUDED.descripcion,
    permisos = EXCLUDED.permisos;

-- Migrar usuarios (6 existentes: javier.hernandez/ADMIN, hector.garza/josemaria.urrutia/DIRECTOR,
--                                alma.reynoso/lizeth.santillan/SUPERVISOR, patricia.deleon/CONSULTA)
INSERT INTO usuarios (id, username, nombre_completo, password_hash, rol_id, activo,
    debe_cambiar_pass, intentos_fallidos, bloqueado_hasta, ultimo_login, creado_en, modificado_en)
SELECT id, username, nombre_completo, password_hash, rol_id, activo,
    debe_cambiar_pass, intentos_fallidos, bloqueado_hasta, ultimo_login, creado_en, modificado_en
FROM dblink('dbname=db_ircnl_main user=usr_ircnl_prod',
    'SELECT id, username, nombre_completo, password_hash, rol_id, activo,
     debe_cambiar_pass, intentos_fallidos, bloqueado_hasta, ultimo_login, creado_en, modificado_en
     FROM usuarios')
AS t(id int, username varchar, nombre_completo varchar, password_hash text, rol_id int,
     activo bool, debe_cambiar_pass bool, intentos_fallidos int, bloqueado_hasta timestamptz,
     ultimo_login timestamptz, creado_en timestamptz, modificado_en timestamptz)
ON CONFLICT (username) DO NOTHING;

-- Resetear secuencias
SELECT setval('roles_id_seq', (SELECT MAX(id) FROM roles));
SELECT setval('usuarios_id_seq', (SELECT MAX(id) FROM usuarios));

-- Verificación post-migración
SELECT 'roles' AS tabla, COUNT(*) AS registros FROM roles
UNION ALL
SELECT 'usuarios', COUNT(*) FROM usuarios;

-- NOTA: Migrar sesiones y auditoria_accesos según criterio de negocio con Maricarmen.
-- Las sesiones activas de Fase 1 pueden invalidarse (usuarios harán login nuevo con JWT RS256).
