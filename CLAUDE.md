# CLAUDE.md — Sistema de Tablero IRCNL / ATLAS Dashboard
## Contexto Maestro para Claude Code — Fase 2 | v1.3-compact | 07/03/2026

> Fuente de verdad para Claude Code. Verificado contra servidores reales.

## 1. IDENTIDAD

| Atributo | Valor |
|---|---|
| **Nombre** | Sistema de Tablero IRCNL / ATLAS Dashboard |
| **Institución** | Instituto Registral y Catastral del Estado de Nuevo León (IRCNL) |
| **Fase activa** | Fase 2 — Centro de Inteligencia Catastral |
| **Repo** | `git@github.com:pteinteractive/tablero.git` |
| **Rama protegida** | `master` / `main` — NUNCA push directo |
| **Manual vigente** | Manual_Arquitectura_IRCNL_v1.10.docx |
| **Marco** | CETH v3.0 |
| **URLs** | Prod: `tablero.ircnl.gob.mx` → .50 / Dev: `dev-tablero.ircnl.gob.mx` → .54 |

**Objetivo:** Dashboard ejecutivo que consolida 131,285 tickets catastrales (HubSpot CRM) alineados al POA 2026.

---

## 2. ROL DE CLAUDE CODE

Ejecutor técnico principal de Fase 2: escribe código, ejecuta comandos SSH, valida contra Definition of Done. **No improvisa arquitectura** — si no está aquí, pregunta antes.

**NO hacer sin aprobación:** modificar Nodo .50, push a main, borrar tablas en db_ircnl_main, cambiar puertos/firewall, hardcodear credenciales.

### Cuándo escalar a humano

| Situación | Acción |
|---|---|
| Código Fase 1 necesita cambio | DETENER → Javier Hernández |
| Cambio schema db_ircnl_main | DETENER → Maricarmen + Javier |
| Error compilación 3+ intentos | Pausar → Fabián Arredondo |
| Discrepancia sync_log | DETENER sync → Javier Hernández |
| Reiniciar PostgreSQL .53 | Notificar → Maricarmen Valdez |
| Variable .env faltante | Solicitar → responsable (Sección 7) |
| Cambio de arquitectura | DETENER → documentar → Javier |

---

## 3. INFRAESTRUCTURA (Verificada 07/03/2026)

```
Internet → [.158] Nginx Proxy Manager (SSL) → .50:80
  /api/* → .52:3000 (cambiar a 5000 en Sprint 1)
  Proxy 91 → tablero.ircnl.gob.mx → .50
  Proxy 92 → dev-tablero.ircnl.gob.mx → .54

[.50] AlmaLinux 10.1 | 15Gi | Frontend Prod + Nodo Maestro SSH | ⛔ NO TOCAR hasta S7
[.51] AlmaLinux 9    | 15Gi | ⚠️ Zombi rama develop — ignorar
[.52] Ubuntu 24.04   | 15Gi | API .NET + Worker | PM2 "api-ircnl" activo | .NET SDK: ❌ instalar S1
[.53] AlmaLinux 9    | 14Gi | PostgreSQL 16 | pgcrypto ✅ | TimescaleDB ❌ | pgaudit ❌
[.54] Ubuntu 24.04   | 7.8Gi | Sandbox dev | .NET SDK: ❌ instalar S1 | Puerto 5001
```

**SSH:** Nodo maestro `administrator@10.150.111.50`, RSA 4096, acceso sin pass a .51-.54
**PostgreSQL:** Usuario app = `usr_ircnl_prod` (NO administrator). Admin: `sudo -i -u postgres psql`

---

## 4. STACK (CERRADO)

API: ASP.NET Core 8 | Worker: BackgroundService .NET 8 | Frontend: Blazor Server | ORM: Dapper + EF Core 8 | DB: PostgreSQL 16 | Cache: Redis 7 (instalar S2) | TimescaleDB 2.x (instalar pre-S2) | pgcrypto 1.3 (✅ instalada) | Excel: ClosedXML | PDF: QuestPDF | Test: xUnit | CI/CD: GitHub Actions (.52)

**Descartados:** React/Next.js, Laravel, Python/FastAPI, Node.js/PM2

