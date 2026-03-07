# 🏛️ CLAUDE.md — Sistema de Tablero IRCNL / ATLAS Dashboard
## Contexto Maestro para Claude Code — Fase 2: Centro de Inteligencia Catastral

> **Versión:** 1.3 | **Fecha:** 07/03/2026
> **Este archivo es la fuente de verdad para Claude Code en este proyecto.**
> Leerlo completo antes de ejecutar cualquier tarea.

### Control de cambios
| Versión | Fecha | Cambio |
|---|---|---|
| 1.0 | 06/03/2026 | Versión inicial sincronizada con Manual v1.10 |
| 1.1 | 07/03/2026 | Revisión CETH v3.0: variables faltantes, sección Testing, reglas de escalamiento |
| **1.2** | **07/03/2026** | **VERIFICADO CONTRA SERVIDORES: 37 campos, sync_log real, Ubuntu 24.04, pgcrypto instalada, auth existente en db_ircnl_main** |
| **1.3** | **07/03/2026** | **RESOLUCIONES FINALES: db_seguridad_acceso separada (migrar tablas auth), JWT RS256 confirmado, municipio_clave resuelto vía expediente_municipio + catálogo 51 mpios, meta_poa_asociada = reglas de negocio calculadas (no campo HubSpot), catálogo de municipios NL integrado** |

---

## 1. IDENTIDAD DEL PROYECTO

| Atributo | Valor |
|---|---|
| **Nombre** | Sistema de Tablero IRCNL / ATLAS Dashboard |
| **Institución** | Instituto Registral y Catastral del Estado de Nuevo León (IRCNL) |
| **Fase activa** | **Fase 2 — Centro de Inteligencia Catastral** |
| **Repo** | `git@github.com:pteinteractive/tablero.git` |
| **Rama de trabajo** | `feature/fase2-setup` (crear si no existe) |
| **Rama protegida** | `master` / `main` — **NUNCA hacer push directo** |
| **Manual vigente** | `Manual_Arquitectura_IRCNL_v1.10.docx` |
| **Marco metodológico** | CETH v3.0 |

### ¿Qué es este sistema?

Dashboard ejecutivo gubernamental que consolida, analiza y visualiza **131,285 tickets de trámites catastrales** del IRCNL (sincronizados desde HubSpot CRM) y los alinea con el Plan Operativo Anual 2026 (POA 2026).

**URLs:**
- Producción: `https://tablero.ircnl.gob.mx` → Nodo .50
- Desarrollo: `https://dev-tablero.ircnl.gob.mx` → Nodo .54

---

## 2. ROL DE CLAUDE CODE EN ESTE PROYECTO

Claude Code es el **ejecutor técnico principal** de la Fase 2. Esto significa:

- Escribe todo el código de producción (API, Worker, Frontend Blazor, migraciones SQL)
- Ejecuta comandos en los nodos remotos vía SSH cuando sea necesario
- Toma decisiones de implementación dentro de la arquitectura aprobada
- Valida cada tarea contra su Definition of Done antes de declararla completa
- **No improvisa arquitectura** — si algo no está en este documento, pregunta antes de proceder

### Lo que Claude Code NO hace sin aprobación explícita:
- Modificar archivos en el Nodo .50 (producción de Fase 1 — intocable)
- Hacer push a las ramas `master` o `main`
- Borrar o truncar tablas en `db_ircnl_main` (los 131,285 registros son sagrados)
- Cambiar puertos o reglas de firewall sin documentarlo
- Hardcodear credenciales, tokens o contraseñas en cualquier archivo

### 2.1 Cuándo pausar y escalar a humano

| Situación | Acción requerida |
|---|---|
| El código de Fase 1 necesita modificación | **DETENER.** Notificar a Javier Hernández. No tocar Fase 1. |
| Se requiere cambio de schema en `db_ircnl_main` | **DETENER.** Propuesta escrita a Maricarmen Valdez y Javier. Esperar aprobación. |
| Error de compilación que no se resuelve en 3 intentos | Pausar y documentar el bloqueo. Escalar al Tech Lead (Fabián). |
| Discrepancia en conteo de registros de `sync_log` | **DETENER** sincronización. Notificar urgente a Javier Hernández. |
| Necesidad de reiniciar PostgreSQL en Nodo .53 | Notificar a Maricarmen Valdez antes de ejecutar. |
| Variable de entorno faltante o incorrecta | Solicitar a la persona responsable (ver tabla de variables en Sección 7). |
| Comando SSH no responde en un nodo | Intentar desde Nodo Maestro (.50). Si persiste, escalar a Javier Hernández. |
| Cambio de arquitectura necesario | **DETENER.** Documentar propuesta. Presentar a Javier para aprobación. |

---

## 3. ARQUITECTURA DE INFRAESTRUCTURA (Verificada 07/03/2026)

### Topología de red: `10.150.111.0/24`

```
Internet
   │
   ▼
[.158] Nginx Proxy Manager (Docker) — SSL Termination
   │    Proxy Host 91 → tablero.ircnl.gob.mx  → .50:80
   │    Proxy Host 92 → dev-tablero.ircnl.gob.mx → .54:80
   │    /api/* → .52:3000  (⚠️ cambiar a 5000 en Sprint 1)
   │
   ├──► [.50] srv-cpan01 — AlmaLinux 10.1, Nginx 1.26.3, 15Gi RAM, 95G
   │         FUNCIÓN: Frontend Producción + Nodo Maestro SSH
   │         FASE 2: Blazor Server (go-live en Sprint 7)
   │         ⛔ NO TOCAR hasta Sprint 7
   │
   ├──► [.51] srv-cpan51 — AlmaLinux 9, 15Gi RAM, 70G
   │         FUNCIÓN: Balanceo y Cron
   │         ESTADO: ⚠️ Rama develop zombi — ignorar en Fase 2
   │
   ├──► [.52] srvu-cpan03 — Ubuntu 24.04 LTS ✅, 15Gi RAM, 97G
   │         FUNCIÓN: API ASP.NET Core 8 + BackgroundService HubSpot
   │         ESTADO ACTUAL: PM2 con proceso "api-ircnl" (Node.js) en puerto 3000
   │         PUERTO API FUTURO: 5000 (Kestrel) — reemplaza Node.js:3000
   │         CI/CD: GitHub Actions Runner
   │         .NET SDK: ❌ No instalado — instalar en Sprint 1
   │         Redis: ❌ No instalado — instalar en Sprint 2
   │
   ├──► [.53] srv-cpan02 — AlmaLinux 9, 14Gi RAM, 36G
   │         FUNCIÓN: PostgreSQL 16 + pgcrypto (ya instalada)
   │         EXTENSIONES FALTANTES: TimescaleDB ❌, pgaudit ❌
   │         USUARIO APP: usr_ircnl_prod (NO administrator)
   │         BASES DE DATOS: ver sección 5
   │
   └──► [.54] srv-dev — Ubuntu 24.04 LTS ✅, 7.8Gi RAM, 28G
              FUNCIÓN: Sandbox de Fase 2
              ESTADO: ⚪ Vacío — preparar en Sprint 1
              .NET SDK: ❌ No instalado — instalar en Sprint 1
              PUERTO API DEV: 5001 (para no colisionar con prod)
```

