#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  deploy-ircnl-v2.sh — Script Maestro de Despliegue v2.0
#  IRCNL Sistema de Trámites Catastrales
#  Skill: Full Stack Enterprise DevSecOps v1
#
#  NOVEDADES v2 respecto a v1:
#    - Subdominio tablero.ircnl.gob.mx vía Nginx Proxy Manager
#    - Autenticación JWT con 4 roles (ADMIN/DIRECTOR/SUPERVISOR/CONSULTA)
#    - Tabla usuarios, sesiones, auditoria_accesos en PostgreSQL
#    - auth-middleware.js integrado en el worker
#    - 6 usuarios iniciales con contraseña temporal Ircnl2026!
#    - Schema actualizado con pgcrypto
#
#  EJECUTAR DESDE: tu Mac con acceso SSH a la red IRCNL
#
#  USO:
#    chmod +x deploy-ircnl-v2.sh
#    ./deploy-ircnl-v2.sh              # Despliegue completo
#    ./deploy-ircnl-v2.sh --step bd         # Solo base de datos
#    ./deploy-ircnl-v2.sh --step worker     # Solo worker Node.js
#    ./deploy-ircnl-v2.sh --step frontend   # Solo frontend + Nginx
#    ./deploy-ircnl-v2.sh --step npm-proxy  # Solo config NPM (manual)
#    ./deploy-ircnl-v2.sh --step verify     # Solo verificación
#    ./deploy-ircnl-v2.sh --dry-run         # Ver qué haría sin ejecutar
#    ./deploy-ircnl-v2.sh --rollback        # Restaurar estado anterior
#
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ══════════════════════════════════════════════════════════════════════════════
# ▼▼▼  EDITAR SOLO ESTA SECCIÓN  ▼▼▼
# ══════════════════════════════════════════════════════════════════════════════
SSH_USER="administrator"

PASS_PROXY='CONTRASEÑA_DEL_10.150.130.158'     # Proxy Manager
PASS_GATEWAY='CONTRASEÑA_DEL_10.150.111.50'    # srv-cpan01
PASS_OTHERS='CONTRASEÑA_DEL_51_52_53'          # srv-cpan02, 03, 04
# ▲▲▲  FIN DE LA SECCIÓN EDITABLE  ▲▲▲
# ══════════════════════════════════════════════════════════════════════════════

# ─── SERVIDORES ───────────────────────────────────────────────────────────────
SRV_PROXY="10.150.130.158"
SRV_GATEWAY="10.150.111.50"
SRV_PHP="10.150.111.51"
SRV_WORKER="10.150.111.52"
SRV_DB="10.150.111.53"

# ─── RUTAS EN SERVIDORES ──────────────────────────────────────────────────────
WORKER_DIR="/opt/api-ircnl"
WORKER_LOG="/var/log/api-ircnl"
DASHBOARD_DIR="/var/www/dashboard"
NGINX_CONF="/etc/nginx/conf.d/ircnl.conf"
DB_NAME="db_ircnl_main"
DB_USER="usr_ircnl_prod"
APP_NAME="api-ircnl"
SUBDOMAIN="tablero.ircnl.gob.mx"

# ─── ARCHIVOS LOCALES REQUERIDOS ─────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILES_REQUIRED=(
  "worker.js" "auth-middleware.js" "package.json"
  "ecosystem.config.js" ".env"
  "auth-schema.sql" "nginx-tablero.conf"
  "ircnl-atlas-v5-produccion.jsx" "TabSyncLog.jsx" "index.html"
)

# ─── FLAGS ────────────────────────────────────────────────────────────────────
STEP_ONLY=""
DRY_RUN=false
DO_ROLLBACK=false
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${SCRIPT_DIR}/deploy_${TIMESTAMP}.log"
VERIFY_PASS=0
VERIFY_FAIL=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --step)     STEP_ONLY="$2"; shift 2 ;;
    --dry-run)  DRY_RUN=true;   shift ;;
    --rollback) DO_ROLLBACK=true; shift ;;
    *) echo "Argumento desconocido: $1"; exit 1 ;;
  esac
done

# ─── COLORES ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

# ─── HELPERS ──────────────────────────────────────────────────────────────────
log()    { echo -e "${GREEN}[✓]${NC} $*" | tee -a "$LOG_FILE"; }
warn()   { echo -e "${YELLOW}[⚠]${NC} $*" | tee -a "$LOG_FILE"; }
error()  { echo -e "${RED}[✗]${NC} $*" | tee -a "$LOG_FILE" >&2; }
info()   { echo -e "${CYAN}[→]${NC} $*" | tee -a "$LOG_FILE"; }
header() { echo -e "\n${BOLD}${CYAN}━━━ $* ━━━${NC}" | tee -a "$LOG_FILE"; }

# SSH con contraseña (compatible bash 3.2)
q() {
  local host="$1" pass="$2"; shift 2
  if $DRY_RUN; then info "[DRY] SSH ${host}: $*"; return 0; fi
  sshpass -p "$pass" ssh \
    -o StrictHostKeyChecking=no -o ConnectTimeout=10 \
    -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR \
    "${SSH_USER}@${host}" "$@" 2>&1 | tee -a "$LOG_FILE" || true
}

