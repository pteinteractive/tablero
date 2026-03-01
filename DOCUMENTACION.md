# IRCNL ATLAS — Documentación Técnica Completa · Fase 1
## Instituto Registral y Catastral del Estado de Nuevo León
### Dirección de Informática · Sistema de Trámites Catastrales

**Fecha de documentación:** 1 de marzo de 2026 (actualizado)  
**Versión del sistema:** ATLAS v5.1  
**Estado:** Producción — Fase 1 completada · Carga inicial 100% exitosa  
**Propósito de este documento:** Transferencia de conocimiento completo para diseño e implementación de Fase 2

---

## ÍNDICE

1. Contexto institucional y propósito del sistema
2. Arquitectura de infraestructura actual
3. Estado de servidores y configuración
4. Sistema de autenticación implementado
5. Base de datos: esquema completo
6. Worker Node.js: API y endpoints
7. Frontend: Dashboard ATLAS v5
8. Reglas de negocio: Tab Búsqueda
9. Reglas de negocio: Tab Sincronización
10. Reglas de negocio: Todos los tabs
11. Usuarios y roles definidos
12. Seguridad implementada
13. Deuda técnica y problemas conocidos
14. Lo que NO se implementó en Fase 1
15. Requerimientos para Fase 2

---

## 1. CONTEXTO INSTITUCIONAL

**Organización:** Instituto Registral y Catastral del Estado de Nuevo León (IRCNL)  
**Área responsable:** Dirección de Informática / CIO: Javier Hernández Dueñas  
**Misión del sistema:** Monitoreo y consulta del pipeline de trámites catastrales integrado con HubSpot CRM  
**Pipeline HubSpot:** ID `19584269` — Pipeline "Catastro"  
**Volumen de datos:** 130,937 tickets importados (Feb 2023 – Feb 2026) — carga inicial completada el 1 de marzo de 2026  
**Usuarios objetivo:** 6 usuarios internos (ADMIN, DIRECTOR, SUPERVISOR, CONSULTA)  
**Clasificación de información:** Sensible — datos catastrales y personales de ciudadanos del estado de Nuevo León  
**Contexto regulatorio:** Gobierno estatal mexicano — sujeto a Ley de Transparencia y protección de datos personales

---

## 2. ARQUITECTURA DE INFRAESTRUCTURA ACTUAL

### Topología de red

```
Internet (HTTPS)
      │
      ▼
┌─────────────────────────────────────┐
│  10.150.130.158 — Nginx Proxy Manager│
│  Docker · OpenResty · Let's Encrypt  │
│  Puerto 80/443 público               │
│  Puerto 81: Panel web NPM            │
│  SSL: tablero.ircnl.gob.mx          │
└──────────────┬──────────────────────┘
               │ HTTP interno
               ▼
┌─────────────────────────────────────┐
│  10.150.111.50 — srv-cpan01         │
│  AlmaLinux 10.1 · Nginx 1.26.3      │
│  PHP 8.3.29 · Apache (inactivo)     │
│  SELinux: Enforcing                  │
│  RAM: 16GB · Disco: 95GB            │
│  Rol: Gateway web + archivos estáticos│
└──────┬───────────────┬──────────────┘
       │               │
       ▼               ▼
┌──────────────┐  ┌──────────────────────────┐
│10.150.111.51 │  │  10.150.111.52           │
│srv-cpan02    │  │  srvu-cpan03             │
│Ubuntu        │  │  Ubuntu 24.04.4 LTS      │
│Apache 2.4    │  │  Node.js v20.20.0        │
│PHP Legacy    │  │  PM2 · API IRCNL         │
│Certificaciones│  │  Puerto: 3000            │
└──────────────┘  │  RAM: ~77MB en uso       │
                  └──────────┬───────────────┘
                             │
                             ▼
                  ┌──────────────────────────┐
                  │  10.150.111.53           │
                  │  srv-cpan04              │
                  │  Ubuntu · PostgreSQL 14+ │
                  │  BD: db_ircnl_main       │
                  │  Usuario: usr_ircnl_prod │
                  └──────────────────────────┘
```

### DNS configurado
- `tablero.ircnl.gob.mx` → `201.144.147.102` (IP pública) → `10.150.130.158` (NPM)
- Certificado SSL: Let's Encrypt (gestionado por NPM)
- HTTPS forzado: SÍ

### Puertos relevantes
| Servidor | Puerto | Servicio | Exposición |
|----------|--------|----------|-----------|
| 10.150.130.158 | 80/443 | NPM | Público |
| 10.150.130.158 | 81 | Panel NPM | Solo red interna (sin SSH disponible) |
| 10.150.111.50 | 80 | Nginx | Solo red interna |
| 10.150.111.52 | 3000 | Node.js API | Solo red interna |
| 10.150.111.53 | 5432 | PostgreSQL | Solo red interna |

---

## 3. ESTADO DE SERVIDORES Y CONFIGURACIÓN

### srv-cpan01 (10.150.111.50) — Gateway Web

**SO:** AlmaLinux 10.1  
**Nginx:** 1.26.3  
**SELinux:** Enforcing — `httpd_sys_content_t` requerido para todos los archivos web  
**SFTP:** Habilitado en `/usr/libexec/openssh/sftp-server`  
**Usuario SSH:** `administrator`  

**Archivos del dashboard:**
```
/var/www/dashboard/
├── index.html          (1,847 líneas — todo-en-uno con React inline)
├── Dashboard.js        (copia del jsx — no usado actualmente)
├── Dashboard.jsx       (copia del jsx — no usado actualmente)
├── TabSyncLog.js       (copia del jsx — no usado actualmente)
├── TabSyncLog.jsx      (copia del jsx — no usado actualmente)
├── ircnl-atlas-v5-produccion.jsx (original)
└── robots.txt
```