### Acceso SSH
- **Nodo maestro:** `administrator@10.150.111.50`
- **Llave RSA 4096:** `~/.ssh/id_rsa` — acceso sin contraseña a .51, .52, .53, .54
- **SELinux (.50):** `httpd_can_network_connect = on`

### Acceso PostgreSQL (Nodo .53)
```bash
# ⚠️ [v1.2] El usuario de sistema 'administrator' NO tiene rol en PostgreSQL.
# Para queries manuales usar:
ssh administrator@10.150.111.53
sudo -i -u postgres psql -d db_ircnl_main

# La aplicación conecta vía TCP con usuario usr_ircnl_prod:
# Host: 10.150.111.53 | Puerto: 5432 | User: usr_ircnl_prod
```

---

## 4. STACK TECNOLÓGICO — FASE 2 (CERRADO, NO MODIFICAR)

| Capa | Tecnología | Versión | Notas |
|---|---|---|---|
| API / Backend | ASP.NET Core | 8.0 | WebAPI con Kestrel |
| Worker HubSpot | ASP.NET Core BackgroundService | 8.0 | Reemplaza Node.js/PM2 |
| Frontend / UI | Blazor Server | .NET 8 | Sin JavaScript |
| ORM analítico | Dapper | latest stable | SQL explícito — DBA escribe queries |
| ORM operativo | Entity Framework Core | 8.0 | CRUD + migraciones |
| Base de datos | PostgreSQL | 16 | Nodo .53 |
| Series de tiempo | TimescaleDB | 2.x | ❌ No instalado — instalar paquete antes de Sprint 2 |
| Cifrado | pgcrypto | 1.3 | ✅ Ya instalada en db_ircnl_main |
| Auditoría SQL | pgaudit | — | ❌ No disponible — instalar paquete antes de Sprint 6 |
| Caché | Redis | 7.x | ❌ No instalado en .52 — instalar en Sprint 2 |
| Reportes Excel | ClosedXML | latest | NuGet |
| Reportes PDF | QuestPDF | latest | NuGet — open source |
| Testing | xUnit + WebApplicationFactory | latest | NuGet — ver Sección 8.1 |
| CI/CD | GitHub Actions | — | Runner en .52 |

### Tecnologías descartadas (no proponer alternativas):
- ~~React / Next.js~~ — equipo 56.8%, nadie ÓPTIMO
- ~~Laravel / PHP~~ — equipo 52.5%
- ~~Python / FastAPI~~ — equipo 52.3%
- ~~Node.js / PM2~~ — migrado a BackgroundService en Sprint 1

---

## 5. BASES DE DATOS (Nodo .53 — PostgreSQL 16)

> **[v1.2] VERIFICADO contra servidor real el 07/03/2026.**

```
PostgreSQL 16 @ 10.150.111.53
Usuario aplicación: usr_ircnl_prod (login habilitado)
Usuario admin: postgres (solo vía sudo -i -u postgres)

├── db_ircnl_main          ← BASE PRINCIPAL — ⛔ NO modificar schema sin aprobación
│   ├── hubspot_tickets    ← 131,285 tickets (37 columnas) — ver Sección 5.1
│   ├── tickets            ← ⚠️ Tabla duplicada — investigar (DT-10)
│   ├── sync_log           ← log del Worker (13 columnas) — ver Sección 5.2
│   ├── roles              ← ⚠️ MIGRAR a db_seguridad_acceso en Sprint 1
│   ├── usuarios           ← ⚠️ MIGRAR a db_seguridad_acceso en Sprint 1
│   ├── sesiones           ← ⚠️ MIGRAR a db_seguridad_acceso en Sprint 1
│   ├── auditoria_accesos  ← ⚠️ MIGRAR a db_seguridad_acceso en Sprint 1
│   └── pgcrypto           ← ✅ extensión ya instalada v1.3
│
├── db_seguridad_acceso    ← [📋 CREAR en Sprint 1] migrar 4 tablas auth desde db_ircnl_main
│   ├── roles              ← migrar desde db_ircnl_main (4 roles con permisos JSONB)
│   ├── usuarios           ← migrar desde db_ircnl_main (6 usuarios + agregar equipo técnico)
│   ├── sesiones           ← migrar desde db_ircnl_main
│   └── auditoria_accesos  ← migrar desde db_ircnl_main
│
├── db_salud_integral      ← uptime, latencia, monitoreo
│   └── metricas_nodos     ← única tabla existente
│
├── db_poa_2026            ← [📋 crear en Sprint 2] — requiere TimescaleDB
│   └── catalogo_municipios_nl ← 51 municipios de NL (ver Sección 5.7)
│
└── db_catastro_tramites   ← [📋 crear en Sprint 2] — expedientes técnicos
```

> **[v1.3] DECISIÓN ARQUITECTÓNICA:** Las tablas de autenticación (roles, usuarios, sesiones,
> auditoria_accesos) que actualmente viven en `db_ircnl_main` (creadas el 28/02/2026 por
> `deploy-ircnl-v2.sh`) deben **MIGRARSE** a una base de datos separada `db_seguridad_acceso`.
>
> **Plan de migración (Sprint 1, S1-2):**
> 1. Crear `db_seguridad_acceso` con script `001_create_db_seguridad_acceso.sql`
> 2. Copiar schema y datos de las 4 tablas desde db_ircnl_main
> 3. Verificar integridad (conteo de usuarios, roles, etc.)
> 4. Implementar JWT RS256 apuntando a la nueva base
> 5. Verificar que la aplicación .NET conecta correctamente
> 6. Tras validación exitosa: DROP de las 4 tablas en db_ircnl_main (con aprobación de Javier)

### 5.1 Tabla `hubspot_tickets` — LOS 37 CAMPOS REALES

> **[v1.2] FUENTE DE VERDAD** — Verificado contra PostgreSQL y worker.js el 07/03/2026.
> Claude Code NO necesita leer el worker.js original — estos son los campos canónicos.