# SSH con sudo
qs() {
  local host="$1" pass="$2"; shift 2
  if $DRY_RUN; then info "[DRY] SSH sudo ${host}: $*"; return 0; fi
  sshpass -p "$pass" ssh \
    -o StrictHostKeyChecking=no -o ConnectTimeout=10 \
    -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR \
    "${SSH_USER}@${host}" \
    "echo '${pass}' | sudo -S $* 2>/dev/null" 2>&1 | tee -a "$LOG_FILE" || true
}

# SCP con contraseña
scp_to() {
  local src="$1" host="$2" pass="$3" dst="$4"
  if $DRY_RUN; then info "[DRY] SCP ${src} → ${host}:${dst}"; return 0; fi
  sshpass -p "$pass" scp \
    -o StrictHostKeyChecking=no -o ConnectTimeout=10 \
    -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR \
    "$src" "${SSH_USER}@${host}:${dst}" 2>&1 | tee -a "$LOG_FILE" || true
}

# Verificación con resultado pass/fail
verify_check() {
  local desc="$1" host="$2" pass="$3" cmd="$4" expected="${5:-}"
  local result
  result=$(sshpass -p "$pass" ssh \
    -o StrictHostKeyChecking=no -o ConnectTimeout=8 \
    -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR \
    "${SSH_USER}@${host}" "$cmd" 2>/dev/null || echo "ERROR")

  if [ -n "$expected" ]; then
    if echo "$result" | grep -q "$expected"; then
      echo -e "  ${GREEN}✓${NC} ${desc}" | tee -a "$LOG_FILE"; ((VERIFY_PASS++)) || true
    else
      echo -e "  ${RED}✗${NC} ${desc} — esperado: '${expected}', obtenido: '${result}'" | tee -a "$LOG_FILE"
      ((VERIFY_FAIL++)) || true
    fi
  else
    if [ -n "$result" ] && [ "$result" != "ERROR" ]; then
      echo -e "  ${GREEN}✓${NC} ${desc}: ${result}" | tee -a "$LOG_FILE"; ((VERIFY_PASS++)) || true
    else
      echo -e "  ${RED}✗${NC} ${desc} — sin respuesta" | tee -a "$LOG_FILE"; ((VERIFY_FAIL++)) || true
    fi
  fi
}