**IMPORTANTE:** El `index.html` actual contiene TODO el código React inline (TabSyncLog + AtlasDashboard + Login + App) compilado por Babel standalone en el navegador. Los archivos .js/.jsx adicionales en `/var/www/dashboard/` NO son utilizados — el index.html es autosuficiente.

**Configuración Nginx** (`/etc/nginx/conf.d/ircnl.conf`):
```nginx
upstream api_backend { server 10.150.111.52:3000; keepalive 8; }
upstream php_backend  { server 10.150.111.51:80;  keepalive 16; }

server {
    listen 80;
    server_name tablero.ircnl.gob.mx 10.150.111.50;
    server_tokens off;

    add_header X-Content-Type-Options  "nosniff"             always;
    add_header X-Frame-Options         "SAMEORIGIN"          always;
    add_header X-XSS-Protection        "1; mode=block"       always;
    add_header Referrer-Policy         "strict-origin"       always;
    add_header X-Robots-Tag            "noindex, nofollow"   always;

    location /dashboard/ {
        alias /var/www/dashboard/;
        try_files $uri $uri/ /dashboard/index.html;
        expires 1h;
    }
    location /robots.txt { alias /var/www/dashboard/robots.txt; }
    location = /         { return 301 /dashboard/; }
    location /api/       { proxy_pass http://api_backend/api/; ... }
    location /auth/      { proxy_pass http://api_backend/auth/; ... }
    location ^~ /certificaciones/ { proxy_pass http://php_backend/certificaciones/; }
    location = /health   { return 200 "OK\n"; }
    location ~ /\.       { deny all; }
}
```

**Permisos de archivos requeridos:** `chmod 644` — SELinux bloquea archivos con permisos `600` aunque el contexto sea `httpd_sys_content_t`.

**robots.txt** (`/var/www/dashboard/robots.txt`):
```
User-agent: *
Disallow: /dashboard/
Disallow: /api/
Disallow: /auth/
```

### srvu-cpan03 (10.150.111.52) — Worker Node.js

**SO:** Ubuntu 24.04.4 LTS  
**Node.js:** v20.20.0  
**PM2:** Instalado globalmente  
**Directorio:** `/opt/api-ircnl/`  

**Procesos PM2:**
| ID | Nombre | Estado | Versión |
|----|--------|--------|---------|
| 0 | hubspot-worker | STOPPED | 1.0.0 |
| 1 | api-ircnl | ONLINE | 1.1.0 |

**IMPORTANTE:** `hubspot-worker` está DETENIDO. El worker principal `api-ircnl` es la v2 con autenticación. La sincronización incremental y el cache clear NO están activos.

**Archivos en `/opt/api-ircnl/`:**
```
worker.js           — Worker principal con API REST + Auth
auth-middleware.js  — Módulo de autenticación JWT
package.json        — v1.1.0 con bcrypt + jsonwebtoken
ecosystem.config.js — Configuración PM2
.env                — Variables de entorno (chmod 600)
node_modules/       — Dependencias instaladas
```

**Variables de entorno requeridas (`.env`):**
```bash
HUBSPOT_API_KEY=pat-na1-...
DB_HOST=10.150.111.53
DB_PORT=5432
DB_NAME=db_ircnl_main
DB_USER=usr_ircnl_prod
DB_PASS=...
PORT=3000
PIPELINE_ID=19584269
JWT_SECRET=...        # hex 64 chars
ADMIN_TOKEN=...       # hex 32 chars
JWT_EXPIRES_IN=30m
SESSION_MINUTES=30
MAX_INTENTOS_LOGIN=5
BLOQUEO_MINUTOS=15
MIN_PASSWORD_LENGTH=12
```

**PROBLEMA CONOCIDO EN WORKER:** El middleware de restricción IP fue modificado para eliminar el filtro (reemplazado por `next()` directo) porque el NPM no pasaba correctamente las IPs internas. El JWT es el único mecanismo de control de acceso activo. Esto debe corregirse en Fase 2 con una arquitectura más robusta.

### srv-cpan04 (10.150.111.53) — PostgreSQL

**BD:** `db_ircnl_main`  
**Usuario app:** `usr_ircnl_prod`  
**Tickets actuales:** ~398 (carga inicial pendiente — 130,639 históricos)  

**PROBLEMA CONOCIDO:** El usuario `usr_ircnl_prod` no tiene permisos sobre la tabla `sesiones`, causando error en el cron de limpieza de sesiones expiradas cada hora. Requiere `GRANT` adicional.

### 10.150.130.158 — Nginx Proxy Manager

**Tecnología:** Docker · OpenResty  
**Acceso SSH:** NO disponible desde red externa  
**Panel web:** Puerto 81 — solo accesible desde red interna (sin túnel SSH disponible)  
**Configuración actual:** Proxy host `tablero.ircnl.gob.mx` → `http://10.150.111.50:80`  
**SSL:** Let's Encrypt activo  
**PROBLEMA CONOCIDO:** Puerto 5432 (MySQL interno del NPM) potencialmente expuesto — verificar docker-compose.yml

---

## 4. SISTEMA DE AUTENTICACIÓN IMPLEMENTADO

### Tecnología
- **JWT** (jsonwebtoken v9.0.2) — tokens de 30 minutos
- **bcrypt** (v5.1.1, 12 rounds) — hashing de contraseñas
- **Sesiones en BD** — tabla `sesiones` con invalidación explícita

### Políticas de seguridad
| Parámetro | Valor |
|-----------|-------|
| Duración sesión | 30 minutos |
| Longitud mínima contraseña | 12 caracteres |
| Intentos fallidos antes de bloqueo | 5 |
| Duración del bloqueo | 15 minutos |
| Cambio de contraseña en primer login | Obligatorio |
| Formato de usuario | correo completo @ircnl.gob.mx |