```sql
-- ═══════════════════════════════════════════════════════════════
-- TABLA hubspot_tickets en db_ircnl_main — 37 columnas
-- Verificado: 07/03/2026 contra information_schema + worker.js
-- ═══════════════════════════════════════════════════════════════

-- #  | Columna DB                           | Propiedad HubSpot                    | Tipo PG                  | Notas
-- ── ┼ ───────────────────────────────────── ┼ ───────────────────────────────────── ┼ ──────────────────────── ┼ ──────────────
--  1 | id                                   | hs_object_id                         | character varying        | PK — NUNCA nulo
--  2 | subject                              | subject                              | text                     | Asunto del trámite
--  3 | expediente_catastral                 | expediente_catastral                 | text                     | ⚠️ 3,926 vacíos (DT-08)
--  4 | expediente_municipio                 | expediente_municipio                 | text                     | Expediente del municipio
--  5 | folio                                | folio                                | text                     | ⚠️ 126,647 vacíos (DT-05) — OJO: en DB es "folio", NO "folio_ircnl"
--  6 | nombre_persona_tramite               | nombre_persona_tramite               | text                     | 🔒 Nombre completo — cifrar LFPDPPP
--  7 | correo_solicitante                   | correo_solicitante                   | text                     | 🔒 Email — cifrar LFPDPPP
--  8 | curp                                 | curp                                 | text                     | 🔒 CURP — cifrar LFPDPPP
--  9 | tramite_solicitado1                  | tramite_solicitado1                  | text                     | Categoría (21 formularios)
-- 10 | tipo_tramite                         | tipo_tramite                         | text                     | Clasificación del servicio
-- 11 | es_masiva                            | es_masiva                            | boolean                  | Trámite masivo
-- 12 | hs_pipeline                          | hs_pipeline                          | text                     | Pipeline al que pertenece
-- 13 | hs_pipeline_stage                    | hs_pipeline_stage                    | text                     | Estado actual en pipeline
-- 14 | hubspot_owner_id                     | hubspot_owner_id                     | text                     | Agente asignado (text, NO bigint)
-- 15 | hubspot_owner_assigneddate           | hubspot_owner_assigneddate           | timestamp with time zone | Fecha de asignación al agente
-- 16 | hubspot_team_id                      | hubspot_team_id                      | text                     | Equipo asignado
-- 17 | createdate                           | createdate                           | timestamp with time zone | Fecha de creación
-- 18 | closed_date                          | closed_date                          | timestamp with time zone | Fecha de cierre — OJO: "closed_date" NO "closedate"
-- 19 | first_agent_reply_date               | first_agent_reply_date               | timestamp with time zone | Primera respuesta del agente
-- 20 | last_reply_date                      | last_reply_date                      | timestamp with time zone | Última respuesta
-- 21 | hs_last_message_received_at          | hs_last_message_received_at          | timestamp with time zone | Último mensaje recibido
-- 22 | hs_last_message_sent_at              | hs_last_message_sent_at              | timestamp with time zone | Último mensaje enviado
-- 23 | time_to_close                        | time_to_close                        | bigint                   | Tiempo total para cerrar (ms)
-- 24 | time_to_first_agent_reply            | time_to_first_agent_reply            | bigint                   | Tiempo a primera respuesta (ms)
-- 25 | hs_time_to_first_rep_assignment      | hs_time_to_first_rep_assignment      | bigint                   | SLA primer asignación (ms) — OJO: bigint NO interval
-- 26 | hs_time_to_first_response_sla_status | hs_time_to_first_response_sla_status | text                     | Estado SLA primera respuesta
-- 27 | hs_time_to_close_sla_status          | hs_time_to_close_sla_status          | text                     | Estado SLA cierre
-- 28 | hs_num_times_contacted               | hs_num_times_contacted               | integer                  | Veces contactado
-- 29 | num_notes                            | num_notes                            | integer                  | Cantidad de notas
-- 30 | hs_form_id                           | hs_form_id                           | text                     | Formulario de origen
-- 31 | tiempos                              | tiempos                              | text                     | Campo personalizado de tiempos
-- 32 | nombredia                            | nombredia                            | text                     | Nombre del día de creación
-- 33 | solicitud                            | solicitud                            | text                     | Tipo de solicitud
-- 34 | ine_ticket                           | ine_ticket                           | text                     | Referencia INE del ticket
-- 35 | content                              | content                              | text                     | Descripción/cuerpo del ticket
-- 36 | hs_lastmodifieddate                  | hs_lastmodifieddate                  | timestamp with time zone | Última modificación en HubSpot
-- 37 | synced_at                            | — (generado local)                   | timestamp with time zone | Marca de sincronización local
```

#### Constante TICKET_PROPS para HubSpot API (copiar tal cual al BackgroundService)
```
subject,expediente_catastral,expediente_municipio,folio,
nombre_persona_tramite,correo_solicitante,curp,
tramite_solicitado1,tipo_tramite,es_masiva,
hs_pipeline,hs_pipeline_stage,
hubspot_owner_id,hubspot_owner_assigneddate,hubspot_team_id,
createdate,closed_date,first_agent_reply_date,
last_reply_date,hs_last_message_received_at,hs_last_message_sent_at,
time_to_close,time_to_first_agent_reply,hs_time_to_first_rep_assignment,
hs_time_to_first_response_sla_status,hs_time_to_close_sla_status,
hs_num_times_contacted,num_notes,
hs_form_id,tiempos,nombredia,solicitud,ine_ticket,content,
hs_lastmodifieddate
```

### 5.3 Tablas de Autenticación (migrar de `db_ircnl_main` → `db_seguridad_acceso`)

> **[v1.3] Estas tablas existen HOY en db_ircnl_main. Se migran a db_seguridad_acceso en Sprint 1.**

#### Tabla `roles` — 4 roles con permisos JSONB
```sql
--  Columna      | Tipo               | Notas
--  id           | integer            | PK
--  nombre       | character varying  | ADMIN, DIRECTOR, SUPERVISOR, CONSULTA
--  descripcion  | text               | Descripción del rol
--  permisos     | jsonb              | {"tabs": [...], "exportar": bool, "gestion_usuarios": bool, "ver_datos_nominativos": bool}
--  creado_en    | timestamp with tz  | Fecha de creación
```

**Roles y permisos actuales:**
| Rol | Tabs | Exportar | Gestión usuarios | Datos nominativos |
|---|---|---|---|---|
| ADMIN | 8 tabs completos | ✅ | ✅ | ✅ |
| DIRECTOR | 8 tabs completos | ✅ | ❌ | ✅ |
| SUPERVISOR | 8 tabs completos | ❌ | ❌ | ✅ |
| CONSULTA | Solo resumen, etapas, trámites | ❌ | ❌ | ❌ |

> ⚠️ **IMPORTANTE PARA FASE 2:** Los permisos JSONB actuales referencian los 8 tabs de Fase 1
> (resumen, etapas, tramites, tiempos, formularios, poa, busqueda, sincronizacion).
> Al agregar los 8 tabs de Fase 2, se necesita un script de migración para actualizar
> el campo `permisos` de cada rol con los nuevos nombres de tabs.