---

## 5. BASES DE DATOS (.53)

```
PostgreSQL 16 @ 10.150.111.53 | User: usr_ircnl_prod

db_ircnl_main          ← ⛔ NO modificar schema
├── hubspot_tickets    ← 131,285 tickets (37 cols) — ver 5.1
├── tickets            ← ⚠️ duplicada — investigar (DT-10)
├── sync_log           ← 13 cols — ver 5.2
├── roles              ← migrar a db_seguridad_acceso (S1)
├── usuarios           ← migrar a db_seguridad_acceso (S1)
├── sesiones           ← migrar a db_seguridad_acceso (S1)
├── auditoria_accesos  ← migrar a db_seguridad_acceso (S1)
└── pgcrypto ✅

db_seguridad_acceso    ← CREAR S1, migrar 4 tablas auth
db_salud_integral      ← metricas_nodos (existe)
db_poa_2026            ← CREAR S2 + TimescaleDB + catalogo_municipios_nl
db_catastro_tramites   ← CREAR S2
```

### 5.1 hubspot_tickets — 37 CAMPOS REALES

```
 #  | Columna                              | Tipo PG          | HubSpot prop                         | Notas
 1  | id (PK)                              | varchar          | hs_object_id                         |
 2  | subject                              | text             | subject                              |
 3  | expediente_catastral                 | text             | expediente_catastral                 | 🔒LFPDPPP ⚠️3,926 vacíos
 4  | expediente_municipio                 | text             | expediente_municipio                 | Vincula con catálogo municipios
 5  | folio                                | text             | folio                                | ⚠️126,647 vacíos (DT-05)
 6  | nombre_persona_tramite               | text             | nombre_persona_tramite               | 🔒LFPDPPP
 7  | correo_solicitante                   | text             | correo_solicitante                   | 🔒LFPDPPP
 8  | curp                                 | text             | curp                                 | 🔒LFPDPPP
 9  | tramite_solicitado1                  | text             | tramite_solicitado1                  |
10  | tipo_tramite                         | text             | tipo_tramite                         |
11  | es_masiva                            | boolean          | es_masiva                            |
12  | hs_pipeline                          | text             | hs_pipeline                          |
13  | hs_pipeline_stage                    | text             | hs_pipeline_stage                    |
14  | hubspot_owner_id                     | text             | hubspot_owner_id                     | text NO bigint
15  | hubspot_owner_assigneddate           | timestamptz      | hubspot_owner_assigneddate           |
16  | hubspot_team_id                      | text             | hubspot_team_id                      |
17  | createdate                           | timestamptz      | createdate                           |
18  | closed_date                          | timestamptz      | closed_date                          | OJO: "closed_date" NO "closedate"
19  | first_agent_reply_date               | timestamptz      | first_agent_reply_date               |
20  | last_reply_date                      | timestamptz      | last_reply_date                      |
21  | hs_last_message_received_at          | timestamptz      | hs_last_message_received_at          |
22  | hs_last_message_sent_at              | timestamptz      | hs_last_message_sent_at              |
23  | time_to_close                        | bigint           | time_to_close                        | milisegundos
24  | time_to_first_agent_reply            | bigint           | time_to_first_agent_reply            | milisegundos
25  | hs_time_to_first_rep_assignment      | bigint           | hs_time_to_first_rep_assignment      | bigint NO interval
26  | hs_time_to_first_response_sla_status | text             | hs_time_to_first_response_sla_status |
27  | hs_time_to_close_sla_status          | text             | hs_time_to_close_sla_status          |
28  | hs_num_times_contacted               | integer          | hs_num_times_contacted               |
29  | num_notes                            | integer          | num_notes                            |
30  | hs_form_id                           | text             | hs_form_id                           |
31  | tiempos                              | text             | tiempos                              |
32  | nombredia                            | text             | nombredia                            |
33  | solicitud                            | text             | solicitud                            |
34  | ine_ticket                           | text             | ine_ticket                           |
35  | content                              | text             | content                              |
36  | hs_lastmodifieddate                  | timestamptz      | hs_lastmodifieddate                  |
37  | synced_at                            | timestamptz      | — (local)                            |
```