### Endpoints de autenticación
```
POST /auth/login              → Autenticar, retorna JWT
POST /auth/logout             → Invalidar sesión
GET  /auth/me                 → Info usuario actual
POST /auth/cambiar-password   → Cambio de contraseña
GET  /auth/usuarios           → Listar usuarios (solo ADMIN)
POST /auth/usuarios           → Crear usuario (solo ADMIN)
PUT  /auth/usuarios/:id       → Editar usuario (solo ADMIN)
GET  /auth/auditoria          → Logs de acceso (solo ADMIN)
```

### Respuesta de login exitoso
```json
{
  "token": "eyJhbGci...",
  "expira_en": "2026-02-28T23:25:13.503Z",
  "usuario": {
    "id": 1,
    "username": "javier.hernandez@ircnl.gob.mx",
    "nombre_completo": "Javier Hernández Dueñas",
    "rol": "ADMIN",
    "permisos": {
      "tabs": ["resumen","etapas","tramites","tiempos","formularios","poa","busqueda","sincronizacion"],
      "gestion_usuarios": true,
      "ver_datos_nominativos": true,
      "exportar": true
    },
    "debe_cambiar_pass": true
  }
}
```

### Flujo de autenticación en frontend
1. Usuario accede a `/dashboard/` → App verifica `localStorage.ircnl_token`
2. Si hay token: `GET /auth/me` para validar sesión activa
3. Si token inválido/expirado: limpia localStorage → muestra LoginScreen
4. LoginScreen hace `POST /auth/login` → guarda token y usuario en localStorage
5. Si `debe_cambiar_pass === true` → muestra CambiarPasswordScreen
6. Si contraseña cambiada → muestra AtlasDashboard

---

## 5. BASE DE DATOS: ESQUEMA COMPLETO

### Tablas de autenticación (creadas en Fase 1)

```sql
-- Roles del sistema
CREATE TABLE roles (
  id              SERIAL PRIMARY KEY,
  nombre          VARCHAR(20) UNIQUE NOT NULL,  -- ADMIN|DIRECTOR|SUPERVISOR|CONSULTA
  descripcion     TEXT,
  permisos        JSONB NOT NULL DEFAULT '{}'
);

-- Usuarios del sistema
CREATE TABLE usuarios (
  id                    SERIAL PRIMARY KEY,
  username              VARCHAR(100) UNIQUE NOT NULL,  -- correo completo
  password_hash         VARCHAR(255) NOT NULL,          -- bcrypt 12 rounds
  nombre_completo       VARCHAR(150),
  rol_id                INTEGER REFERENCES roles(id),
  activo                BOOLEAN DEFAULT true,
  debe_cambiar_pass     BOOLEAN DEFAULT true,
  intentos_fallidos     INTEGER DEFAULT 0,
  bloqueado_hasta       TIMESTAMPTZ,
  ultimo_acceso         TIMESTAMPTZ,
  creado_en             TIMESTAMPTZ DEFAULT NOW(),
  modificado_en         TIMESTAMPTZ DEFAULT NOW()
);

-- Sesiones activas
CREATE TABLE sesiones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash    VARCHAR(64) NOT NULL,  -- SHA-256 del JWT
  ip_origen     INET,
  user_agent    TEXT,
  creado_en     TIMESTAMPTZ DEFAULT NOW(),
  expira_en     TIMESTAMPTZ NOT NULL,
  activa        BOOLEAN DEFAULT true
);

-- Auditoría de accesos
CREATE TABLE auditoria_accesos (
  id          BIGSERIAL PRIMARY KEY,
  usuario_id  INTEGER REFERENCES usuarios(id),
  evento      VARCHAR(50) NOT NULL,  -- LOGIN_OK|LOGIN_FAIL|LOGOUT|CAMBIO_PASS|etc
  ip_origen   INET,
  detalle     JSONB,
  creado_en   TIMESTAMPTZ DEFAULT NOW()
);
```

### Tablas de negocio (pre-existentes)

```sql
-- Tickets de HubSpot (tabla principal de negocio)
CREATE TABLE hubspot_tickets (
  id                        VARCHAR(50) PRIMARY KEY,  -- ID HubSpot
  folio                     VARCHAR(100),
  subject                   TEXT,
  pipeline                  VARCHAR(50),
  pipeline_stage            VARCHAR(50),
  stage_label               VARCHAR(100),
  nombre_persona_tramite    TEXT,
  correo_solicitante        TEXT,
  curp                      VARCHAR(20),
  expediente_catastral      VARCHAR(100),
  expediente_municipio      VARCHAR(10),
  tipo_tramite              TEXT,
  fecha_creacion            TIMESTAMPTZ,
  fecha_cierre              TIMESTAMPTZ,
  fecha_modificacion        TIMESTAMPTZ,
  dias_abierto              INTEGER,
  propietario_id            VARCHAR(50),
  sync_date                 TIMESTAMPTZ DEFAULT NOW()
);

-- Log de sincronización
CREATE TABLE sync_log (
  id                    SERIAL PRIMARY KEY,
  tipo                  VARCHAR(30),  -- carga_inicial|incremental|cache_clear|error
  inicio                TIMESTAMPTZ,
  fin                   TIMESTAMPTZ,
  duracion_ms           INTEGER,
  tickets_procesados    INTEGER DEFAULT 0,
  tickets_nuevos        INTEGER DEFAULT 0,
  tickets_actualizados  INTEGER DEFAULT 0,
  tickets_error         INTEGER DEFAULT 0,
  ultimo_ticket_id      VARCHAR(50),
  descripcion           TEXT,
  error_detalle         TEXT,
  servidor              VARCHAR(50)
);
```