#### Tabla `usuarios` — 6 usuarios con bcrypt
```sql
--  Columna            | Tipo               | Notas
--  id                 | integer            | PK
--  username           | character varying  | Email institucional (ej: javier.hernandez@ircnl.gob.mx)
--  nombre_completo    | text               | Nombre para mostrar
--  password_hash      | text               | Hash bcrypt
--  rol_id             | integer            | FK → roles.id
--  activo             | boolean            | Cuenta habilitada
--  debe_cambiar_pass  | boolean            | Forzar cambio en siguiente login
--  intentos_fallidos  | integer            | Contador de intentos fallidos
--  bloqueado_hasta    | timestamp with tz  | Bloqueo temporal por intentos
--  ultimo_login       | timestamp with tz  | Último acceso exitoso
--  creado_en          | timestamp with tz  | Fecha de creación
--  modificado_en      | timestamp with tz  | Última modificación
```

**Usuarios actuales (verificados 07/03/2026):**
| Username | Rol | Activo | Debe cambiar pass |
|---|---|---|---|
| javier.hernandez@ircnl.gob.mx | ADMIN | ✅ | No |
| hector.garza@ircnl.gob.mx | DIRECTOR | ✅ | Sí |
| josemaria.urrutia@ircnl.gob.mx | DIRECTOR | ✅ | Sí |
| alma.reynoso@ircnl.gob.mx | SUPERVISOR | ✅ | Sí |
| lizeth.santillan@ircnl.gob.mx | SUPERVISOR | ✅ | Sí |
| patricia.deleon@ircnl.gob.mx | CONSULTA | ✅ | Sí |

> ⚠️ **PARA SPRINT 1 S1-2:** Agregar los 8 usuarios del equipo técnico (Fabián, Maximiliano,
> Juan Pablo, Carlos, Luis Ángel, Oscar, Sergio, Maricarmen) con roles apropiados.

#### Tabla `sesiones` — Gestión JWT
```sql
--  Columna      | Tipo               | Notas
--  id           | uuid               | PK — UUID generado
--  usuario_id   | integer            | FK → usuarios.id
--  token_hash   | text               | Hash del JWT (no se guarda el token en plano)
--  ip_origen    | inet               | IP del cliente
--  user_agent   | text               | Navegador/cliente
--  creado_en    | timestamp with tz  | Creación de la sesión
--  expira_en    | timestamp with tz  | Expiración del token
--  activa       | boolean            | Sesión vigente
```

#### Tabla `auditoria_accesos` — Log de eventos
```sql
--  Columna      | Tipo               | Notas
--  id           | integer            | PK
--  usuario_id   | integer            | FK → usuarios.id (null si login fallido)
--  username     | character varying  | Username intentado
--  evento       | character varying  | login_ok, login_fallido, logout, bloqueo, etc.
--  ip_origen    | inet               | IP del cliente
--  user_agent   | text               | Navegador/cliente
--  detalle      | text               | Información adicional
--  creado_en    | timestamp with tz  | Timestamp del evento
```

#### Tabla `tickets` — ⚠️ INVESTIGAR
```sql
-- Tabla con estructura IDÉNTICA a hubspot_tickets (mismas 37 columnas).
-- Posible tabla duplicada o alias. Investigar antes de Sprint 2 para
-- evitar confusión en los queries Dapper.
-- ACCIÓN: Javier Hernández debe confirmar si esta tabla se usa activamente
-- o si es un residuo del deploy v2.
```

### 5.4 Autenticación — Migración de Node.js a .NET (Sprint 1 S1-2)

> **[v1.3] DECISIÓN CERRADA:** JWT RS256 para Fase 2. Las tablas se migran a db_seguridad_acceso.

| Aspecto | Estado actual (Node.js) | Fase 2 (.NET) |
|---|---|---|
| **Algoritmo JWT** | HS256 (simétrico, `JWT_SECRET`) | **RS256 (asimétrico, par de llaves RSA 2048)** |
| **Tablas de auth** | En db_ircnl_main | **Migrar a db_seguridad_acceso** |
| **Bcrypt** | ✅ Hashes ya generados en `password_hash` | Compatible con BCrypt.Net-Next — reusar hashes |
| **Middleware** | `auth-middleware.js` en Node.js | Reimplementar en ASP.NET Core `[Authorize]` |
| **Sesiones** | Tabla `sesiones` con token_hash | Migrar tabla, implementar lógica en .NET |
| **Auditoría** | Tabla `auditoria_accesos` | Migrar tabla, registrar desde .NET |
| **Roles/permisos** | JSONB en tabla `roles` (8 tabs Fase 1) | Actualizar JSONB con tabs de Fase 2 |
| **Bloqueo por intentos** | Campos `intentos_fallidos` + `bloqueado_hasta` | Implementar lógica en .NET |

> **Impacto:** DT-01/02/03 cambian de alcance: no es "crear desde cero" sino "migrar y
> modernizar". Los hashes bcrypt existentes son compatibles. Los 6 usuarios se preservan
> y se agregan los 8 del equipo técnico.

#### Campos que requieren cifrado pgcrypto (LFPDPPP):
`nombre_persona_tramite`, `correo_solicitante`, `curp`, `expediente_catastral`

> **[v1.2] CORRECCIÓN vs v1.0:** Los campos reales son `nombre_persona_tramite` (no firstname/lastname),
> `correo_solicitante` (no email), `curp` (no curp_solicitante). No existen campos separados
> firstname/lastname — es un solo campo `nombre_persona_tramite`.

#### Discrepancias corregidas respecto a documentación anterior

| Lo que decía el Manual/Contexto Base | Realidad en el servidor |
|---|---|
| `folio_ircnl` | **`folio`** |
| `closedate` | **`closed_date`** |
| `email` | **`correo_solicitante`** |
| `firstname` / `lastname` | **`nombre_persona_tramite`** (un solo campo) |
| `curp_solicitante` | **`curp`** |
| `hubspot_owner_id` tipo bigint | **`hubspot_owner_id` tipo text** |
| `hs_time_to_first_rep_assignment` tipo interval | **tipo bigint (milisegundos)** |
| `municipio_clave`, `colonia_predio`, `codigo_postal` | **No existen como columnas** — ✅ RESUELTO: `expediente_municipio` + catálogo 51 mpios (ver 5.7) |
| `meta_poa_asociada` | **No existe como columna** — ✅ RESUELTO: regla de negocio calculada (ver 5.8) |
| Endpoint GET /crm/v3/objects/tickets | **POST /crm/v3/objects/tickets/search** |
| `db_seguridad_acceso` como base separada | **No existe aún — CREAR en Sprint 1, migrar tablas auth desde db_ircnl_main** |
| JWT RS256 (par de llaves) | **JWT HS256 actual → MIGRAR a RS256 en Sprint 1 (decisión cerrada)** |
| Auth por crear desde cero | **Tablas auth existentes (28/02/2026) — migrar a db_seguridad_acceso** |
| Ubuntu 20.04 EOL en .52 (DT-06) | **Ubuntu 24.04 LTS — DT-06 ya resuelta** |