**TICKET_PROPS para BackgroundService (copiar tal cual):**
```
subject,expediente_catastral,expediente_municipio,folio,nombre_persona_tramite,correo_solicitante,curp,tramite_solicitado1,tipo_tramite,es_masiva,hs_pipeline,hs_pipeline_stage,hubspot_owner_id,hubspot_owner_assigneddate,hubspot_team_id,createdate,closed_date,first_agent_reply_date,last_reply_date,hs_last_message_received_at,hs_last_message_sent_at,time_to_close,time_to_first_agent_reply,hs_time_to_first_rep_assignment,hs_time_to_first_response_sla_status,hs_time_to_close_sla_status,hs_num_times_contacted,num_notes,hs_form_id,tiempos,nombredia,solicitud,ine_ticket,content,hs_lastmodifieddate
```

**Cifrar LFPDPPP:** `nombre_persona_tramite`, `correo_solicitante`, `curp`, `expediente_catastral`

**Endpoint HubSpot:** `POST /crm/v3/objects/tickets/search` (NO GET). Paginación cursor (`after`). Ordenamiento `hs_lastmodifieddate DESC`. Rate limit 429 con retry.

**Upsert:** `INSERT INTO hubspot_tickets (...) ON CONFLICT (id) DO UPDATE SET ... synced_at = NOW();`

### 5.2 sync_log — 13 columnas reales

```
id(bigint PK), tipo(varchar), inicio(timestamptz), fin(timestamptz), duracion_ms(int),
tickets_procesados(int), tickets_nuevos(int), tickets_actualizados(int), tickets_error(int),
ultimo_ticket_id(varchar), descripcion(text), error_detalle(text), servidor(varchar)
```

### 5.3 Auth (migrar de db_ircnl_main → db_seguridad_acceso en S1)

**roles:** id, nombre(ADMIN/DIRECTOR/SUPERVISOR/CONSULTA), descripcion, permisos(jsonb), creado_en
**usuarios:** id, username(email), nombre_completo, password_hash(bcrypt), rol_id(FK), activo, debe_cambiar_pass, intentos_fallidos, bloqueado_hasta, ultimo_login, creado_en, modificado_en
**sesiones:** id(uuid), usuario_id(FK), token_hash, ip_origen(inet), user_agent, creado_en, expira_en, activa
**auditoria_accesos:** id, usuario_id, username, evento, ip_origen(inet), user_agent, detalle, creado_en

6 usuarios existentes: javier.hernandez(ADMIN), hector.garza/josemaria.urrutia(DIRECTOR), alma.reynoso/lizeth.santillan(SUPERVISOR), patricia.deleon(CONSULTA)

**JWT:** Actual = HS256. Fase 2 = **RS256** (decisión cerrada). Bcrypt hashes existentes son compatibles con BCrypt.Net-Next.

### 5.4 Municipios NL — 51 registros

Tabla `catalogo_municipios_nl` en db_poa_2026: id, municipio, cve_inegi(varchar), exp_sgc(int UNIQUE).
Vinculación: `hubspot_tickets.expediente_municipio::integer = catalogo_municipios_nl.exp_sgc`
Principales: Monterrey(70), Guadalupe(28), Apodaca(17), San Nicolás(58), Escobedo(33), San Pedro(31), Santa Catarina(57), García(30), Juárez(42).

### 5.5 POA 2026 — Reglas de negocio (no campo HubSpot)

| Campo HubSpot | Indicador | Meta POA | Tab |
|---|---|---|---|
| time_to_close | Tiempo cierre | Meta 2.2 | 1,6 |
| time_to_first_agent_reply | Tiempo respuesta | Meta 2.2 | 1,4 |
| hs_pipeline_stage | % por etapa | Meta 2.2 | 1 |
| tramite_solicitado1 | Ranking trámites | Meta 2.2 | 1 |
| expediente_municipio | Distribución geográfica | Meta 2.3 | 1,5 |
| closed_date | Resueltos por período | Meta 3.1 | 1 |
| hubspot_owner_id | Productividad agente | OE2 | 1,4 |
| hs_pipeline_stage='Rechazado' | Tasa rechazo | Meta 1.3 | 1 |
| hs_form_id | Canales Mi Portal vs Web | Meta 2.2.3 | 1,7 |