### Permisos JSONB por rol
```json
// ADMIN
{
  "tabs": ["resumen","etapas","tramites","tiempos","formularios","poa","busqueda","sincronizacion"],
  "gestion_usuarios": true,
  "ver_datos_nominativos": true,
  "exportar": true
}

// DIRECTOR
{
  "tabs": ["resumen","etapas","tramites","tiempos","formularios","poa","busqueda","sincronizacion"],
  "gestion_usuarios": false,
  "ver_datos_nominativos": true,
  "exportar": true
}

// SUPERVISOR
{
  "tabs": ["resumen","etapas","tramites","tiempos","formularios","poa","busqueda","sincronizacion"],
  "gestion_usuarios": false,
  "ver_datos_nominativos": true,
  "exportar": false
}

// CONSULTA
{
  "tabs": ["resumen","etapas","tramites"],
  "gestion_usuarios": false,
  "ver_datos_nominativos": false,
  "exportar": false
}
```

---

## 6. WORKER NODE.JS: API Y ENDPOINTS

### Arquitectura del worker
El archivo `worker.js` (v1.1.0) combina dos responsabilidades en un solo proceso:
1. **API REST Express** — sirve datos al dashboard en puerto 3000
2. **Cron jobs** — sincronización con HubSpot (actualmente detenidos)

### Endpoints de datos (requieren JWT en header `Authorization: Bearer <token>`)

```
GET /api/health              → Estado del sistema (público, sin JWT)
GET /api/tickets             → Búsqueda de tickets con filtros
GET /api/stats               → Estadísticas agregadas por etapa
GET /api/resumen             → Resumen ejecutivo
GET /api/sync/logs           → Logs de sincronización
POST /api/sync/trigger       → Disparar sync manual (solo ADMIN_TOKEN)
DELETE /api/cache            → Limpiar caché (solo ADMIN_TOKEN)
```

### Parámetros del endpoint `/api/tickets`
```
campo   — expediente|correo|nombre|folio|id|curp
q       — texto de búsqueda
desde   — fecha inicio (YYYY-MM-DD)
hasta   — fecha fin (YYYY-MM-DD)
dia     — fecha exacta (YYYY-MM-DD)
limit   — máximo resultados (default 100)
offset  — paginación
```

### Cron jobs configurados (actualmente INACTIVOS)
```javascript
// Sync incremental: cada hora de 07:00 a 17:00 CST, lunes a viernes
cron.schedule('0 7-17 * * 1-5', syncIncremental, { timezone: 'America/Monterrey' });

// Cache clear: diario a las 03:00 CST
cron.schedule('0 3 * * *', cacheClear, { timezone: 'America/Monterrey' });

// Limpieza sesiones expiradas: cada hora
cron.schedule('0 * * * *', limpiarSesiones, { timezone: 'America/Monterrey' });
```

---

## 7. FRONTEND: DASHBOARD ATLAS v5

### Tecnología actual (Fase 1 — temporal)
- **React 18** cargado desde CDN `unpkg.com`
- **Babel standalone** — compilación JSX en el navegador (NO apto para producción real)
- **Recharts 2.12.7** — gráficas
- **prop-types 15.8.1** — requerido por Recharts
- **Google Fonts** — Source Serif 4 + DM Mono
- **Todo en un solo `index.html`** de ~2,031 líneas

### Estructura del componente principal
```
App (controlador de sesión)
├── LoginScreen          — Pantalla de login con JWT
├── CambiarPasswordScreen — Cambio obligatorio en primer login
└── AtlasDashboard       — Dashboard principal
    ├── Sidebar navegación (8 tabs)
    ├── TabResumen        — Resumen ejecutivo
    ├── TabEtapas         — Distribución por etapas
    ├── TabTramites       — Listado de trámites
    ├── TabTiempos        — Análisis de tiempos
    ├── TabFormularios    — Formularios
    ├── TabPOA            — POA 2026
    ├── TabBusqueda       — Búsqueda de trámites
    └── TabSyncLog        — Sincronización (componente separado)
```

### Sistema de temas
El dashboard tiene modo claro/oscuro (`dark` state). Los colores se definen en el objeto `T` (tema) que se pasa como prop a subcomponentes.

### PROBLEMA CRÍTICO DE DATOS: Dashboard con datos estáticos
**El dashboard actual NO consulta la API en tiempo real.** Los datos mostrados en los tabs Resumen, Etapas, Trámites, Tiempos, Formularios y POA son **datos hardcodeados** en el archivo JSX, correspondientes al estado al 27 de febrero de 2026.

Solo los tabs **Búsqueda** y **Sincronización** están diseñados para consultar la API, pero la búsqueda también opera sobre datos en memoria en la implementación actual.

---

## 8. REGLAS DE NEGOCIO: TAB BÚSQUEDA

### Descripción
Permite consulta individual de trámites por diferentes campos. Diseñado para búsqueda específica, no para listados masivos.

### Modos de búsqueda disponibles
| ID | Label | Placeholder | Campo en BD |
|----|-------|-------------|-------------|
| expediente | Expediente Catastral | Ej: 28002280012 o 58 44 002 009 | expediente_catastral |
| correo | Correo electrónico | Ej: solicitante@gmail.com | correo_solicitante |
| nombre | Nombre del solicitante | Ej: García López | nombre_persona_tramite |
| folio | Folio | Ej: FOLIO-2024-001 | folio |
| id | ID HubSpot | Ej: 12345678 | id |
| curp | CURP | Ej: GARC850412HNLR... | curp |