> **[v1.3] RESOLUCIONES:** Los campos `municipio_clave` y `meta_poa_asociada` no requieren
> modificar el schema de `hubspot_tickets`. Se resuelven con:
> - **Geografía (Tab 5):** JOIN de `expediente_municipio` con catálogo de 51 municipios NL (Sección 5.7)
> - **POA (Tab 1):** Reglas de negocio que mapean campos HubSpot existentes a metas POA (Sección 5.8)

### 5.2 Tabla `sync_log` — Estructura REAL (13 columnas)

> **[v1.2] VERIFICADO** — Significativamente diferente a lo documentado en v1.0.

```sql
-- Tabla sync_log en db_ircnl_main — 13 columnas reales
-- El BackgroundService de Fase 2 DEBE escribir en esta misma estructura

--  #  | Columna              | Tipo PG                  | Notas
--  1  | id                   | bigint                   | PK autoincremental
--  2  | tipo                 | character varying        | 'carga_inicial' o 'incremental' o 'dotnet'
--  3  | inicio               | timestamp with time zone | Timestamp de inicio del ciclo
--  4  | fin                  | timestamp with time zone | Timestamp de fin del ciclo
--  5  | duracion_ms          | integer                  | Duración en milisegundos
--  6  | tickets_procesados   | integer                  | Total de tickets procesados
--  7  | tickets_nuevos       | integer                  | Tickets insertados por primera vez
--  8  | tickets_actualizados | integer                  | Tickets actualizados (upsert)
--  9  | tickets_error        | integer                  | Tickets con error en el ciclo
-- 10  | ultimo_ticket_id     | character varying        | ID del último ticket procesado
-- 11  | descripcion          | text                     | Descripción del ciclo
-- 12  | error_detalle        | text                     | Detalle del error (null si ok)
-- 13  | servidor             | character varying        | Hostname del servidor que ejecutó
```

```sql
-- Inserción de sync_log (replicar en BackgroundService):
INSERT INTO sync_log (tipo, inicio, descripcion, servidor)
VALUES ('dotnet', NOW(), 'Sincronización horaria Fase 2', 'srvu-cpan03')
RETURNING id;

-- Cierre del sync_log:
UPDATE sync_log SET
  fin = NOW(),
  duracion_ms = EXTRACT(EPOCH FROM (NOW() - inicio)) * 1000,
  tickets_procesados = $1,
  tickets_nuevos = $2,
  tickets_actualizados = $3,
  tickets_error = $4,
  ultimo_ticket_id = $5,
  error_detalle = $6
WHERE id = $7;
```

### 5.5 Regla de upsert del Worker

```sql
-- [v1.2] Lógica real extraída del worker.js
-- El worker usa POST /crm/v3/objects/tickets/search (NO GET)
-- con paginación por cursor (parámetro 'after') y ordenamiento
-- por hs_lastmodifieddate DESC.
-- Rangos mensuales Feb 2023 - Mar 2026 para carga inicial
-- (evita límite de 10,000 de HubSpot Search API).

INSERT INTO hubspot_tickets (id, subject, expediente_catastral, ...)
VALUES ($1, $2, $3, ...)
ON CONFLICT (id) DO UPDATE SET
  subject = EXCLUDED.subject,
  -- ... todos los campos excepto id ...
  synced_at = NOW();
```

### 5.6 Lógica de sincronización HubSpot (extraída del worker.js real)

```
Endpoint:     POST /crm/v3/objects/tickets/search
Auth:         Bearer $HUBSPOT_API_KEY
Properties:   TICKET_PROPS (35 campos — ver constante en Sección 5.1)
Paginación:   Cursor con parámetro 'after' en body JSON
Ordenamiento: hs_lastmodifieddate DESCENDING
Rate limit:   429 → retry con delay exponencial (MAX_RETRIES configurable)
Modos:
  - carga_inicial: rangos mensuales Feb 2023 - Mar 2026
  - incremental:   delta por hs_lastmodifieddate
```

### 5.7 Catálogo de Municipios de Nuevo León (51 registros)

> **[v1.3]** Fuente: Catálogo oficial IRCNL. Se crea como tabla en `db_poa_2026` (Sprint 2).
> El campo `expediente_municipio` de `hubspot_tickets` se vincula con `exp_sgc` de este catálogo.

```sql
-- Script: crear en db_poa_2026 durante Sprint 2 (S2-1)
CREATE TABLE catalogo_municipios_nl (
    id          serial PRIMARY KEY,
    municipio   text NOT NULL,           -- Nombre del municipio
    cve_inegi   varchar(10) NOT NULL,    -- Clave INEGI (ej: 19039 = Monterrey)
    exp_sgc     integer NOT NULL UNIQUE  -- Clave en Sistema de Gestión Catastral
);
-- 51 municipios: Abasolo(15), Agualeguas(11), Allende(13), ... Monterrey(70), ... Villaldama(60)
-- INSERT completo en script de migración 002_catalogo_municipios.sql
```

**Vinculación con hubspot_tickets:**
```sql
-- Para Tab 5 (Geografía de Demanda):
SELECT m.municipio, m.cve_inegi, COUNT(*) as total_tramites
FROM hubspot_tickets t
JOIN catalogo_municipios_nl m ON t.expediente_municipio::integer = m.exp_sgc
GROUP BY m.municipio, m.cve_inegi
ORDER BY total_tramites DESC;
```

**Los 51 municipios (referencia rápida):**
| exp_sgc | Municipio | cve_inegi | | exp_sgc | Municipio | cve_inegi |
|---|---|---|---|---|---|---|
| 70 | Monterrey | 19039 | | 28 | Guadalupe | 19026 |
| 17 | Apodaca | 19006 | | 33 | General Escobedo | 19021 |
| 58 | San Nicolás de los Garza | 19046 | | 31 | San Pedro Garza García | 19019 |
| 57 | Santa Catarina | 19048 | | 30 | García | 19018 |
| 42 | Juárez | 19031 | | 51 | Pesquería | 19041 |

> Los 51 registros completos se insertan en el script de migración SQL.

### 5.8 Mapa Campo HubSpot → Indicador POA 2026 (Reglas de negocio)

> **[v1.3]** Extraído del Tab POA 2026 de Fase 1 (tablero.ircnl.gob.mx).
> `meta_poa_asociada` NO es un campo almacenado en HubSpot — es un indicador **CALCULADO**
> a partir de campos existentes mediante reglas de negocio.