---

## 6. ESTRUCTURA PROYECTO .NET

```
/tablero/
├── .claudeignore
├── CLAUDE.md
├── .env.example           ← crear en S1-1
├── fase1/                 ← ⛔ NO TOCAR
└── fase2/
    ├── IRCNL.Tablero.sln
    ├── IRCNL.Api/         ← WebAPI (Controllers/, Middleware/, Program.cs)
    ├── IRCNL.Worker/      ← BackgroundService (Services/HubSpotSyncService.cs)
    ├── IRCNL.Blazor/      ← Blazor Server (Pages/Tabs/, Pages/Auth/)
    ├── IRCNL.Shared/      ← Models/, DTOs/, Repositories/ (Dapper), Migrations/ (EF)
    ├── IRCNL.Tests/       ← Unit/, Integration/ (xUnit, 70% cobertura desde S3)
    └── migrations/        ← Scripts SQL numerados (001_, 002_, ...)
```

---

## 7. VARIABLES .ENV

```bash
HUBSPOT_API_KEY=             # Bearer token POST /crm/v3/objects/tickets/search
DATABASE_URL=                # postgresql://usr_ircnl_prod:pass@10.150.111.53:5432/db_ircnl_main
DATABASE_URL_POA=            # ...db_poa_2026
DATABASE_URL_CATASTRO=       # ...db_catastro_tramites
DATABASE_URL_SEGURIDAD=      # ...db_seguridad_acceso
DATABASE_URL_SALUD=          # ...db_salud_integral
JWT_PRIVATE_KEY=             # RSA 2048 PEM (RS256)
JWT_PUBLIC_KEY=              # RSA 2048 PEM (RS256)
JWT_ISSUER=tablero.ircnl.gob.mx
JWT_AUDIENCE=tablero-api
JWT_EXPIRY_MINUTES=480
PGCRYPTO_KEY=                # Clave simétrica cifrado LFPDPPP
REDIS_CONNECTION=10.150.111.52:6379
REDIS_PASSWORD=              # requirepass S2-4
HUBSPOT_SYNC_INTERVAL_HOURS=1
ASPNETCORE_ENVIRONMENT=Production    # Development en .54
ASPNETCORE_URLS=http://+:5000       # 5001 en .54
# Legacy worker.js: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS (soportar ambos en migración)
```

---

## 8. CONVENCIONES

**Código:** Comentarios español | Clases PascalCase | tablas snake_case | variables camelCase
**Seguridad:** [Authorize] en todo endpoint | FluentValidation | nunca confiar en cliente
**Commits:** `feat:` `fix:` `refactor:` `docs:` `test:`
**Branches:** `feature/s{sprint}-{descripcion}`
**Testing:** xUnit, Arrange-Act-Assert, nombres en español, WebApplicationFactory para integración
**Redis TTLs:** Operativos 5min | Históricos 1h | Reportes 30min
**WCAG:** 2.1 AA transversal desde Sprint 4

---

## 9. DEUDA TÉCNICA

| ID | Descripción | Sprint | Estado |
|---|---|---|---|
| **DT-01** | JWT desactivado — migrar auth de Node.js a .NET | S1 | 🔴 |
| **DT-02** | Bypass frontend — Blazor Server lo elimina | S1 | 🔴 |
| **DT-03** | Bcrypt desactivado — reimplementar en .NET (hashes existentes compatibles) | S1 | 🔴 |
| DT-04 | Nodo .51 zombi | S1 | 🟠 |
| DT-05 | 126,647 sin `folio` | S2 | 🟠 |
| ~~DT-06~~ | ~~Ubuntu EOL .52~~ | — | ✅ Resuelta (24.04) |
| DT-07 | Sin HTTPS interno .50/.51 | S6 | 🟡 |
| DT-08 | 3,926 sin expediente_catastral | S2 | 🟡 |
| **DT-09** | Cifrado LFPDPPP pendiente (pgcrypto instalada) | S2 | 🔴 |
| DT-10 | Tabla `tickets` duplicada — investigar | S1 | 🟡 |
| DT-11 | TimescaleDB no instalado | Pre-S2 | 🟠 |
| DT-12 | pgaudit no disponible | Pre-S6 | 🟡 |
| ~~DT-13~~ | ~~municipio_clave/meta_poa~~ | — | ✅ Resuelta |
| DT-14 | Permisos JSONB roles → actualizar tabs Fase 2 | S1 | 🟠 |
| DT-15 | Migrar 4 tablas auth → db_seguridad_acceso | S1 | 🔴 |

