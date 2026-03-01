'use strict';
/**
 * auth-middleware.js — Autenticación JWT + Roles
 * ================================================
 * Servidor : srvu-cpan03  (10.150.111.52)
 * Ruta     : /opt/api-ircnl/auth-middleware.js
 *
 * Implementa:
 *  - Login con username/password + bcrypt
 *  - JWT firmado (exp: 30 min) + tabla sesiones para revocación
 *  - 4 roles: ADMIN, DIRECTOR, SUPERVISOR, CONSULTA
 *  - Bloqueo tras 5 intentos fallidos (15 min)
 *  - Política: mínimo 12 caracteres
 *  - Auditoría completa de accesos en tabla auditoria_accesos
 *  - Cambio obligatorio de contraseña en primer login
 *  - Endpoints: POST /auth/login, POST /auth/logout,
 *               GET  /auth/me,    POST /auth/cambiar-password,
 *               GET  /auth/usuarios (solo ADMIN),
 *               POST /auth/usuarios (solo ADMIN),
 *               PUT  /auth/usuarios/:id (solo ADMIN)
 */

const express  = require('express');
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcrypt');
const crypto   = require('crypto');

const router   = express.Router();

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const JWT_SECRET        = process.env.JWT_SECRET;
const JWT_EXPIRES_IN    = '30m';
const SESSION_MINUTES   = 30;
const MAX_INTENTOS      = 5;
const BLOQUEO_MINUTOS   = 15;
const MIN_PASS_LENGTH   = 12;
const BCRYPT_ROUNDS     = 12;

// Tabs permitidos por rol (sincronizados con roles en BD)
const PERMISOS_ROL = {
  ADMIN:      { tabs: ['resumen','etapas','tramites','tiempos','formularios','poa','busqueda','sincronizacion'], gestion_usuarios: true,  ver_datos_nominativos: true,  exportar: true  },
  DIRECTOR:   { tabs: ['resumen','etapas','tramites','tiempos','formularios','poa','busqueda','sincronizacion'], gestion_usuarios: false, ver_datos_nominativos: true,  exportar: true  },
  SUPERVISOR: { tabs: ['resumen','etapas','tramites','tiempos','formularios','poa','busqueda','sincronizacion'], gestion_usuarios: false, ver_datos_nominativos: true,  exportar: false },
  CONSULTA:   { tabs: ['resumen','etapas','tramites'],                                                          gestion_usuarios: false, ver_datos_nominativos: false, exportar: false },
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.ip
    || req.connection?.remoteAddress
    || 'desconocida';
}

async function registrarAuditoria(pool, { usuario_id, username, evento, ip, userAgent, detalle }) {
  try {
    await pool.query(
      `INSERT INTO auditoria_accesos (usuario_id, username, evento, ip_origen, user_agent, detalle)
       VALUES ($1, $2, $3, $4::inet, $5, $6)`,
      [usuario_id || null, username || null, evento, ip || null, userAgent || null, detalle || null]
    );
  } catch (e) {
    // No interrumpir el flujo si falla la auditoría
    console.error('[AUTH] Error en auditoría:', e.message);
  }
}

// ─── MIDDLEWARE: verificar JWT ─────────────────────────────────────────────────
function requireAuth(pool) {
  return async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token requerido' });
    }

    const token = authHeader.substring(7);
    let payload;

    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    // Verificar que la sesión está activa en BD
    try {
      const tokenHash = hashToken(token);
      const sesion = await pool.query(
        `SELECT s.id, u.id AS usuario_id, u.username, u.activo, r.nombre AS rol, r.permisos
         FROM sesiones s
         JOIN usuarios u ON u.id = s.usuario_id
         JOIN roles    r ON r.id = u.rol_id
         WHERE s.token_hash = $1
           AND s.activa = TRUE
           AND s.expira_en > NOW()`,
        [tokenHash]
      );

      if (!sesion.rows.length) {
        return res.status(401).json({ error: 'Sesión expirada o invalidada' });
      }

      const s = sesion.rows[0];
      if (!s.activo) {
        return res.status(401).json({ error: 'Usuario desactivado' });
      }

      req.usuario = {
        id:       s.usuario_id,
        username: s.username,
        rol:      s.rol,
        permisos: s.permisos,
      };
      next();
    } catch (e) {
      console.error('[AUTH] Error verificando sesión:', e.message);
      return res.status(500).json({ error: 'Error interno de autenticación' });
    }
  };
}

// ─── MIDDLEWARE: requerir rol ──────────────────────────────────────────────────
function requireRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ error: 'No autenticado' });
    if (!roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'Permisos insuficientes', rol_requerido: roles });
    }
    next();
  };
}