**3 Objetivos Estratégicos del POA 2026:**
| OE | Nombre | Indicadores clave |
|---|---|---|
| OE1 | Certeza y Seguridad Jurídica | -20% tiempo inscripción, 100% digitalización, -15% errores |
| OE2 | Modernizar Gestión Catastral | 5% actualización foto aérea, -1 día promedio, 14→16 municipios en SGC |
| OE3 | Transparencia y Rendición de Cuentas | 100% indicadores publicados, encuestas ciudadanas |

**Mapa de campos HubSpot → Meta POA:**

| Campo HubSpot | Indicador medible | Meta POA | Frecuencia | Tab destino |
|---|---|---|---|---|
| `time_to_close` | Tiempo promedio cierre por trámite | Meta 2.2 | Diaria | Tab 1, Tab 6 |
| `time_to_first_agent_reply` | Tiempo promedio primera respuesta | Meta 2.2 | Diaria | Tab 1, Tab 4 |
| `hs_pipeline_stage` | % tickets por etapa del pipeline | Meta 2.2 | Diaria | Tab 1 |
| `tramite_solicitado1` | Ranking de trámites más solicitados | Meta 2.2 | Semanal | Tab 1 |
| `expediente_municipio` | Distribución geográfica por municipio | Meta 2.3 | Mensual | Tab 1, Tab 5 |
| `closed_date` | Trámites resueltos por período | Meta 3.1 | Trimestral | Tab 1 |
| `hubspot_owner_id` | Productividad y carga por agente | OE2 | Semanal | Tab 1, Tab 4 |
| `hs_pipeline_stage='Rechazado'` | Tasa de rechazo por tipo de trámite | Meta 1.3 | Mensual | Tab 1 |
| `hs_form_id` | Uso canales: Mi Portal vs Sitio Web | Meta 2.2.3 | Mensual | Tab 1, Tab 7 |

> **Para Claude Code:** El Tab 1 (Monitor POA 2026) no hace un simple SELECT de un campo.
> Debe implementar queries que calculen cada indicador a partir de los campos existentes
> y los compare contra las metas numéricas definidas en `db_poa_2026.metas_poa`.

---

## 6. ESTRUCTURA DEL PROYECTO .NET

```
/tablero/                          ← raíz del repositorio
├── .claudeignore                  ← exclusiones de seguridad
├── CLAUDE.md                      ← este documento
├── .env.example                   ← [📋 crear en S1-1] variables sin valores
├── fase1/                         ← ⛔ NO TOCAR (Fase 1 en producción)
│   └── ...
└── fase2/                         ← directorio de trabajo de Fase 2
    ├── IRCNL.Tablero.sln
    ├── IRCNL.Api/                 ← ASP.NET Core 8 WebAPI
    │   ├── Controllers/
    │   ├── Middleware/            ← JWT, rate limiting, error handling
    │   ├── Program.cs
    │   └── appsettings.json       ← sin secrets — solo configuración no sensible
    ├── IRCNL.Worker/              ← BackgroundService HubSpot
    │   ├── Services/
    │   │   └── HubSpotSyncService.cs
    │   └── Program.cs
    ├── IRCNL.Blazor/              ← Blazor Server (Frontend)
    │   ├── Pages/
    │   │   ├── Tabs/              ← un componente por tab del tablero
    │   │   └── Auth/
    │   └── Program.cs
    ├── IRCNL.Shared/              ← Modelos, DTOs, Repositorios Dapper
    │   ├── Models/
    │   ├── DTOs/
    │   ├── Repositories/          ← Dapper — SQL explícito
    │   └── Migrations/            ← EF Core migrations
    ├── IRCNL.Tests/               ← Proyecto de pruebas — ver Sección 8.1
    │   ├── Unit/
    │   ├── Integration/
    │   └── IRCNL.Tests.csproj
    └── migrations/                ← Scripts SQL versionados (.sql numerados)
        ├── 001_create_db_seguridad_acceso.sql   ← Sprint 1: crear DB + migrar tablas auth
        ├── 002_create_db_poa_2026.sql
        ├── 003_catalogo_municipios_nl.sql       ← [v1.3] 51 municipios de NL
        ├── 004_enable_timescaledb.sql
        └── ...
```

---

## 7. VARIABLES DE ENTORNO REQUERIDAS

**⛔ NUNCA en código fuente. SIEMPRE en `.env` o GitHub Secrets.**

El archivo `.env` debe existir en el servidor pero NUNCA en el repositorio.
**El archivo `.env.example` (sin valores) DEBE crearse como entregable del Sprint 1, Sesión S1-1.**

```bash
# ─── HubSpot ───────────────────────────────────────────────────
HUBSPOT_API_KEY=             # Bearer token para POST /crm/v3/objects/tickets/search

# ─── Base de datos ─────────────────────────────────────────────
# [v1.2] Usuario real de aplicación: usr_ircnl_prod (NO administrator)
DATABASE_URL=                # postgresql://usr_ircnl_prod:pass@10.150.111.53:5432/db_ircnl_main
DATABASE_URL_POA=            # postgresql://usr_ircnl_prod:pass@10.150.111.53:5432/db_poa_2026
DATABASE_URL_CATASTRO=       # postgresql://usr_ircnl_prod:pass@10.150.111.53:5432/db_catastro_tramites
DATABASE_URL_SEGURIDAD=      # [v1.3] postgresql://usr_ircnl_prod:pass@10.150.111.53:5432/db_seguridad_acceso
DATABASE_URL_SALUD=          # postgresql://usr_ircnl_prod:pass@10.150.111.53:5432/db_salud_integral

# ─── Variables legacy del worker.js (referencia) ──────────────
# El worker.js original usa estas variables separadas:
# DB_HOST=10.150.111.53  DB_PORT=5432  DB_NAME=db_ircnl_main
# DB_USER=usr_ircnl_prod  DB_PASS=<contraseña>
# El BackgroundService debe soportar AMBOS formatos durante la migración.

# ─── JWT (RS256 — DECISIÓN CERRADA v1.3) ──────────────────────
# [v1.3] Migración de HS256 (Node.js) → RS256 (ASP.NET Core)
# Generar par de llaves: openssl genrsa -out jwt_private.pem 2048
#                        openssl rsa -in jwt_private.pem -pubout -out jwt_public.pem
JWT_PRIVATE_KEY=             # Llave privada RSA 2048 bits (PEM, una línea)
JWT_PUBLIC_KEY=              # Llave pública RSA 2048 bits (PEM, una línea)
JWT_ISSUER=tablero.ircnl.gob.mx
JWT_AUDIENCE=tablero-api
JWT_EXPIRY_MINUTES=480       # 8 horas

# ─── pgcrypto (LFPDPPP) ───────────────────────────────────────
PGCRYPTO_KEY=                # Clave simétrica para cifrado de datos personales

# ─── Redis ─────────────────────────────────────────────────────
REDIS_CONNECTION=10.150.111.52:6379
REDIS_PASSWORD=              # Contraseña de Redis — configurada con requirepass en S2-4

# ─── Worker ────────────────────────────────────────────────────
HUBSPOT_SYNC_INTERVAL_HOURS=1

# ─── Runtime ───────────────────────────────────────────────────
ASPNETCORE_ENVIRONMENT=Production   # o Development en .54
ASPNETCORE_URLS=http://+:5000       # 5001 en nodo .54
```