**Regla:** No avanzar a S2 sin DT-01/02/03 resueltos. DT-15 en S1.

---

## 10. FLUJO DE TRABAJO

**Inicio sesión:** `git status && git log --oneline -5`
**Completar tarea:** `dotnet build && dotnet test && git grep -rn "password\|secret\|api_key" --include="*.cs" --include="*.json"`
**Smoke tests:** API: `curl localhost:5000/api/health` | Redis: `redis-cli -a $REDIS_PASSWORD ping` | PG: `SELECT COUNT(*) FROM hubspot_tickets;` (esperado: ≥131285)

---

## 11. TABLERO — 8 TABS FASE 2

| Tab | Nombre | Endpoint | Componente | Campo clave |
|---|---|---|---|---|
| 1 | Monitor POA 2026 | GET /api/poa/avance | TabPOA.razor | Reglas calculadas (5.5) |
| 2 | Expediente Maestro | GET /api/tickets/{id} | TabExpediente.razor | id |
| 3 | Calidad Datos | GET /api/calidad/resumen | TabCalidad.razor | folio, expediente_catastral |
| 4 | Productividad Agentes | GET /api/agentes/ranking | TabAgentes.razor | hubspot_owner_id |
| 5 | Geografía Demanda | GET /api/geografia/municipios | TabGeografia.razor | expediente_municipio + catálogo |
| 6 | Cuellos Botella SLA | GET /api/sla/analisis | TabSLA.razor | time_to_close, SLA fields |
| 7 | Canales Atención | GET /api/canales/comparativa | TabCanales.razor | hs_form_id |
| 8 | Generador Reportes | POST /api/reportes/generar | TabReportes.razor | Todos |

---

## 12. EQUIPO

| Rol | Persona | Nota | Brecha |
|---|---|---|---|
| Arquitecto | Javier Hernández (IRCNL) | Aprueba arquitectura | — |
| Tech Lead | Fabián Arredondo (DALTUM) | Aprueba PRs | — |
| Co-Lead | Maximiliano Álvarez (IRCNL) | JWT/bcrypt | — |
| Backend Sr | Juan Pablo Gutiérrez (DALTUM) | EF Core | — |
| Backend Mid | Carlos Vergara (DALTUM) | OWASP | — |
| Backend Mid | Luis Ángel Covarrubias (IRCNL) | Negocio catastral | ⚠️OWASP 2/5 |
| QA | Oscar Frías (DALTUM) | Pruebas | — |
| Junior | Sergio Noé Asencio (IRCNL) | Onboarding | En capacitación |
| DBA | Maricarmen Valdez (IRCNL) | PG, TimescaleDB | ⚠️LFPDPPP 2/5 |

---

## 13. FAQ

- **No sé qué hacer:** Revisar Plan de Trabajo Fase 2. ¿Qué sprint? ¿Qué sesión?
- **Bug en Fase 1:** NO tocar. Issue en GitHub → Tech Lead.
- **DB no responde:** `ssh .53 "sudo -i -u postgres psql -c 'SELECT 1;'"` → si falla, escalar Maricarmen.
- **Cambio de arquitectura:** DETENER → propuesta → Javier.
- **Push a main:** NUNCA directo. Siempre PR.
- **Datos del worker.js:** NO leer archivo. Usar Sección 5.1 de este documento.
- **Conectar a PG:** `sudo -i -u postgres psql -d db_ircnl_main` (desde .53)

---
*v1.3-compact | 07/03/2026 | Verificado contra servidores reales | CETH v3.0*
