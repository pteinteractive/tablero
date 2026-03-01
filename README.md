# IRCNL ATLAS — Sistema de Monitoreo de Trámites Catastrales

**Instituto Registral y Catastral del Estado de Nuevo León**  
**Dirección de Informática**

---

## ¿Qué es ATLAS?

Dashboard interno para monitoreo y consulta del pipeline de trámites catastrales integrado con HubSpot CRM. Permite a directivos y supervisores del IRCNL visualizar en tiempo real el estado de los 130,937 trámites registrados desde Feb 2023.

**URL de producción:** https://tablero.ircnl.gob.mx/dashboard/  
**Estado:** Fase 1 en producción — Fase 2 en diseño

---

## Arquitectura

```
Internet → NPM (10.150.130.158) → Nginx (10.150.111.50) → Node.js API (10.150.111.52)
                                                                         ↓
                                                              PostgreSQL (10.150.111.53)
```

| Servidor | IP | Rol | OS |
|----------|----|-----|----|
| srv-cpan01 | 10.150.111.50 | Gateway / archivos estáticos | AlmaLinux 10.1 |
| srv-cpan02 | 10.150.111.51 | PHP / Certificaciones | Ubuntu |
| srvu-cpan03 | 10.150.111.52 | Node.js API Worker | Ubuntu 24.04 |
| srv-cpan04 | 10.150.111.53 | PostgreSQL 16 | Ubuntu |
| NPM | 10.150.130.158 | Nginx Proxy Manager / SSL | Docker |

---

## Estructura del repositorio

```
ircnl-atlas/
├── README.md                    — Este archivo
├── DOCUMENTACION.md             — Documentación técnica completa (Fase 1)
├── .env.example                 — Variables de entorno requeridas (sin valores)
├── .gitignore                   — Excluye .env, node_modules, logs
│
├── backend/
│   ├── worker.js                — API Node.js + Express (PM2)
│   ├── auth-middleware.js       — Módulo JWT + RBAC
│   ├── ecosystem.config.js      — Configuración PM2
│   └── package.json             — Dependencias Node.js
│
├── database/
│   ├── schema.sql               — Schema completo de hubspot_tickets
│   └── auth-schema.sql          — Schema de autenticación (usuarios, roles, sesiones)
│
├── frontend/
│   ├── index.html               — Dashboard todo-en-uno (Fase 1)
│   └── src/
│       ├── ircnl-atlas-v5-produccion.jsx  — Código fuente React
│       └── TabSyncLog.jsx               — Componente sincronización
│
├── infra/
│   ├── nginx-tablero.conf       — Config Nginx srv-cpan01
│   └── robots.txt               — Anti-indexación
│
└── scripts/
    ├── deploy-ircnl-v2.sh       — Script maestro de deployment
    └── diagnose-ircnl-v5.sh     — Script de diagnóstico de infraestructura
```

---

## Inicio rápido (deploy)

```bash
# Clonar repositorio
git clone https://github.com/ircnl/atlas.git
cd atlas

# Configurar variables de entorno
cp .env.example backend/.env
nano backend/.env  # Completar con valores reales

# Deploy completo
cd scripts
./deploy-ircnl-v2.sh --step all
```

Ver `DOCUMENTACION.md` para guía completa.

---

## Seguridad

⚠️ **Este repositorio NO debe contener:**
- Archivos `.env` con credenciales reales
- Contraseñas o API keys
- Tokens JWT o HMAC secrets
- Datos de ciudadanos (tickets catastrales)

El archivo `.env` está en `.gitignore`. Usar `.env.example` como plantilla.

---

## Estado del proyecto

### Fase 1 — Completada (Feb–Mar 2026)
- ✅ Infraestructura de 5 servidores configurada
- ✅ API Node.js con autenticación JWT
- ✅ 4 roles: ADMIN, DIRECTOR, SUPERVISOR, CONSULTA
- ✅ 6 usuarios creados
- ✅ Dashboard con 8 tabs (datos parcialmente hardcodeados)
- ✅ 130,937 tickets históricos importados desde HubSpot

### Fase 2 — Pendiente
- ⬜ Dashboard con datos reales (todos los tabs)
- ⬜ Control de acceso por rol en UI
- ⬜ Búsqueda en tiempo real
- ⬜ Build con Vite (eliminar Babel standalone)
- ⬜ httpOnly cookies (reemplazar localStorage)
- ⬜ CI/CD con GitHub Actions

---

*IRCNL — Dirección de Informática — 2026*