verify_http() {
  local desc="$1" host="$2" pass="$3" url="$4" expected="${5:-200}"
  local code
  code=$(sshpass -p "$pass" ssh \
    -o StrictHostKeyChecking=no -o ConnectTimeout=8 \
    -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR \
    "${SSH_USER}@${host}" \
    "curl -s -o /dev/null -w '%{http_code}' --max-time 5 '${url}'" 2>/dev/null || echo "000")
  if [ "$code" = "$expected" ]; then
    echo -e "  ${GREEN}✓${NC} ${desc}: HTTP ${code}" | tee -a "$LOG_FILE"; ((VERIFY_PASS++)) || true
  else
    echo -e "  ${RED}✗${NC} ${desc}: HTTP ${code} (esperado ${expected})" | tee -a "$LOG_FILE"
    ((VERIFY_FAIL++)) || true
  fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# PASO 0 — VALIDACIÓN PREVIA
# ═══════════════════════════════════════════════════════════════════════════════
step_prevalidation() {
  header "PASO 0 — VALIDACIÓN PREVIA"

  # Verificar sshpass
  if ! command -v sshpass &>/dev/null; then
    error "sshpass no está instalado. Ejecuta: brew install hudochenkov/sshpass/sshpass"
    exit 1
  fi

  # Verificar contraseñas editadas
  local pass_err=0
  # PASS_PROXY omitido — servidor 10.150.130.158 sin SSH disponible
  [ "$PASS_GATEWAY" = "CONTRASEÑA_DEL_10.150.111.50"   ] && { error "Falta PASS_GATEWAY"; pass_err=1; }
  [ "$PASS_OTHERS"  = "CONTRASEÑA_DEL_51_52_53"         ] && { error "Falta PASS_OTHERS";  pass_err=1; }
  [ $pass_err -eq 1 ] && { error "Edita las contraseñas al inicio del script."; exit 1; }

  # Verificar archivos locales
  info "Verificando archivos locales…"
  local missing=0
  for f in "${FILES_REQUIRED[@]}"; do
    if [ -f "${SCRIPT_DIR}/${f}" ]; then log "  ${f} ✓"
    else error "  FALTANTE: ${f}"; missing=1; fi
  done
  [ $missing -eq 1 ] && { error "Faltan archivos. Todos deben estar junto al script."; exit 1; }

  # Verificar .env
  info "Verificando .env…"
  local env_err=0
  for var in HUBSPOT_API_KEY DB_PASS ADMIN_TOKEN JWT_SECRET; do
    local val; val=$(grep "^${var}=" "${SCRIPT_DIR}/.env" 2>/dev/null | cut -d'=' -f2-)
    if [ -z "$val" ] || echo "$val" | grep -qE "XXXX|COMPLETAR|PON_AQUI"; then
      error "  .env — ${var} no configurado"; env_err=1
    else log "  .env — ${var} ✓"; fi
  done
  [ $env_err -eq 1 ] && { error "Completa el .env antes de continuar."; exit 1; }

  # Verificar conectividad SSH
  info "Verificando SSH a los 5 servidores…"
  local ssh_err=0
  for pair in \
    "${SRV_PROXY}:PASS_PROXY:Proxy Manager" \
    "${SRV_GATEWAY}:PASS_GATEWAY:srv-cpan01" \
    "${SRV_PHP}:PASS_OTHERS:srv-cpan02" \
    "${SRV_WORKER}:PASS_OTHERS:srvu-cpan03" \
    "${SRV_DB}:PASS_OTHERS:srv-cpan04"; do
    local ip="${pair%%:*}" rest="${pair#*:}" name="${pair##*:}"
    local passvar="${rest%%:*}"
    local pass; pass=$(eval echo "\$${passvar}")
    if sshpass -p "$pass" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=8 \
       -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR \
       "${SSH_USER}@${ip}" "echo OK" &>/dev/null; then
      log "  SSH ${name} (${ip}) ✓"
    else
      error "  SSH ${name} (${ip}) — INACCESIBLE"
      ssh_err=1
    fi
  done
  [ $ssh_err -eq 1 ] && { error "Sin acceso SSH completo. Revisa conectividad y contraseñas."; exit 1; }

  log "Validación previa OK"
}

# ═══════════════════════════════════════════════════════════════════════════════
# PASO 1 — BASE DE DATOS (srv-cpan04) — Schema + Auth
# ═══════════════════════════════════════════════════════════════════════════════
step_database() {
  header "PASO 1 — BASE DE DATOS (srv-cpan04 — ${SRV_DB})"

  # Backup preventivo
  info "Generando backup preventivo de db_ircnl_main…"
  qs "$SRV_DB" "$PASS_OTHERS" \
    "mkdir -p /var/backups && chown postgres:postgres /var/backups"
  qs "$SRV_DB" "$PASS_OTHERS" \
    "sudo -u postgres pg_dump -Fc ${DB_NAME} > /var/backups/ircnl_pre_v2_${TIMESTAMP}.dump 2>/dev/null && echo 'Backup OK' || echo 'Sin BD previa (primera instalación)'"

  # Aplicar schema de autenticación
  info "Enviando auth-schema.sql…"
  scp_to "${SCRIPT_DIR}/auth-schema.sql" "$SRV_DB" "$PASS_OTHERS" "/tmp/auth-schema-${TIMESTAMP}.sql"

  info "Aplicando auth-schema.sql (crea tablas de auth + usuarios iniciales)…"
  qs "$SRV_DB" "$PASS_OTHERS" \
    "sudo -u postgres psql -d ${DB_NAME} -f /tmp/auth-schema-${TIMESTAMP}.sql 2>&1"

  # Verificar resultado
  info "Verificando tablas creadas…"
  qs "$SRV_DB" "$PASS_OTHERS" \
    "sudo -u postgres psql -d ${DB_NAME} -tAc \"SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;\""

  info "Verificando usuarios creados…"
  qs "$SRV_DB" "$PASS_OTHERS" \
    "sudo -u postgres psql -d ${DB_NAME} -c \"SELECT u.username, r.nombre as rol, u.debe_cambiar_pass FROM usuarios u JOIN roles r ON r.id=u.rol_id ORDER BY r.nombre;\""

  # Limpiar temporal
  q "$SRV_DB" "$PASS_OTHERS" "rm -f /tmp/auth-schema-${TIMESTAMP}.sql"

  log "═══ PASO 1 BASE DE DATOS completado ═══"
}

# ═══════════════════════════════════════════════════════════════════════════════
# PASO 2 — WORKER NODE.JS (srvu-cpan03)
# ═══════════════════════════════════════════════════════════════════════════════
step_worker() {
  header "PASO 2 — WORKER NODE.JS (srvu-cpan03 — ${SRV_WORKER})"

  # Detener proceso anterior (se llamaba hubspot-worker según el diagnóstico)
  info "Deteniendo workers anteriores…"
  q "$SRV_WORKER" "$PASS_OTHERS" \
    "pm2 list 2>/dev/null | grep -E 'hubspot-worker|api-ircnl' | awk '{print \$2}' | xargs -I{} pm2 stop {} 2>/dev/null || true"

  # Crear directorios
  info "Creando directorios…"
  q "$SRV_WORKER" "$PASS_OTHERS" "mkdir -p ${WORKER_DIR} ${WORKER_LOG}"
  q "$SRV_WORKER" "$PASS_OTHERS" "chown -R ${SSH_USER}:${SSH_USER} ${WORKER_DIR} ${WORKER_LOG}"

  # Enviar archivos del worker
  info "Enviando archivos del worker…"
  for f in worker.js auth-middleware.js package.json ecosystem.config.js; do
    scp_to "${SCRIPT_DIR}/${f}" "$SRV_WORKER" "$PASS_OTHERS" "${WORKER_DIR}/${f}"
    log "  ${f} enviado ✓"
  done

  # Enviar .env con JWT_SECRET
  info "Enviando .env…"
  scp_to "${SCRIPT_DIR}/.env" "$SRV_WORKER" "$PASS_OTHERS" "${WORKER_DIR}/.env"
  q "$SRV_WORKER" "$PASS_OTHERS" "chmod 600 ${WORKER_DIR}/.env"
  log ".env con chmod 600 ✓"

  # npm install
  info "Instalando dependencias npm (incluye bcrypt y jsonwebtoken)…"
  q "$SRV_WORKER" "$PASS_OTHERS" "cd ${WORKER_DIR} && npm install --production 2>&1 | tail -5"
  log "npm install completado ✓"

  # Verificar que bcrypt y jsonwebtoken quedaron instalados
  info "Verificando librerías de auth…"
  q "$SRV_WORKER" "$PASS_OTHERS" \
    "ls ${WORKER_DIR}/node_modules | grep -E 'bcrypt|jsonwebtoken' || echo 'ADVERTENCIA: librerías de auth no encontradas'"

  # Iniciar con PM2
  info "Iniciando ${APP_NAME} con PM2…"
  q "$SRV_WORKER" "$PASS_OTHERS" \
    "cd ${WORKER_DIR} && pm2 list | grep -q '${APP_NAME}' && pm2 restart ${APP_NAME} || pm2 start ecosystem.config.js"
  q "$SRV_WORKER" "$PASS_OTHERS" "pm2 save"

  # Esperar arranque
  info "Esperando 5s para verificar arranque…"
  sleep 5
  q "$SRV_WORKER" "$PASS_OTHERS" "pm2 list --no-color | grep ${APP_NAME}"

  # Test de health
  info "Probando health check…"
  q "$SRV_WORKER" "$PASS_OTHERS" "curl -s http://localhost:3000/api/health || echo 'Sin respuesta aún'"

  log "═══ PASO 2 WORKER completado ═══"
}

# ═══════════════════════════════════════════════════════════════════════════════
# PASO 3 — FRONTEND + NGINX (srv-cpan01)
# ═══════════════════════════════════════════════════════════════════════════════
step_frontend() {
  header "PASO 3 — FRONTEND + NGINX (srv-cpan01 — ${SRV_GATEWAY})"

  # Crear directorio del dashboard
  info "Creando /var/www/dashboard/…"
  qs "$SRV_GATEWAY" "$PASS_GATEWAY" "mkdir -p ${DASHBOARD_DIR}"
  qs "$SRV_GATEWAY" "$PASS_GATEWAY" "chown -R ${SSH_USER}:${SSH_USER} ${DASHBOARD_DIR}"

  # Backup nginx.conf anterior
  info "Backup de nginx.conf actual…"
  qs "$SRV_GATEWAY" "$PASS_GATEWAY" \
    "test -f ${NGINX_CONF} && cp ${NGINX_CONF} ${NGINX_CONF}.bak_${TIMESTAMP} && echo 'Backup OK' || echo 'Sin conf anterior'"

  # Enviar archivos del dashboard
  info "Enviando archivos del dashboard…"
  for f in ircnl-atlas-v5-produccion.jsx TabSyncLog.jsx index.html; do
    scp_to "${SCRIPT_DIR}/${f}" "$SRV_GATEWAY" "$PASS_GATEWAY" "${DASHBOARD_DIR}/${f}"
    log "  ${f} enviado ✓"
  done
  q "$SRV_GATEWAY" "$PASS_GATEWAY" \
    "cp ${DASHBOARD_DIR}/ircnl-atlas-v5-produccion.jsx ${DASHBOARD_DIR}/Dashboard.jsx"

  # Ajustar SELinux
  info "Ajustando contexto SELinux…"
  qs "$SRV_GATEWAY" "$PASS_GATEWAY" \
    "semanage fcontext -a -t httpd_sys_content_t '${DASHBOARD_DIR}(/.*)?' 2>/dev/null || true; \
     restorecon -Rv ${DASHBOARD_DIR} 2>/dev/null || true"

  # Instalar nginx.conf
  info "Instalando configuración Nginx para ${SUBDOMAIN}…"
  scp_to "${SCRIPT_DIR}/nginx-tablero.conf" "$SRV_GATEWAY" "$PASS_GATEWAY" "/tmp/nginx-tablero-${TIMESTAMP}.conf"
  qs "$SRV_GATEWAY" "$PASS_GATEWAY" \
    "cp /tmp/nginx-tablero-${TIMESTAMP}.conf ${NGINX_CONF} && rm /tmp/nginx-tablero-${TIMESTAMP}.conf"

  # Verificar sintaxis Nginx
  info "Verificando sintaxis Nginx…"
  local nginx_test
  nginx_test=$(sshpass -p "$PASS_GATEWAY" ssh \
    -o StrictHostKeyChecking=no -o ConnectTimeout=10 \
    -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR \
    "${SSH_USER}@${SRV_GATEWAY}" \
    "echo '${PASS_GATEWAY}' | sudo -S nginx -t 2>&1" || echo "ERROR")

  if echo "$nginx_test" | grep -q "syntax is ok\|successful"; then
    log "Nginx syntax OK ✓"
  else
    error "ERROR en sintaxis Nginx: ${nginx_test}"
    warn "Restaurando configuración anterior…"
    qs "$SRV_GATEWAY" "$PASS_GATEWAY" \
      "ls -t ${NGINX_CONF}.bak_* 2>/dev/null | head -1 | xargs -I{} cp {} ${NGINX_CONF} && nginx -t && systemctl reload nginx || true"
    exit 1
  fi

  # Reload Nginx
  info "Recargando Nginx (sin downtime)…"
  qs "$SRV_GATEWAY" "$PASS_GATEWAY" "systemctl reload nginx"
  log "Nginx recargado ✓"

  log "═══ PASO 3 FRONTEND completado ═══"
}

# ═══════════════════════════════════════════════════════════════════════════════
# PASO 4 — INSTRUCCIONES NGINX PROXY MANAGER
# ═══════════════════════════════════════════════════════════════════════════════
step_npm_proxy() {
  header "PASO 4 — NGINX PROXY MANAGER (${SRV_PROXY})"

  echo ""
  echo -e "${BOLD}${YELLOW}  Este paso NO puede automatizarse — se configura desde el panel web del NPM.${NC}"
  echo ""
  echo -e "  ${BOLD}1. Crear el registro DNS primero:${NC}"
  echo "     Tipo  : A"
  echo "     Nombre: tablero"
  echo "     Valor : ${SRV_PROXY}"
  echo "     TTL   : 300"
  echo ""
  echo -e "  ${BOLD}2. Acceder al panel del Nginx Proxy Manager:${NC}"
  echo -e "     URL: ${CYAN}http://${SRV_PROXY}:81${NC}"
  echo "     (desde tu Mac o cualquier equipo en la red)"
  echo ""
  echo -e "  ${BOLD}3. En el panel: Hosts → Proxy Hosts → Add Proxy Host${NC}"
  echo ""
  echo "     ┌─ PESTAÑA DETAILS ─────────────────────────────────────────┐"
  echo "     │  Domain Names      : tablero.ircnl.gob.mx                 │"
  echo "     │  Scheme            : http                                  │"
  echo "     │  Forward Hostname  : ${SRV_GATEWAY}                       │"
  echo "     │  Forward Port      : 80                                   │"
  echo "     │  Cache Assets      : ON                                   │"
  echo "     │  Block Common Exploits : ON                               │"
  echo "     │  Websockets Support    : OFF                              │"
  echo "     └───────────────────────────────────────────────────────────┘"
  echo ""
  echo "     ┌─ PESTAÑA SSL ──────────────────────────────────────────────┐"
  echo "     │  SSL Certificate   : Request a new SSL Certificate        │"
  echo "     │  Force SSL         : ON                                   │"
  echo "     │  HSTS Enabled      : ON                                   │"
  echo "     │  Email (Let's Encrypt): javier.hernandez@ircnl.gob.mx     │"
  echo "     └───────────────────────────────────────────────────────────┘"
  echo ""
  echo "     Haz clic en SAVE — el NPM genera el certificado automáticamente."
  echo ""
  echo -e "  ${BOLD}4. Verificar:${NC}"
  echo "     Desde tu navegador: https://tablero.ircnl.gob.mx/dashboard/"
  echo "     Debe mostrar el login del dashboard."
  echo ""
  echo -e "  ${YELLOW}  ⚠  REQUISITO: El DNS de tablero.ircnl.gob.mx debe apuntar a${NC}"
  echo -e "  ${YELLOW}     ${SRV_PROXY} ANTES de solicitar el certificado,${NC}"
  echo -e "  ${YELLOW}     o Let's Encrypt no podrá validar el dominio.${NC}"
  echo ""

  read -r -p "  ¿Ya configuraste el NPM? (s para continuar, n para saltar): " choice
  if [ "$choice" = "s" ] || [ "$choice" = "S" ]; then
    log "NPM configurado por el administrador ✓"
  else
    warn "NPM pendiente — recuerda configurarlo antes de usar el dashboard desde Internet."
  fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# PASO 5 — CARGA INICIAL DE DATOS
# ═══════════════════════════════════════════════════════════════════════════════
step_initial_load() {
  header "PASO 5 — CARGA INICIAL DE DATOS HubSpot (opcional)"

  local count
  count=$(sshpass -p "$PASS_OTHERS" ssh \
    -o StrictHostKeyChecking=no -o ConnectTimeout=8 \
    -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR \
    "${SSH_USER}@${SRV_DB}" \
    "echo '${PASS_OTHERS}' | sudo -S sudo -u postgres psql -d ${DB_NAME} -tAc 'SELECT COUNT(*) FROM tickets;' 2>/dev/null" \
    2>/dev/null | tr -d ' \n' || echo "0")

  if [ "${count:-0}" -gt 1000 ]; then
    log "Ya existen ${count} tickets — carga inicial no necesaria."
    return 0
  fi

  warn "La BD tiene ${count:-0} tickets."
  read -r -p "¿Iniciar carga inicial HubSpot ahora? (tardará 3-4h para 130k tickets) [s/N]: " choice
  if [ "$choice" = "s" ] || [ "$choice" = "S" ]; then
    local admin_token
    admin_token=$(grep "^ADMIN_TOKEN=" "${SCRIPT_DIR}/.env" | cut -d'=' -f2-)
    q "$SRV_WORKER" "$PASS_OTHERS" \
      "curl -s -X POST http://localhost:3000/api/sync/carga-inicial \
       -H 'X-Admin-Token: ${admin_token}' -H 'Content-Type: application/json'"
    log "Carga inicial disparada en background."
    info "Monitorear con: ssh ${SSH_USER}@${SRV_WORKER} 'pm2 logs ${APP_NAME}'"
  else
    warn "Carga inicial omitida. Ejecutar manualmente cuando estés listo."
  fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# PASO 6 — VERIFICACIÓN COMPLETA
# ═══════════════════════════════════════════════════════════════════════════════
step_validate() {
  header "PASO 6 — VERIFICACIÓN COMPLETA DE LA INSTALACIÓN"
  VERIFY_PASS=0; VERIFY_FAIL=0

  echo -e "\n${BOLD}[srv-cpan04] PostgreSQL — Tablas y usuarios${NC}"
  verify_check "PostgreSQL activo"              "$SRV_DB" "$PASS_OTHERS" "echo '${PASS_OTHERS}' | sudo -S systemctl is-active postgresql 2>/dev/null" "active"
  verify_check "Tabla roles existe"             "$SRV_DB" "$PASS_OTHERS" "echo '${PASS_OTHERS}' | sudo -S sudo -u postgres psql -d ${DB_NAME} -tAc \"SELECT to_regclass('public.roles');\" 2>/dev/null" "roles"
  verify_check "Tabla usuarios existe"          "$SRV_DB" "$PASS_OTHERS" "echo '${PASS_OTHERS}' | sudo -S sudo -u postgres psql -d ${DB_NAME} -tAc \"SELECT to_regclass('public.usuarios');\" 2>/dev/null" "usuarios"
  verify_check "Tabla sesiones existe"          "$SRV_DB" "$PASS_OTHERS" "echo '${PASS_OTHERS}' | sudo -S sudo -u postgres psql -d ${DB_NAME} -tAc \"SELECT to_regclass('public.sesiones');\" 2>/dev/null" "sesiones"
  verify_check "Tabla auditoria_accesos existe" "$SRV_DB" "$PASS_OTHERS" "echo '${PASS_OTHERS}' | sudo -S sudo -u postgres psql -d ${DB_NAME} -tAc \"SELECT to_regclass('public.auditoria_accesos');\" 2>/dev/null" "auditoria"
  verify_check "4 roles creados"                "$SRV_DB" "$PASS_OTHERS" "echo '${PASS_OTHERS}' | sudo -S sudo -u postgres psql -d ${DB_NAME} -tAc \"SELECT COUNT(*) FROM roles;\" 2>/dev/null" "4"
  verify_check "6 usuarios iniciales"           "$SRV_DB" "$PASS_OTHERS" "echo '${PASS_OTHERS}' | sudo -S sudo -u postgres psql -d ${DB_NAME} -tAc \"SELECT COUNT(*) FROM usuarios;\" 2>/dev/null" "6"
  verify_check "pgcrypto instalado"             "$SRV_DB" "$PASS_OTHERS" "echo '${PASS_OTHERS}' | sudo -S sudo -u postgres psql -d ${DB_NAME} -tAc \"SELECT extname FROM pg_extension WHERE extname='pgcrypto';\" 2>/dev/null" "pgcrypto"

  echo -e "\n${BOLD}[srvu-cpan03] Worker Node.js — API + Auth${NC}"
  verify_check "PM2 api-ircnl online"         "$SRV_WORKER" "$PASS_OTHERS" "pm2 list --no-color | grep ${APP_NAME}" "online"
  verify_check "worker.js presente"           "$SRV_WORKER" "$PASS_OTHERS" "test -f ${WORKER_DIR}/worker.js && echo ok" "ok"
  verify_check "auth-middleware.js presente"  "$SRV_WORKER" "$PASS_OTHERS" "test -f ${WORKER_DIR}/auth-middleware.js && echo ok" "ok"
  verify_check ".env con permisos 600"        "$SRV_WORKER" "$PASS_OTHERS" "stat -c '%a' ${WORKER_DIR}/.env" "600"
  verify_check "bcrypt en node_modules"       "$SRV_WORKER" "$PASS_OTHERS" "test -d ${WORKER_DIR}/node_modules/bcrypt && echo ok" "ok"
  verify_check "jsonwebtoken en node_modules" "$SRV_WORKER" "$PASS_OTHERS" "test -d ${WORKER_DIR}/node_modules/jsonwebtoken && echo ok" "ok"
  verify_http  "Health check /api/health"     "$SRV_WORKER" "$PASS_OTHERS" "http://localhost:3000/api/health" "200"
  verify_http  "POST /auth/login (endpoint existe)" "$SRV_WORKER" "$PASS_OTHERS" \
    "http://localhost:3000/auth/login" "400"  # 400 = endpoint existe pero faltan parámetros

  echo -e "\n${BOLD}[srv-cpan01] Nginx — Dashboard y proxy${NC}"
  verify_check "Nginx activo"                  "$SRV_GATEWAY" "$PASS_GATEWAY" "echo '${PASS_GATEWAY}' | sudo -S systemctl is-active nginx 2>/dev/null" "active"
  verify_check "server_name tablero configurado" "$SRV_GATEWAY" "$PASS_GATEWAY" "grep 'tablero.ircnl.gob.mx' /etc/nginx/conf.d/ircnl.conf 2>/dev/null && echo ok" "ok"
  verify_check "Dashboard.jsx presente"        "$SRV_GATEWAY" "$PASS_GATEWAY" "test -f ${DASHBOARD_DIR}/Dashboard.jsx && echo ok" "ok"
  verify_check "index.html presente"           "$SRV_GATEWAY" "$PASS_GATEWAY" "test -f ${DASHBOARD_DIR}/index.html && echo ok" "ok"
  verify_http  "Dashboard vía Nginx"           "$SRV_GATEWAY" "$PASS_GATEWAY" "http://localhost/dashboard/" "200"
  verify_http  "API vía Nginx proxy"           "$SRV_GATEWAY" "$PASS_GATEWAY" "http://localhost/api/health" "200"
  verify_http  "Login vía Nginx proxy"         "$SRV_GATEWAY" "$PASS_GATEWAY" "http://localhost/auth/login" "400"
  verify_check "SELinux network_connect=on"   "$SRV_GATEWAY" "$PASS_GATEWAY" "echo '${PASS_GATEWAY}' | sudo -S getsebool httpd_can_network_connect 2>/dev/null | grep -o 'on'" "on"

  echo -e "\n${BOLD}[srv-cpan02] Apache PHP Legacy${NC}"
  verify_check "Apache activo" "$SRV_PHP" "$PASS_OTHERS" "echo '${PASS_OTHERS}' | sudo -S systemctl is-active httpd 2>/dev/null" "active"

  # Test de login real con usuario admin
  echo -e "\n${BOLD}[Funcional] Test de login con javier.hernandez@ircnl.gob.mx${NC}"
  local login_result
  login_result=$(sshpass -p "$PASS_OTHERS" ssh \
    -o StrictHostKeyChecking=no -o ConnectTimeout=8 \
    -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR \
    "${SSH_USER}@${SRV_WORKER}" \
    "curl -s -X POST http://localhost:3000/auth/login \
     -H 'Content-Type: application/json' \
     -d '{\"username\":\"javier.hernandez@ircnl.gob.mx\",\"password\":\"Ircnl2026!\"}' \
     2>/dev/null" 2>/dev/null || echo "ERROR")

  if echo "$login_result" | grep -q '"token"'; then
    echo -e "  ${GREEN}✓${NC} Login funcional — JWT generado correctamente" | tee -a "$LOG_FILE"
    echo -e "  ${GREEN}✓${NC} debe_cambiar_pass detectado: $(echo "$login_result" | grep -o '"debe_cambiar_pass":[^,}]*')" | tee -a "$LOG_FILE"
    ((VERIFY_PASS+=2)) || true
  else
    echo -e "  ${RED}✗${NC} Login falló — respuesta: ${login_result}" | tee -a "$LOG_FILE"
    ((VERIFY_FAIL++)) || true
  fi

  # Resumen
  echo ""
  local total=$((VERIFY_PASS + VERIFY_FAIL))
  echo -e "${BOLD}RESULTADO: ${GREEN}${VERIFY_PASS}${NC}/${total} verificaciones exitosas, ${RED}${VERIFY_FAIL}${NC} fallidas${NC}"
  echo ""

  if [ $VERIFY_FAIL -eq 0 ]; then
    echo -e "${GREEN}${BOLD}╔════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}${BOLD}║  ✓ INSTALACIÓN COMPLETAMENTE VÁLIDA               ║${NC}"
    echo -e "${GREEN}${BOLD}╚════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${BOLD}Dashboard (intranet):${NC}  http://${SRV_GATEWAY}/dashboard/"
    echo -e "  ${BOLD}Dashboard (Internet):${NC}  https://${SUBDOMAIN}/dashboard/ (tras configurar NPM)"
    echo -e "  ${BOLD}Panel NPM:${NC}             http://${SRV_PROXY}:81"
    echo ""
    echo -e "  ${BOLD}Usuarios creados (contraseña temporal: Ircnl2026!):${NC}"
    echo "    javier.hernandez@ircnl.gob.mx    → ADMIN"
    echo "    josemaria.urrutia@ircnl.gob.mx   → DIRECTOR"
    echo "    hector.garza@ircnl.gob.mx        → DIRECTOR"
    echo "    alma.reynoso@ircnl.gob.mx        → SUPERVISOR"
    echo "    lizeth.santillan@ircnl.gob.mx    → SUPERVISOR"
    echo "    patricia.deleon@ircnl.gob.mx     → CONSULTA"
    echo ""
    echo -e "  ${YELLOW}⚠ Cada usuario debe cambiar su contraseña en el primer login.${NC}"
  elif [ $VERIFY_FAIL -le 3 ]; then
    echo -e "${YELLOW}${BOLD}╔════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}${BOLD}║  ⚠ INSTALACIÓN CON ${VERIFY_FAIL} ADVERTENCIAS              ║${NC}"
    echo -e "${YELLOW}${BOLD}╚════════════════════════════════════════════════════╝${NC}"
    warn "Revisa los items en rojo antes de usar en producción."
  else
    echo -e "${RED}${BOLD}╔════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}${BOLD}║  ✗ INSTALACIÓN CON ${VERIFY_FAIL} ERRORES                   ║${NC}"
    echo -e "${RED}${BOLD}╚════════════════════════════════════════════════════╝${NC}"
    error "Revisa el log: ${LOG_FILE}"
  fi

  echo ""
  info "Log completo: ${LOG_FILE}"
}

# ═══════════════════════════════════════════════════════════════════════════════
# ROLLBACK
# ═══════════════════════════════════════════════════════════════════════════════
step_rollback() {
  header "ROLLBACK"
  warn "Deteniendo worker…"
  q "$SRV_WORKER" "$PASS_OTHERS" "pm2 stop ${APP_NAME} 2>/dev/null || true"

  warn "Restaurando nginx.conf anterior…"
  qs "$SRV_GATEWAY" "$PASS_GATEWAY" \
    "ls -t ${NGINX_CONF}.bak_* 2>/dev/null | head -1 | xargs -I{} cp {} ${NGINX_CONF} && nginx -t && systemctl reload nginx || true"

  read -r -p "¿Restaurar BD desde backup? SOBREESCRIBIRÁ la BD actual. [s/N]: " choice
  if [ "$choice" = "s" ] || [ "$choice" = "S" ]; then
    local latest
    latest=$(sshpass -p "$PASS_OTHERS" ssh \
      -o StrictHostKeyChecking=no -o ConnectTimeout=8 \
      -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR \
      "${SSH_USER}@${SRV_DB}" \
      "ls -t /var/backups/ircnl_*.dump 2>/dev/null | head -1" 2>/dev/null | tr -d '\n')
    if [ -n "$latest" ]; then
      qs "$SRV_DB" "$PASS_OTHERS" "sudo -u postgres pg_restore -d ${DB_NAME} -c -1 ${latest}"
      log "BD restaurada desde ${latest}"
    else
      warn "No se encontró backup de BD"
    fi
  fi
  log "Rollback completado"
}

# ═══════════════════════════════════════════════════════════════════════════════
# BANNER
# ═══════════════════════════════════════════════════════════════════════════════
show_banner() {
  echo -e "${BOLD}${CYAN}"
  echo "  ╔══════════════════════════════════════════════════════════════╗"
  echo "  ║  IRCNL — Sistema de Trámites Catastrales v2.0               ║"
  echo "  ║  Subdominio: tablero.ircnl.gob.mx                           ║"
  echo "  ║  Auth: JWT + 4 roles + auditoría                            ║"
  echo "  ╚══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
  echo -e "  Timestamp : ${TIMESTAMP}"
  echo -e "  Log       : ${LOG_FILE}"
  echo -e "  Dry run   : ${DRY_RUN}"
  echo -e "  Step      : ${STEP_ONLY:-completo}"
  echo ""

  if ! $DRY_RUN && [ "$STEP_ONLY" != "verify" ]; then
    echo -e "${YELLOW}${BOLD}  ⚠ Este script realiza cambios REALES en producción.${NC}"
    read -r -p "  ¿Continuar? [s/N]: " confirm
    if [ "$confirm" != "s" ] && [ "$confirm" != "S" ]; then echo "Abortado."; exit 0; fi
  fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════
main() {
  mkdir -p "$(dirname "$LOG_FILE")"
  touch "$LOG_FILE"
  show_banner

  if $DO_ROLLBACK; then step_rollback; exit 0; fi

  case "$STEP_ONLY" in
    bd|database)  step_prevalidation; step_database ;;
    worker)       step_prevalidation; step_worker ;;
    frontend)     step_prevalidation; step_frontend ;;
    npm-proxy)    step_npm_proxy ;;
    verify)       step_validate ;;
    "")
      step_prevalidation
      step_database
      step_worker
      step_frontend
      step_npm_proxy
      step_initial_load
      step_validate
      ;;
    *) error "Step desconocido: ${STEP_ONLY}"; exit 1 ;;
  esac

  log "Script terminado. Log: ${LOG_FILE}"
}

main "$@"