// ─── ENDPOINT: POST /auth/login ───────────────────────────────────────────────
function setupRoutes(pool) {

  router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const ip        = getClientIP(req);
    const userAgent = req.headers['user-agent'] || '';

    if (!username || !password) {
      return res.status(400).json({ error: 'username y password son requeridos' });
    }

    try {
      // Buscar usuario con su rol
      const result = await pool.query(
        `SELECT u.id, u.username, u.nombre_completo, u.password_hash,
                u.activo, u.debe_cambiar_pass,
                u.intentos_fallidos, u.bloqueado_hasta,
                r.nombre AS rol, r.permisos
         FROM usuarios u
         JOIN roles r ON r.id = u.rol_id
         WHERE u.username = $1`,
        [username.toLowerCase().trim()]
      );

      const usuario = result.rows[0];

      // Usuario no existe — respuesta genérica para no revelar información
      if (!usuario) {
        await registrarAuditoria(pool, { username, evento: 'LOGIN_FAIL', ip, userAgent, detalle: 'Usuario no encontrado' });
        return res.status(401).json({ error: 'Credenciales incorrectas' });
      }

      // Usuario desactivado
      if (!usuario.activo) {
        await registrarAuditoria(pool, { usuario_id: usuario.id, username, evento: 'LOGIN_FAIL', ip, userAgent, detalle: 'Usuario desactivado' });
        return res.status(401).json({ error: 'Usuario desactivado. Contacta al administrador.' });
      }

      // Verificar bloqueo temporal
      if (usuario.bloqueado_hasta && new Date(usuario.bloqueado_hasta) > new Date()) {
        const minutos = Math.ceil((new Date(usuario.bloqueado_hasta) - new Date()) / 60000);
        await registrarAuditoria(pool, { usuario_id: usuario.id, username, evento: 'LOGIN_FAIL', ip, userAgent, detalle: 'Cuenta bloqueada temporalmente' });
        return res.status(429).json({ error: `Cuenta bloqueada. Intenta en ${minutos} minuto(s).` });
      }

      // Verificar contraseña con bcrypt
      const passwordOk = await bcrypt.compare(password, usuario.password_hash);

      if (!passwordOk) {
        const nuevosIntentos = (usuario.intentos_fallidos || 0) + 1;
        let bloqueadoHasta = null;

        if (nuevosIntentos >= MAX_INTENTOS) {
          bloqueadoHasta = new Date(Date.now() + BLOQUEO_MINUTOS * 60 * 1000);
        }

        await pool.query(
          `UPDATE usuarios SET intentos_fallidos = $1, bloqueado_hasta = $2 WHERE id = $3`,
          [nuevosIntentos, bloqueadoHasta, usuario.id]
        );

        await registrarAuditoria(pool, {
          usuario_id: usuario.id, username, evento: bloqueadoHasta ? 'BLOQUEADO' : 'LOGIN_FAIL',
          ip, userAgent,
          detalle: bloqueadoHasta ? `Bloqueado tras ${MAX_INTENTOS} intentos` : `Intento ${nuevosIntentos}/${MAX_INTENTOS}`
        });

        if (bloqueadoHasta) {
          return res.status(429).json({ error: `Demasiados intentos fallidos. Cuenta bloqueada ${BLOQUEO_MINUTOS} minutos.` });
        }
        return res.status(401).json({ error: 'Credenciales incorrectas', intentos_restantes: MAX_INTENTOS - nuevosIntentos });
      }

      // Login exitoso — resetear intentos fallidos
      await pool.query(
        `UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_login = NOW() WHERE id = $1`,
        [usuario.id]
      );

      // Generar JWT
      const token = jwt.sign(
        { sub: usuario.id, username: usuario.username, rol: usuario.rol },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      // Registrar sesión en BD
      const tokenHash  = hashToken(token);
      const expiraEn   = new Date(Date.now() + SESSION_MINUTES * 60 * 1000);

      await pool.query(
        `INSERT INTO sesiones (usuario_id, token_hash, ip_origen, user_agent, expira_en)
         VALUES ($1, $2, $3::inet, $4, $5)`,
        [usuario.id, tokenHash, ip, userAgent, expiraEn]
      );

      await registrarAuditoria(pool, { usuario_id: usuario.id, username, evento: 'LOGIN_OK', ip, userAgent });

      return res.json({
        token,
        expira_en: expiraEn.toISOString(),
        usuario: {
          id:                usuario.id,
          username:          usuario.username,
          nombre_completo:   usuario.nombre_completo,
          rol:               usuario.rol,
          permisos:          PERMISOS_ROL[usuario.rol] || {},
          debe_cambiar_pass: usuario.debe_cambiar_pass,
        },
      });

    } catch (e) {
      console.error('[AUTH] Error en login:', e.message);
      return res.status(500).json({ error: 'Error interno' });
    }
  });

  // ─── ENDPOINT: POST /auth/logout ────────────────────────────────────────────
  router.post('/logout', requireAuth(pool), async (req, res) => {
    const token    = req.headers['authorization']?.substring(7);
    const tokenHash = hashToken(token);
    const ip       = getClientIP(req);

    try {
      await pool.query(`UPDATE sesiones SET activa = FALSE WHERE token_hash = $1`, [tokenHash]);
      await registrarAuditoria(pool, {
        usuario_id: req.usuario.id,
        username:   req.usuario.username,
        evento:     'LOGOUT',
        ip,
        userAgent:  req.headers['user-agent'],
      });
      return res.json({ message: 'Sesión cerrada correctamente' });
    } catch (e) {
      return res.status(500).json({ error: 'Error al cerrar sesión' });
    }
  });

  // ─── ENDPOINT: GET /auth/me ──────────────────────────────────────────────────
  router.get('/me', requireAuth(pool), (req, res) => {
    return res.json({
      usuario: {
        ...req.usuario,
        permisos: PERMISOS_ROL[req.usuario.rol] || {},
      }
    });
  });

  // ─── ENDPOINT: POST /auth/cambiar-password ──────────────────────────────────
  router.post('/cambiar-password', requireAuth(pool), async (req, res) => {
    const { password_actual, password_nuevo } = req.body;

    if (!password_actual || !password_nuevo) {
      return res.status(400).json({ error: 'password_actual y password_nuevo son requeridos' });
    }
    if (password_nuevo.length < MIN_PASS_LENGTH) {
      return res.status(400).json({ error: `La contraseña debe tener mínimo ${MIN_PASS_LENGTH} caracteres` });
    }
    if (password_nuevo === password_actual) {
      return res.status(400).json({ error: 'La nueva contraseña debe ser diferente a la actual' });
    }

    try {
      const result = await pool.query(
        `SELECT password_hash FROM usuarios WHERE id = $1`, [req.usuario.id]
      );
      const usuario = result.rows[0];
      if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

      const ok = await bcrypt.compare(password_actual, usuario.password_hash);
      if (!ok) return res.status(401).json({ error: 'Contraseña actual incorrecta' });

      const nuevoHash = await bcrypt.hash(password_nuevo, BCRYPT_ROUNDS);
      await pool.query(
        `UPDATE usuarios SET password_hash = $1, debe_cambiar_pass = FALSE WHERE id = $2`,
        [nuevoHash, req.usuario.id]
      );

      // Invalidar todas las otras sesiones activas (forzar re-login en otros dispositivos)
      const tokenHash = hashToken(req.headers['authorization']?.substring(7));
      await pool.query(
        `UPDATE sesiones SET activa = FALSE WHERE usuario_id = $1 AND token_hash != $2`,
        [req.usuario.id, tokenHash]
      );

      await registrarAuditoria(pool, {
        usuario_id: req.usuario.id, username: req.usuario.username,
        evento: 'CAMBIO_PASSWORD', ip: getClientIP(req),
        userAgent: req.headers['user-agent'],
      });

      return res.json({ message: 'Contraseña actualizada correctamente' });
    } catch (e) {
      console.error('[AUTH] Error cambiando contraseña:', e.message);
      return res.status(500).json({ error: 'Error interno' });
    }
  });

  // ─── ENDPOINT: GET /auth/usuarios (solo ADMIN) ──────────────────────────────
  router.get('/usuarios', requireAuth(pool), requireRol('ADMIN'), async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT u.id, u.username, u.nombre_completo, r.nombre AS rol,
                u.activo, u.ultimo_login, u.creado_en, u.intentos_fallidos
         FROM usuarios u JOIN roles r ON r.id = u.rol_id
         ORDER BY r.nombre, u.username`
      );
      return res.json({ total: result.rowCount, usuarios: result.rows });
    } catch (e) {
      return res.status(500).json({ error: 'Error obteniendo usuarios' });
    }
  });

  // ─── ENDPOINT: POST /auth/usuarios (solo ADMIN) — crear usuario ─────────────
  router.post('/usuarios', requireAuth(pool), requireRol('ADMIN'), async (req, res) => {
    const { username, nombre_completo, rol, password_temporal } = req.body;

    if (!username || !nombre_completo || !rol) {
      return res.status(400).json({ error: 'username, nombre_completo y rol son requeridos' });
    }
    if (!['ADMIN','DIRECTOR','SUPERVISOR','CONSULTA'].includes(rol)) {
      return res.status(400).json({ error: 'Rol inválido. Opciones: ADMIN, DIRECTOR, SUPERVISOR, CONSULTA' });
    }

    const passTemp = password_temporal || 'Ircnl2026!';
    if (passTemp.length < MIN_PASS_LENGTH) {
      return res.status(400).json({ error: `La contraseña debe tener mínimo ${MIN_PASS_LENGTH} caracteres` });
    }

    try {
      const rolResult = await pool.query(`SELECT id FROM roles WHERE nombre = $1`, [rol]);
      if (!rolResult.rows.length) return res.status(400).json({ error: 'Rol no encontrado en BD' });

      const hash = await bcrypt.hash(passTemp, BCRYPT_ROUNDS);
      const nuevo = await pool.query(
        `INSERT INTO usuarios (username, nombre_completo, password_hash, rol_id, debe_cambiar_pass)
         VALUES ($1, $2, $3, $4, TRUE)
         RETURNING id, username, nombre_completo`,
        [username.toLowerCase().trim(), nombre_completo, hash, rolResult.rows[0].id]
      );

      await registrarAuditoria(pool, {
        usuario_id: req.usuario.id, username: req.usuario.username,
        evento: 'CREAR_USUARIO',
        ip: getClientIP(req),
        detalle: `Creó usuario ${username} con rol ${rol}`,
      });

      return res.status(201).json({
        message: 'Usuario creado correctamente',
        usuario: nuevo.rows[0],
        password_temporal: passTemp,
        nota: 'El usuario deberá cambiar su contraseña en el primer login',
      });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'El username ya existe' });
      console.error('[AUTH] Error creando usuario:', e.message);
      return res.status(500).json({ error: 'Error interno' });
    }
  });

  // ─── ENDPOINT: PUT /auth/usuarios/:id (solo ADMIN) — editar usuario ─────────
  router.put('/usuarios/:id', requireAuth(pool), requireRol('ADMIN'), async (req, res) => {
    const { id }   = req.params;
    const { nombre_completo, rol, activo, reset_password } = req.body;

    try {
      const updates = [];
      const values  = [];
      let idx = 1;

      if (nombre_completo !== undefined) { updates.push(`nombre_completo = $${idx++}`); values.push(nombre_completo); }
      if (activo !== undefined)          { updates.push(`activo = $${idx++}`);           values.push(activo); }

      if (rol !== undefined) {
        if (!['ADMIN','DIRECTOR','SUPERVISOR','CONSULTA'].includes(rol)) {
          return res.status(400).json({ error: 'Rol inválido' });
        }
        const rolR = await pool.query(`SELECT id FROM roles WHERE nombre = $1`, [rol]);
        if (!rolR.rows.length) return res.status(400).json({ error: 'Rol no encontrado' });
        updates.push(`rol_id = $${idx++}`); values.push(rolR.rows[0].id);
      }

      // Reset de contraseña
      if (reset_password) {
        const nuevoHash = await bcrypt.hash('Ircnl2026!', BCRYPT_ROUNDS);
        updates.push(`password_hash = $${idx++}`);      values.push(nuevoHash);
        updates.push(`debe_cambiar_pass = $${idx++}`);  values.push(true);
        updates.push(`intentos_fallidos = $${idx++}`);  values.push(0);
        updates.push(`bloqueado_hasta = $${idx++}`);    values.push(null);
      }

      if (!updates.length) return res.status(400).json({ error: 'Nada que actualizar' });

      values.push(parseInt(id));
      const result = await pool.query(
        `UPDATE usuarios SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, username`,
        values
      );

      if (!result.rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

      await registrarAuditoria(pool, {
        usuario_id: req.usuario.id, username: req.usuario.username,
        evento: 'EDITAR_USUARIO', ip: getClientIP(req),
        detalle: `Editó usuario ID ${id}`,
      });

      return res.json({
        message: 'Usuario actualizado',
        usuario: result.rows[0],
        ...(reset_password ? { password_temporal: 'Ircnl2026!', nota: 'El usuario debe cambiar la contraseña en su próximo login' } : {}),
      });
    } catch (e) {
      console.error('[AUTH] Error editando usuario:', e.message);
      return res.status(500).json({ error: 'Error interno' });
    }
  });

  // ─── ENDPOINT: GET /auth/auditoria (solo ADMIN) ─────────────────────────────
  router.get('/auditoria', requireAuth(pool), requireRol('ADMIN'), async (req, res) => {
    const limit  = Math.min(parseInt(req.query.limit)  || 100, 500);
    const offset = parseInt(req.query.offset) || 0;
    const evento = req.query.evento || null;

    try {
      const result = await pool.query(
        `SELECT id, username, evento, ip_origen, detalle, creado_en
         FROM auditoria_accesos
         WHERE ($1::text IS NULL OR evento = $1)
         ORDER BY creado_en DESC
         LIMIT $2 OFFSET $3`,
        [evento, limit, offset]
      );
      return res.json({ total: result.rowCount, registros: result.rows });
    } catch (e) {
      return res.status(500).json({ error: 'Error obteniendo auditoría' });
    }
  });

  return router;
}

module.exports = { setupRoutes, requireAuth, requireRol };