### Implementación actual (PROBLEMÁTICA)
```javascript
// Estado actual — búsqueda sobre datos en memoria (DEMO)
const ejecutarBusqueda = useCallback(() => {
  if (!searchQuery.trim()) return;
  // Filtra sobre DEMO_DATA hardcodeado, NO sobre la BD real
  const q = searchQuery.toLowerCase();
  const results = DEMO_DATA.filter(r => {
    if (searchMode === "expediente") return (r.expediente_catastral||"").toLowerCase().includes(q);
    if (searchMode === "correo")     return (r.correo_solicitante||"").toLowerCase().includes(q);
    if (searchMode === "nombre")     return (r.nombre_persona_tramite||"").toLowerCase().includes(q);
    if (searchMode === "folio")      return (r.folio||"").toLowerCase().includes(q);
    if (searchMode === "id")         return (r.id||"").toLowerCase().includes(q);
    if (searchMode === "curp")       return (r.curp||"").toLowerCase().includes(q);
  });
  setSearchResults(results);
}, [searchQuery, searchMode]);
```

**Trigger:** Botón "Buscar" o tecla Enter en el input.

### BUG CONOCIDO: Input de búsqueda pierde el foco
**Síntoma:** Al cambiar el modo de búsqueda (ej: seleccionar "Correo electrónico") el input de texto solo acepta un carácter y luego pierde el foco, impidiendo escribir más.

**Causa raíz:** El estado `searchMode` y `searchQuery` están declarados en el componente padre `AtlasDashboard` (líneas 302-348 del JSX original). Cuando el usuario escribe en el input del tab `TabBusqueda`, el `onChange` llama `setSearchQuery` que actualiza el estado del padre, causando re-render completo del padre y de todos sus hijos, lo que destruye y recrea el input, perdiendo el foco.

**Solución requerida en Fase 2:** Mover el estado de búsqueda (`searchMode`, `searchQuery`, `searchResults`, etc.) al interior del componente `TabBusqueda`, de modo que el re-render sea local al tab. Adicionalmente, conectar la búsqueda al endpoint real `/api/tickets?campo=X&q=Y`.

### Implementación correcta requerida (Fase 2)
```javascript
// Tab búsqueda debe ser componente autocontenido con estado local
function TabBusqueda({ token, permisos }) {
  const [searchMode, setSearchMode] = useState("expediente");
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  async function buscar() {
    if (!searchQuery.trim()) return;
    setLoading(true);
    const res = await fetch(`/api/tickets?campo=${searchMode}&q=${encodeURIComponent(searchQuery)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    setResults(data.tickets);
    setLoading(false);
  }
  // ...
}
```

### Filtro por fecha (adicional a modo de búsqueda)
El tab tiene un segundo filtro de fecha con 4 opciones:
- `all` — Sin filtro de fecha
- `range` — Rango de fechas (desde/hasta)
- `day` — Día específico
- `custom` — Personalizado

---

## 9. REGLAS DE NEGOCIO: TAB SINCRONIZACIÓN

### Descripción
Muestra el log de eventos de sincronización entre HubSpot CRM y la BD local PostgreSQL.

### Fuente de datos
```
GET /api/sync/logs?limit=100
→ tabla sync_log en PostgreSQL (srv-cpan04)
```

### Tipos de eventos registrados en sync_log
| tipo | Descripción |
|------|-------------|
| `carga_inicial` | Carga masiva inicial de todos los tickets históricos |
| `incremental` | Sync horario de tickets modificados en las últimas 2 horas |
| `cache_clear` | Limpieza nocturna de tickets con más de 7 días sin modificación |
| `error` | Cualquier fallo en el proceso de sync |

### Estructura del registro sync_log
```json
{
  "id": 1,
  "tipo": "incremental",
  "inicio": "2026-02-28T14:00:00Z",
  "fin": "2026-02-28T14:01:23Z",
  "duracion_ms": 83000,
  "tickets_procesados": 47,
  "tickets_nuevos": 3,
  "tickets_actualizados": 44,
  "tickets_error": 0,
  "ultimo_ticket_id": "12345678",
  "descripcion": "Sync incremental completado",
  "error_detalle": null,
  "servidor": "srvu-cpan03"
}
```

### Implementación actual (PROBLEMÁTICA)
```javascript
// TabSyncLog.jsx — actualmente usa DEMO_LOGS hardcodeados
// El comentario en el código indica:
// "En producción: fetch('/api/sync/logs?limit=100')"
// Pero la implementación real usa datos demo, NO la API

const [autoRefresh, setAutoRefresh] = useState(false);