---

## 8. CONVENCIONES DE CÓDIGO

### Idioma
- **Comentarios en código:** español
- **Nombres de métodos/clases:** PascalCase en C# (convención .NET estándar)
- **Nombres de tablas/columnas SQL:** snake_case (hubspot_tickets, sync_log)
- **Variables en código:** camelCase en C#

### 8.1 Estrategia de Testing

| Aspecto | Decisión |
|---|---|
| **Framework** | xUnit (estándar .NET) |
| **Proyecto** | `fase2/IRCNL.Tests/` — referencia a IRCNL.Api, IRCNL.Worker, IRCNL.Shared |
| **Pruebas unitarias** | `IRCNL.Tests/Unit/` — repositorios Dapper, servicios, helpers |
| **Pruebas de integración** | `IRCNL.Tests/Integration/` — `WebApplicationFactory` para endpoints HTTP |
| **Base de datos de test** | SQLite in-memory o `Testcontainers` para PostgreSQL |
| **Cobertura mínima** | 70% en controllers (exigido desde Sprint 3, S3-3) |
| **Ejecución** | `dotnet test /fase2/` — debe pasar antes de declarar tarea completa |
| **Patrones** | Arrange-Act-Assert, una aserción por test, nombres descriptivos en español |

```csharp
// Ejemplo de nombre de test correcto:
[Fact]
public async Task ObtenerAvancePoa_SinToken_Retorna401()
{
    // Arrange
    var client = _factory.CreateClient();
    // Act
    var response = await client.GetAsync("/api/poa/avance");
    // Assert
    Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
}
```

### Seguridad (obligatorio en todo endpoint)
```csharp
// ✅ CORRECTO — validar siempre en servidor
[HttpGet("tickets")]
[Authorize]  // JWT requerido
public async Task<IActionResult> GetTickets([FromQuery] TicketFiltros filtros)
{
    // Validar inputs antes de usar
    if (!ModelState.IsValid) return BadRequest(ModelState);
    // ...
}

// ❌ NUNCA — confiar en el cliente
public async Task<IActionResult> GetTickets(string rawSql) // SQL injection directo
```

### Connection strings
```csharp
// ✅ CORRECTO
var connectionString = _configuration["DATABASE_URL"];

// ❌ NUNCA
var connectionString = "Host=10.150.111.53;Database=db_ircnl_main;Password=mipassword";
```

### Commits
```
feat: agregar endpoint GET /api/tickets con filtro por municipio
fix: corregir paginación cursor en HubSpotSyncService
refactor: extraer lógica de cifrado a CryptoHelper
docs: actualizar CLAUDE.md con instrucciones de Sprint 2
test: agregar pruebas de integración para authMiddleware
```

### Branches
```
feature/s1-scaffold-dotnet
feature/s1-jwt-middleware
feature/s1-background-worker
feature/s2-db-poa-2026
# Patrón: feature/s{sprint}-{descripcion-corta}
```

---

## 9. DEUDA TÉCNICA ACTIVA (Actualizada con verificación real)

| ID | Descripción | Sprint | Estado |
|---|---|---|---|
| **DT-01** | JWT desactivado — authMiddleware en Node.js con bypass | Sprint 1 | 🔴 PENDIENTE — migrar a .NET, tablas de auth ya existen |
| **DT-02** | Bypass auth en frontend — index.html carga sin validar token | Sprint 1 | 🔴 PENDIENTE — Blazor Server elimina este problema por diseño |
| **DT-03** | Bcrypt desactivado en producción | Sprint 1 | 🔴 PENDIENTE — hashes bcrypt ya existen en tabla `usuarios`, reimplementar validación en .NET |
| DT-04 | Nodo .51 rama develop zombi | Sprint 1 | 🟠 PENDIENTE |
| DT-05 | 126,647 registros sin `folio` (campo real, no folio_ircnl) | Sprint 2 | 🟠 PENDIENTE |
| ~~DT-06~~ | ~~Ubuntu 20.04 EOL en Nodo .52~~ | ~~Sprint 1~~ | ✅ **RESUELTA** — .52 ya tiene Ubuntu 24.04 LTS |
| DT-07 | Nodos .50/.51 sin HTTPS interno | Sprint 6 | 🟡 PENDIENTE |
| DT-08 | 3,926 registros sin `expediente_catastral` | Sprint 2 | 🟡 PENDIENTE |
| **DT-09** | Cifrado LFPDPPP pendiente — CURP y datos personales | Sprint 2 | 🔴 PENDIENTE — pgcrypto ya instalada, falta cifrar datos |
| **DT-10** | **[v1.2]** Tabla `tickets` duplicada en db_ircnl_main — investigar si se usa | Sprint 1 | 🟡 PENDIENTE |
| **DT-11** | **[v1.2]** TimescaleDB no instalado en PostgreSQL — instalar paquete | Pre-Sprint 2 | 🟠 PENDIENTE |
| **DT-12** | **[v1.2]** pgaudit no disponible en PostgreSQL — instalar paquete | Pre-Sprint 6 | 🟡 PENDIENTE |
| ~~DT-13~~ | ~~Campos `municipio_clave`, `meta_poa_asociada` no existen~~ | ~~Pre-Sprint 2~~ | ✅ **RESUELTA v1.3** — municipio vía `expediente_municipio` + catálogo; POA = reglas de negocio |
| **DT-14** | **[v1.2]** Permisos JSONB en tabla `roles` referencian tabs de Fase 1 — actualizar para Fase 2 | Sprint 1 | 🟠 PENDIENTE |
| **DT-15** | **[v1.3]** Migrar 4 tablas auth de db_ircnl_main → db_seguridad_acceso | Sprint 1 | 🔴 PENDIENTE |

**Regla:** No avanzar a Sprint 2 sin que DT-01, DT-02 y DT-03 estén resueltos y validados.
**Regla adicional:** DT-15 (migración auth a db_seguridad_acceso) debe completarse dentro de Sprint 1.

---

## 10. FLUJO DE TRABAJO CON CLAUDE CODE

### Inicio de cada sesión
Claude Code debe comenzar cada sesión verificando el estado del repositorio:

```bash
# Verificar rama actual y estado
git status
git log --oneline -5

# Verificar servicios activos en el nodo de trabajo
systemctl status ircnl-api.service 2>/dev/null || echo "Servicio no existe aún"
systemctl status ircnl-worker.service 2>/dev/null || echo "Servicio no existe aún"
```