useEffect(() => {
  if (!autoRefresh) return;
  const interval = setInterval(refrescar, 60000); // cada 60 segundos
  return () => clearInterval(interval);
}, [autoRefresh, refrescar]);
```

### Funcionalidades del tab
- **Botón Refrescar manual** — recarga los logs
- **Toggle Auto (60s)** — activa polling automático cada 60 segundos
- **Tabla de logs** — muestra los últimos N registros con colores por tipo
- **Indicador LIVE** — badge verde en el sidebar cuando autoRefresh está activo

### Implementación correcta requerida (Fase 2)
Conectar a `/api/sync/logs` con JWT, mostrar datos reales, manejar estado vacío cuando no hay sincronizaciones registradas.

---

## 10. REGLAS DE NEGOCIO: TODOS LOS TABS

### Tab Resumen
- KPIs principales: total tickets, % cerrados, tickets del período seleccionado
- Gráfica de distribución por etapa (PieChart)
- Gráfica histórica por año (BarChart)
- Selector de período: Histórico (Feb 2023 – Feb 2026) / 2026 / 2025 / 2024 / Personalizado
- **Datos actuales: HARDCODEADOS** — no consulta API

### Tab Etapas
- Distribución de tickets por etapa del pipeline
- 7 etapas: Recibido, Asignado, En proceso, Esperando por nosotros, Esperando recepción Oficio, Cerrado, Rechazado
- IDs de etapas HubSpot: 47866392, 47866394, 47916048, 47916050, 47916049, 47916053, 224532383
- **Datos actuales: HARDCODEADOS**

### Tab Trámites
- Listado paginado de trámites
- Campos visibles: folio, solicitante, etapa, municipio, fecha
- **Datos actuales: HARDCODEADOS (solo datos demo)**

### Tab Tiempos
- Análisis de tiempo de resolución por etapa
- Métricas: días promedio abierto, distribución de tiempos
- **Datos actuales: HARDCODEADOS**

### Tab Formularios
- Distribución por tipo de formulario/trámite catastral
- **Datos actuales: HARDCODEADOS**

### Tab POA 2026
- Seguimiento del Programa Operativo Anual 2026
- Metas vs avance por tipo de trámite
- **Datos actuales: HARDCODEADOS**

---

## 11. USUARIOS Y ROLES DEFINIDOS

### Usuarios iniciales del sistema
| Username | Nombre | Rol | Contraseña temp | Estado |
|----------|--------|-----|-----------------|--------|
| javier.hernandez@ircnl.gob.mx | Javier Hernández Dueñas | ADMIN | Ircnl2026! | Debe cambiar |
| josemaria.urrutia@ircnl.gob.mx | José María Urrutia | DIRECTOR | Ircnl2026! | Debe cambiar |
| hector.garza@ircnl.gob.mx | Héctor Garza | DIRECTOR | Ircnl2026! | Debe cambiar |
| alma.reynoso@ircnl.gob.mx | Alma Reynoso | SUPERVISOR | Ircnl2026! | Debe cambiar |
| lizeth.santillan@ircnl.gob.mx | Lizeth Santillán | SUPERVISOR | Ircnl2026! | Debe cambiar |
| patricia.deleon@ircnl.gob.mx | Patricia De León | CONSULTA | Ircnl2026! | Debe cambiar |

### Matriz de permisos por rol
| Permiso | ADMIN | DIRECTOR | SUPERVISOR | CONSULTA |
|---------|-------|----------|------------|---------|
| Tab Resumen | ✅ | ✅ | ✅ | ✅ |
| Tab Etapas | ✅ | ✅ | ✅ | ✅ |
| Tab Trámites | ✅ | ✅ | ✅ | ✅ |
| Tab Tiempos | ✅ | ✅ | ✅ | ❌ |
| Tab Formularios | ✅ | ✅ | ✅ | ❌ |
| Tab POA | ✅ | ✅ | ✅ | ❌ |
| Tab Búsqueda | ✅ | ✅ | ✅ | ❌ |
| Tab Sincronización | ✅ | ✅ | ✅ | ❌ |
| Gestión usuarios | ✅ | ❌ | ❌ | ❌ |
| Ver datos nominativos | ✅ | ✅ | ✅ | ❌ |
| Exportar | ✅ | ✅ | ❌ | ❌ |

---

## 12. SEGURIDAD IMPLEMENTADA

### Lo que está implementado
- ✅ HTTPS con Let's Encrypt (terminado en NPM)
- ✅ JWT para autenticación de API
- ✅ bcrypt (12 rounds) para contraseñas
- ✅ Sesiones en BD con invalidación explícita
- ✅ Auditoría de accesos en tabla `auditoria_accesos`
- ✅ Bloqueo temporal tras 5 intentos fallidos (15 min)
- ✅ Cambio de contraseña obligatorio en primer login
- ✅ Contraseña mínimo 12 caracteres
- ✅ Headers de seguridad en Nginx (X-Frame-Options, X-Content-Type-Options, etc.)
- ✅ X-Robots-Tag noindex en headers HTTP
- ✅ Meta tags noindex en HTML
- ✅ robots.txt bloqueando indexación
- ✅ SELinux Enforcing en srv-cpan01
- ✅ .env con chmod 600

### Problemas de seguridad conocidos (pendientes Fase 2)
- ❌ Filtro de IP en worker deshabilitado — solo JWT protege la API
- ❌ Dashboard frontend NO verifica permisos por rol — todos los usuarios ven todos los tabs
- ❌ Puerto 5432 potencialmente expuesto en docker-compose del NPM
- ❌ Sin MFA (Autenticación Multifactor)
- ❌ Sin LDAP/Active Directory integration
- ❌ Sin rate limiting en endpoints de auth
- ❌ Sin escaneo de vulnerabilidades en dependencias (npm audit pendiente)
- ❌ Sin WAF (Web Application Firewall)
- ❌ Sin IDS/IPS
- ❌ Babel standalone en producción expone código fuente completo
- ❌ localStorage para guardar JWT (vulnerable a XSS — debería ser httpOnly cookie)
- ❌ Sin CSP (Content Security Policy) headers

---

## 13. DEUDA TÉCNICA Y PROBLEMAS CONOCIDOS

### Críticos
1. **Babel standalone en producción** — El frontend compila JSX en el navegador. Lento, expone código fuente, no minificado, depende de CDNs externos.
2. **Datos hardcodeados** — 6 de 8 tabs muestran datos estáticos de Feb 2026, no datos en tiempo real de la BD.
3. **Bug de input búsqueda** — Estado compartido causa pérdida de foco al escribir más de un carácter.
4. **JWT en localStorage** — Vulnerable a XSS. Debe migrarse a httpOnly cookies.
5. **hubspot-worker detenido** — Sin sincronización incremental activa.

### Altos
6. **Sin separación de entornos** — No existe staging/desarrollo. Todo va directo a producción.
7. **Sin CI/CD** — Deploy manual via scripts bash desde Mac del administrador.
8. **Sin pruebas automatizadas** — Cero cobertura de tests.
9. ~~**Permisos BD incompletos**~~ — ✅ Corregido. `usr_ircnl_prod` tiene acceso completo a `sesiones`, `auditoria_accesos`, `hubspot_tickets`, `sync_log`.
10. **Sin acceso SSH al NPM** — El servidor 10.150.130.158 no tiene SSH configurado, imposibilitando automatización.

### Medios
11. **CDNs externos** — React, Recharts, Babel dependen de unpkg.com. Sin disponibilidad garantizada.
12. **Sin monitoreo** — No hay alertas, métricas ni observabilidad del sistema.
13. **Sin backup automatizado** — Solo backup manual pre-deploy.
14. ~~**Carga inicial pendiente**~~ — ✅ **COMPLETADA** — 130,937 tickets importados el 1 de marzo de 2026.

---

## 14. LO QUE NO SE IMPLEMENTÓ EN FASE 1

Los siguientes elementos fueron diseñados pero NO implementados:

- **Login funcional en el frontend** — Implementado en Fase 1 al final, pero sin pruebas completas con todos los roles
- **Control de acceso por rol en UI** — El frontend no oculta tabs según el rol del usuario logueado
- **Búsqueda conectada a BD real** — TabBusqueda usa datos demo
- **Sincronización activa** — TabSyncLog usa datos demo, hubspot-worker detenido
- **Exportación de datos** — Mencionada en permisos pero no implementada
- **Gestión de usuarios desde UI** — Endpoints existen pero no hay pantalla en el dashboard
- **POA dinámico** — Tab POA con datos reales del año en curso
- **Compilación con Vite** — Build de producción optimizado
- **Variables de entorno en frontend** — La URL de la API está hardcodeada como ruta relativa

---

## 15. REQUERIMIENTOS PARA FASE 2

### Objetivo de Fase 2
Rediseño completo del frontend con arquitectura correcta, conexión real a datos, y corrección de todos los problemas de seguridad identificados.

### Stack tecnológico recomendado para evaluación
**Frontend:**
- React 18+ compilado con Vite
- TypeScript (opcional pero recomendado)
- Tailwind CSS o sistema de diseño institucional
- httpOnly cookies para JWT (no localStorage)
- React Query para fetching y caché de datos

**Backend:**
- Mantener Node.js + Express (refactorizar a módulos separados)
- O migrar a NestJS para mayor estructura
- Agregar validación de esquemas (Joi o Zod)
- Rate limiting (express-rate-limit)
- Helmet.js para headers de seguridad

**Infraestructura:**
- GitHub Actions para CI/CD
- Entornos separados: desarrollo / staging / producción
- Docker para el worker (no solo PM2)
- Nginx como reverse proxy directo (eliminar dependencia de NPM para configuración)

### Funcionalidades requeridas en Fase 2
1. **Dashboard con datos reales** — Todos los tabs conectados a `/api/*`
2. **Control de acceso por rol en UI** — Tabs visibles según permisos del usuario
3. **Tab Búsqueda funcional** — Input sin bug de foco, conectado a BD real
4. **Tab Sincronización funcional** — Datos reales de sync_log, con autorefresh real
5. **Gestión de usuarios** — CRUD completo desde la UI (solo ADMIN)
6. **Exportación** — CSV/Excel de resultados (ADMIN y DIRECTOR)
7. **Notificaciones** — Alertas cuando el sync falla o hay tickets bloqueados
8. **Auditoría visible** — Log de accesos visible para ADMIN
9. **Restaurar filtro IP** — Con lógica correcta que soporte el paso por NPM
10. **MFA** — Autenticación de dos factores (TOTP o SMS)
11. **Integración LDAP/AD** — Si existe Active Directory en la organización

### Consideraciones especiales para Fase 2
- El NPM (10.150.130.158) no tiene SSH accesible — cualquier cambio en proxy debe hacerse via panel web en puerto 81 o desde red interna
- SELinux Enforcing en srv-cpan01 — todos los archivos web deben tener contexto `httpd_sys_content_t` y permisos mínimo 644
- La contraseña del servidor 10.150.111.50 contiene caracteres especiales (`$`) que causan problemas en scripts bash — usar `IdentitiesOnly=yes` y comillas simples
- El usuario `administrator` requiere `sudo` con contraseña en todos los servidores — considerar configurar `NOPASSWD` para comandos específicos del deploy
- La carga inicial de 130,937 tickets fue completada el 1 de marzo de 2026. Para una nueva carga completa, usar el endpoint `POST /api/sync/carga-inicial` con el header `X-Admin-Token`. El proceso usa rangos mensuales para evitar el límite de 10,000 registros de la HubSpot Search API y tarda aproximadamente 8 minutos.

---

## APÉNDICE 0: SESIÓN DE CARGA INICIAL — 1 de marzo de 2026

### Resumen ejecutivo
Se completó la carga histórica de 130,937 tickets desde HubSpot al servidor PostgreSQL. El proceso requirió resolver múltiples problemas técnicos en secuencia.

### Problemas resueltos y soluciones aplicadas

#### 1. Schema `sync_log` incompatible
El schema aplicado por `auth-schema.sql` tenía columnas distintas a las que el worker esperaba. Se recreó la tabla con el schema correcto que incluye: `tipo`, `inicio`, `fin`, `duracion_ms`, `tickets_procesados`, `tickets_nuevos`, `tickets_actualizados`, `tickets_error`, `ultimo_ticket_id`, `descripcion`, `error_detalle`, `servidor`.

#### 2. Nombre de tabla incorrecto en worker
El código del worker hacía `INSERT INTO tickets` pero la tabla en BD se llama `hubspot_tickets`. Corrección:
```bash
sed -i 's/INSERT INTO tickets /INSERT INTO hubspot_tickets /g' /opt/api-ircnl/worker.js
```

#### 3. Límite de 10,000 registros de HubSpot Search API
HubSpot no permite paginar más allá de 10,000 resultados en una búsqueda. La función `cargaInicial()` fue reescrita para dividir la carga en **rangos mensuales** (Feb 2023 – Mar 2026 = 37 rangos). Cada rango hace su propia búsqueda independiente, ninguno supera 10,000 tickets. Tiempo total: ~8 minutos.

#### 4. Columnas VARCHAR demasiado cortas
Varios campos del schema tenían longitudes insuficientes para datos reales. Solución: convertir todos los campos de texto a `TEXT` sin límite de longitud. Los campos afectados fueron: `curp`, `expediente_catastral`, `expediente_municipio`, `folio`, `hs_pipeline`, `hs_pipeline_stage`, `hubspot_owner_id`, `hubspot_team_id`, `hs_form_id`, `hs_time_to_first_response_sla_status`, `hs_time_to_close_sla_status`.

#### 5. Permisos faltantes en tablas
Se otorgaron permisos completos a `usr_ircnl_prod` sobre: `sesiones`, `auditoria_accesos`, `hubspot_tickets`, `sync_log` y la secuencia `sync_log_id_seq`.

### Resultado final
| Métrica | Valor |
|---------|-------|
| Total tickets importados | 130,937 |
| Primer ticket | 2023-02-13 |
| Último ticket | 2026-02-28 |
| Primera carga (errores VARCHAR) | 761 errores |
| Segunda carga (upsert limpio) | 0 errores |
| Tiempo total por carga | ~8 minutos |
| Registros verificados en BD | 130,937 (COUNT confirmado) |

### Schema final de `hubspot_tickets`
Todos los campos de texto definidos como `TEXT` (sin límite de longitud). Ver Apéndice 0 del repositorio para DDL completo.

### Lecciones aprendidas
1. **HubSpot Search API tiene límite de 10,000** — siempre usar rangos de fecha para conjuntos grandes
2. **Definir campos de texto como TEXT en primera iteración** — agregar restricciones solo después de conocer datos reales
3. **Probar con muestra pequeña antes de carga completa** — un ticket de prueba hubiera revelado los problemas de schema en minutos
4. **Los ALTER TABLE en caliente funcionan en PostgreSQL** — se pueden ampliar tipos sin detener procesos activos

---


## APÉNDICE A: COMANDOS DE OPERACIÓN

### Verificar estado del sistema
```bash
# Health check API
curl https://tablero.ircnl.gob.mx/api/health

# Estado del worker
sshpass -p 'PASS' ssh administrator@10.150.111.52 'pm2 list'

# Contar tickets en BD
sshpass -p 'PASS' ssh administrator@10.150.111.53 \
  'echo PASS | sudo -S -u postgres psql -d db_ircnl_main -tAc "SELECT COUNT(*) FROM hubspot_tickets;" 2>/dev/null'

# Logs del worker
sshpass -p 'PASS' ssh administrator@10.150.111.52 'pm2 logs api-ircnl --lines 50 --nostream'
```

### Iniciar carga histórica de tickets (si se necesita reimportar)
```bash
# Desde dentro del servidor worker (10.150.111.52)
curl -s -X POST http://localhost:3000/api/sync/carga-inicial \
  -H 'X-Admin-Token: TOKEN_AQUI' \
  -H 'Content-Type: application/json'

# Monitorear progreso desde Mac
sshpass -p 'PASS' ssh administrator@10.150.111.52 'pm2 logs 0 --lines 5 --nostream'

# Verificar contador en BD
sshpass -p 'PASS' ssh administrator@10.150.111.53 \
  'echo PASS | sudo -S -u postgres psql -d db_ircnl_main \
  -tAc "SELECT COUNT(*) FROM hubspot_tickets;" 2>/dev/null'

# NOTA: El proceso tarda ~8 minutos con estrategia de rangos mensuales
# NOTA: La carga ya fue completada el 1-Mar-2026 con 130,937 tickets
```

### Reiniciar worker
```bash
sshpass -p 'PASS' ssh administrator@10.150.111.52 \
  'pm2 restart api-ircnl --update-env && pm2 save'
```

### Deploy de nuevo index.html
```bash
sshpass -p 'E$qoW23lj5%v' scp -o StrictHostKeyChecking=no \
  -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o IdentitiesOnly=yes \
  ~/ircnl-deploy/index.html \
  administrator@10.150.111.50:/var/www/dashboard/index.html
# Luego dentro del servidor: chmod 644 /var/www/dashboard/index.html
```

---

## APÉNDICE B: ARCHIVOS DEL PROYECTO

### En ~/ircnl-deploy/ (Mac del administrador)
```
deploy-ircnl-v2.sh          — Script maestro de deployment
auth-schema.sql             — Schema de autenticación PostgreSQL
auth-middleware.js          — Módulo JWT para el worker
nginx-tablero.conf          — Config Nginx para srv-cpan01
worker.js                   — Worker Node.js v2 con auth
ecosystem.config.js         — Config PM2
package.json                — Dependencias Node.js v1.1.0
.env                        — Variables de entorno (NO subir a git)
index.html                  — Frontend todo-en-uno
ircnl-atlas-v5-produccion.jsx — Código fuente React del dashboard
TabSyncLog.jsx              — Componente de sincronización
ircnl.conf                  — Config Nginx limpia (última versión)
robots.txt                  — Archivo anti-indexación
```

### URL de acceso
- **Producción HTTPS:** `https://tablero.ircnl.gob.mx/dashboard/`
- **Intranet HTTP:** `http://10.150.111.50/dashboard/`
- **API health:** `https://tablero.ircnl.gob.mx/api/health`

---

*Documento generado el 28 de febrero de 2026 — Actualizado el 1 de marzo de 2026*  
*Sistema: IRCNL ATLAS v5.1 — Fase 1 completada*  
*Carga inicial: 130,937 tickets importados exitosamente*  
*Próxima revisión: Al inicio de Fase 2*