### Al completar una tarea
Antes de declarar una tarea completa, Claude Code verifica:

```bash
dotnet build                    # Sin errores
dotnet test                     # Sin fallos
git grep -rn "password\|secret\|api_key\|HUBSPOT_API" --include="*.cs" --include="*.json"
# El resultado debe estar vacío (sin credenciales en código)
```

### Comandos de smoke test por componente

```bash
# API (Nodo .52 o .54)
curl -s http://localhost:5000/api/health
# Esperado: {"status":"healthy","timestamp":"...","version":"2.0.0"}

# Worker (verificar ciclo reciente — usar estructura sync_log REAL)
ssh administrator@10.150.111.53 "sudo -i -u postgres psql -d db_ircnl_main -c \"SELECT tipo, tickets_procesados, tickets_error, fin FROM sync_log ORDER BY fin DESC LIMIT 3;\""

# Redis (cuando esté instalado, Sprint 2+)
redis-cli -a $REDIS_PASSWORD ping
# Esperado: PONG

# PostgreSQL (desde Nodo .53)
ssh administrator@10.150.111.53 "sudo -i -u postgres psql -d db_ircnl_main -c \"SELECT COUNT(*) FROM hubspot_tickets;\""
# Esperado: 131285 (o más, nunca menos)
```

---

## 11. TABLERO — 8 TABS DE FASE 2

Cada tab tiene un endpoint REST dedicado en la API y un componente Blazor:

| Tab | Nombre | Endpoint API | Componente Blazor | Campo clave en DB |
|---|---|---|---|---|
| 1 | Monitor POA 2026 | `GET /api/poa/avance` | `Pages/Tabs/TabPOA.razor` | ✅ Reglas calculadas (Sección 5.8) |
| 2 | Expediente Maestro | `GET /api/tickets/{id}` | `Pages/Tabs/TabExpediente.razor` | `id` (hs_object_id) |
| 3 | Calidad de Datos | `GET /api/calidad/resumen` | `Pages/Tabs/TabCalidad.razor` | `folio`, `expediente_catastral` |
| 4 | Productividad Agentes | `GET /api/agentes/ranking` | `Pages/Tabs/TabAgentes.razor` | `hubspot_owner_id` |
| 5 | Geografía de Demanda | `GET /api/geografia/municipios` | `Pages/Tabs/TabGeografia.razor` | ✅ `expediente_municipio` + catálogo (Sección 5.7) |
| 6 | Cuellos de Botella SLA | `GET /api/sla/analisis` | `Pages/Tabs/TabSLA.razor` | `time_to_close`, SLA fields |
| 7 | Canales de Atención | `GET /api/canales/comparativa` | `Pages/Tabs/TabCanales.razor` | `hs_form_id` |
| 8 | Generador Reportes | `POST /api/reportes/generar` | `Pages/Tabs/TabReportes.razor` | Todos |

### Criterio de accesibilidad (transversal desde Sprint 4):
Todos los tabs deben cumplir **WCAG 2.1 AA** — validar con Axe DevTools antes de aprobar PR.

---

## 12. EQUIPO — REFERENCIA RÁPIDA

| Rol | Persona | Empresa | Nota para Claude Code | Brecha |
|---|---|---|---|---|
| Arquitecto / Aprobador | Javier Hernández | IRCNL | Autoriza cambios de arquitectura | — |
| Tech Lead | Fabián Arredondo | DALTUM | Aprueba PRs y decisiones técnicas | — |
| Co-Lead IRCNL | Maximiliano Álvarez | IRCNL | Responsable JWT/bcrypt (DT-01/02/03) | — |
| Backend Senior | Juan Pablo Gutiérrez | DALTUM | EF Core, queries complejas | — |
| Backend Mid | Carlos Vergara | DALTUM | OWASP, seguridad de endpoints | — |
| Backend Mid | Luis Ángel Covarrubias | IRCNL | Conocimiento negocio catastral | ⚠️ OWASP 2/5 — refuerzo antes de Sprint 2 |
| QA / Soporte | Oscar Frías | DALTUM | Pruebas, Blazor básico | — |
| Junior | Sergio Noé Asencio | IRCNL | Onboarding .NET — tareas supervisadas | En capacitación 6-8 semanas |
| DBA | Maricarmen Valdez | IRCNL | PostgreSQL, TimescaleDB, LFPDPPP | ⚠️ LFPDPPP/pgcrypto 2/5 — capacitación antes de Sprint 2 |

---

## 13. RESPUESTAS A SITUACIONES FRECUENTES

### "No sé qué tarea hacer ahora"
Revisar el Plan de Trabajo Fase 2. Preguntar: ¿En qué sprint estamos? ¿Qué tareas están pendientes en ese sprint?

### "Encontré un bug en el código de Fase 1"
NO modificar el código de Fase 1. Documentarlo como issue en GitHub y notificar al Tech Lead.

### "La base de datos no responde"
```bash
# Verificar desde Nodo .50
ssh administrator@10.150.111.53 "sudo -i -u postgres psql -c 'SELECT 1;'" 2>/dev/null || echo "PG no responde"
# Si no responde, escalar a Maricarmen Valdez
```

### "Necesito hacer un cambio de arquitectura"
Detener. Documentar la propuesta. Presentarla a Javier Hernández para aprobación antes de implementar.

### "¿Puedo hacer push a main/master?"
No. Nunca push directo. Siempre Pull Request con revisión del Tech Lead.

### "Necesito datos del worker.js original"
NO leer el archivo directamente (está en actions-runner/, excluido por .claudeignore). Usar la tabla de 37 campos de la Sección 5.1 y la constante TICKET_PROPS de este documento como fuente de verdad.

### "¿Cómo conecto a PostgreSQL manualmente?"
```bash
# Desde Nodo .53 como usuario postgres:
sudo -i -u postgres psql -d db_ircnl_main
# Desde la aplicación .NET vía TCP:
# Host=10.150.111.53;Port=5432;Database=db_ircnl_main;Username=usr_ircnl_prod;Password=<env>
```

---

## 14. TTLs DE CACHÉ REDIS (Referencia para Repositorios Dapper)

| Tipo de dato | TTL | Ejemplo |
|---|---|---|
| Datos operativos (tickets, conteos) | 5 minutos | Tab 3 Calidad, Tab 4 Agentes |
| Datos históricos (series de tiempo) | 1 hora | Tab 1 POA, Tab 6 SLA |
| Reportes generados | 30 minutos | Tab 8 Generador |

---

*Última actualización: 07/03/2026 — CLAUDE.md v1.2 — Verificado contra servidores reales*
*Sincronizado con: Manual de Arquitectura IRCNL v1.10 + Plan de Trabajo Fase 2 (06/03/2026)*
*Fuentes de verificación: worker.js real, information_schema de PostgreSQL, estado de nodos vía SSH*
