#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  diagnose-ircnl.sh — Script de Diagnóstico Pre-Despliegue v3
#  IRCNL Sistema de Trámites Catastrales
#  Skill: Full Stack Enterprise DevSecOps v1 — FASE 1 (Validación Técnica)
#
#  ⚠️  ESTE SCRIPT NO REALIZA NINGÚN CAMBIO EN LOS SERVIDORES
#      Solo lee información y genera un reporte completo.
#
#  ──────────────────────────────────────────────────────────────────────────────
#  EDICIÓN DE CREDENCIALES — SOLO MODIFICA 2 LÍNEAS:
#  Línea 33: SSH_USER_GLOBAL  →  usuario (administrator)
#  Líneas 35-45: PASS_1, PASS_2, PASS_3  →  3 contraseñas
#  ──────────────────────────────────────────────────────────────────────────────
#
#  SERVIDORES INSPECCIONADOS (5):
#    10.150.130.158  — Proxy Manager / Generador de certificados (ircnl.gob.mx)
#    10.150.111.50   — srv-cpan01  — Nginx interno / Gateway
#    10.150.111.51   — srv-cpan02  — PHP Legacy
#    10.150.111.52   — srvu-cpan03 — Node.js Worker
#    10.150.111.53   — srv-cpan04  — PostgreSQL
# ═══════════════════════════════════════════════════════════════════════════════

set -uo pipefail

# ══════════════════════════════════════════════════════════════════════════════
# ▼▼▼  EDITAR SOLO ESTA SECCIÓN — CREDENCIALES DE ACCESO  ▼▼▼
# ══════════════════════════════════════════════════════════════════════════════

# El usuario es el mismo en todos los servidores
SSH_USER_GLOBAL="administrator"

# ── CONTRASEÑA 1: Proxy Manager / Generador de certificados ──────────────────
#    Servidor: 10.150.130.158
PASS_1="PON_AQUI_CONTRASEÑA_DEL_10.150.130.158"

# ── CONTRASEÑA 2: Nginx Gateway interno ──────────────────────────────────────
#    Servidor: 10.150.111.50  (srv-cpan01)
PASS_2="PON_AQUI_CONTRASEÑA_DEL_10.150.111.50"

# ── CONTRASEÑA 3: Los demás servidores (usan la misma entre sí) ──────────────
#    Servidores: 10.150.111.51 (srv-cpan02)
#                10.150.111.52 (srvu-cpan03)
#                10.150.111.53 (srv-cpan04)
PASS_3="PON_AQUI_CONTRASEÑA_DEL_10.150.111.51_52_53"

# ▲▲▲  FIN DE LA SECCIÓN EDITABLE  ▲▲▲
# ══════════════════════════════════════════════════════════════════════════════

# ── IPs ───────────────────────────────────────────────────────────────────────
SRV_PROXY="10.150.130.158"     # Proxy Manager / Cert Manager  (dominio público)
SRV_GATEWAY="10.150.111.50"    # srv-cpan01  — Nginx Gateway interno
SRV_PHP="10.150.111.51"        # srv-cpan02  — PHP Legacy
SRV_WORKER="10.150.111.52"     # srvu-cpan03 — Node.js Worker
SRV_DB="10.150.111.53"         # srv-cpan04  — PostgreSQL

# ── Asignar contraseña a cada servidor ───────────────────────────────────────
USER_PROXY="$SSH_USER_GLOBAL";   PASS_PROXY="$PASS_1";   SUDO_PROXY="$PASS_1"
USER_GATEWAY="$SSH_USER_GLOBAL"; PASS_GATEWAY="$PASS_2"; SUDO_GATEWAY="$PASS_2"
USER_PHP="$SSH_USER_GLOBAL";     PASS_PHP="$PASS_3";     SUDO_PHP="$PASS_3"
USER_WORKER="$SSH_USER_GLOBAL";  PASS_WORKER="$PASS_3";  SUDO_WORKER="$PASS_3"
USER_DB="$SSH_USER_GLOBAL";      PASS_DB="$PASS_3";      SUDO_DB="$PASS_3"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT="${SCRIPT_DIR}/diagnostico_${TIMESTAMP}.txt"

# ─── COLORES ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

SECTION_SEP="═══════════════════════════════════════════════════════════════════"
SUB_SEP="───────────────────────────────────────────────────────────────────"

# ─── HELPERS ──────────────────────────────────────────────────────────────────
out()        { echo -e "$*"; echo -e "$*" | sed 's/\x1b\[[0-9;]*m//g' >> "$REPORT"; }
section()    { out "\n${BOLD}${CYAN}${SECTION_SEP}${NC}"; out "${BOLD}${CYAN}  $*${NC}"; out "${BOLD}${CYAN}${SECTION_SEP}${NC}"; }
subsection() { out "\n${BOLD}  ▸ $*${NC}"; out "  ${SUB_SEP:0:60}"; }

show() {
  local lbl="$1" res="$2"
  printf "  %-50s : " "$lbl"
  printf "  %-50s : " "$lbl" >> "$REPORT"
  if [ "$res" = "INACCESIBLE" ]; then
    echo -e "${RED}NO DISPONIBLE${NC}"; echo "NO DISPONIBLE" >> "$REPORT"
  else
    local first=true
    while IFS= read -r line; do
      if $first; then
        echo "$line" | tee -a "$REPORT"; first=false
      else
        echo "    $line" | tee -a "$REPORT"
      fi
    done <<< "$res"
  fi
}

block() {
  local title="$1" content="$2"
  out "  $title:"
  while IFS= read -r line; do out "    $line"; done <<< "$content"
}

# ── sshpass: verificar instalación ───────────────────────────────────────────
check_sshpass() {
  if ! command -v sshpass &>/dev/null; then
    echo -e "${RED}${BOLD}ERROR: sshpass no está instalado.${NC}"
    echo ""
    echo "Instálalo con:"
    echo "  brew install hudochenkov/sshpass/sshpass"
    echo ""
    echo "Si no tienes Homebrew:"
    echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    echo "  brew install hudochenkov/sshpass/sshpass"
    exit 1
  fi
}

# ── SSH con contraseña ────────────────────────────────────────────────────────
q() {
  local host="$1" pass="$2" user="$3"; shift 3
  sshpass -p "$pass" ssh \
    -o StrictHostKeyChecking=no -o ConnectTimeout=8 \
    -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR \
    "${user}@${host}" "$@" 2>/dev/null || echo "INACCESIBLE"
}

# ── SSH con sudo ──────────────────────────────────────────────────────────────
qs() {
  local host="$1" pass="$2" sudopass="$3" user="$4"; shift 4
  sshpass -p "$pass" ssh \
    -o StrictHostKeyChecking=no -o ConnectTimeout=8 \
    -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR \
    "${user}@${host}" \
    "echo '${sudopass}' | sudo -S $* 2>/dev/null" 2>/dev/null || echo "INACCESIBLE"
}

# ── Test de conectividad ──────────────────────────────────────────────────────
test_ssh() {
  local host="$1" pass="$2" user="$3"
  result=$(sshpass -p "$pass" ssh \
    -o StrictHostKeyChecking=no -o ConnectTimeout=8 \
    -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR \
    "${user}@${host}" "echo OK" 2>/dev/null || echo "FAIL")
  [ "$result" = "OK" ]
}

# ══════════════════════════════════════════════════════════════════════════════
# INICIO
# ══════════════════════════════════════════════════════════════════════════════
check_sshpass

# Validar que las 3 contraseñas fueron editadas
PASS_ERROR=0
if [ "$PASS_1" = "PON_AQUI_CONTRASEÑA_DEL_10.150.130.158" ]; then
  echo -e "${RED}ERROR: Falta la contraseña de 10.150.130.158 (PASS_1)${NC}"
  PASS_ERROR=1
fi
if [ "$PASS_2" = "PON_AQUI_CONTRASEÑA_DEL_10.150.111.50" ]; then
  echo -e "${RED}ERROR: Falta la contraseña de 10.150.111.50 (PASS_2)${NC}"
  PASS_ERROR=1
fi
if [ "$PASS_3" = "PON_AQUI_CONTRASEÑA_DEL_10.150.111.51_52_53" ]; then
  echo -e "${RED}ERROR: Falta la contraseña de los servidores .51/.52/.53 (PASS_3)${NC}"
  PASS_ERROR=1
fi
if [ "$PASS_ERROR" = "1" ]; then
  echo ""
  echo "Edita el script con:  nano diagnose-ircnl-v4.sh"
  echo "Busca la sección  ▼▼▼ EDITAR SOLO ESTA SECCIÓN  (líneas 29-50)"
  echo "y pon las 3 contraseñas reales."
  echo ""
  exit 1
fi

clear
out "${BOLD}${CYAN}"
out "  ╔══════════════════════════════════════════════════════════════╗"
out "  ║  IRCNL — Diagnóstico Pre-Despliegue v3                      ║"
out "  ║  Subdominio tablero.ircnl.gob.mx + Autenticación con roles  ║"
out "  ║  Solo lectura — Ningún cambio en servidores                  ║"
out "  ╚══════════════════════════════════════════════════════════════╝${NC}"
out ""
out "  Timestamp : ${TIMESTAMP}"
out "  Reporte   : ${REPORT}"
out "  Operador  : $(whoami)@$(hostname)"
out ""

{
  echo "${SECTION_SEP}"
  echo "  IRCNL — REPORTE DE DIAGNÓSTICO PRE-DESPLIEGUE v3"
  echo "  Generado : $(date '+%d/%m/%Y %H:%M:%S %Z')"
  echo "  Propósito: tablero.ircnl.gob.mx + autenticación con roles"
  echo "${SECTION_SEP}"
} > "$REPORT"

# ═══════════════════════════════════════════════════════════════════════════════
# BLOQUE 1 — CONECTIVIDAD SSH (5 SERVIDORES)
# ═══════════════════════════════════════════════════════════════════════════════
section "BLOQUE 1 — CONECTIVIDAD SSH (5 SERVIDORES)"

# Compatible bash 3.2 (Mac) — sin arrays asociativos
# Variables de estado por servidor: STATUS_PROXY, STATUS_GATEWAY, etc.
STATUS_PROXY="fail"
STATUS_GATEWAY="fail"
STATUS_PHP="fail"
STATUS_WORKER="fail"
STATUS_DB="fail"

if test_ssh "$SRV_PROXY"   "$PASS_PROXY"   "$USER_PROXY";   then show "Proxy Manager / Cert Manager  (${SRV_PROXY})" "✓ ACCESIBLE"; STATUS_PROXY="ok";   else show "Proxy Manager / Cert Manager  (${SRV_PROXY})" "✗ INACCESIBLE"; fi
if test_ssh "$SRV_GATEWAY" "$PASS_GATEWAY" "$USER_GATEWAY"; then show "srv-cpan01 Nginx Gateway       (${SRV_GATEWAY})" "✓ ACCESIBLE"; STATUS_GATEWAY="ok"; else show "srv-cpan01 Nginx Gateway       (${SRV_GATEWAY})" "✗ INACCESIBLE"; fi
if test_ssh "$SRV_PHP"     "$PASS_PHP"     "$USER_PHP";     then show "srv-cpan02 PHP Legacy          (${SRV_PHP})"     "✓ ACCESIBLE"; STATUS_PHP="ok";     else show "srv-cpan02 PHP Legacy          (${SRV_PHP})"     "✗ INACCESIBLE"; fi
if test_ssh "$SRV_WORKER"  "$PASS_WORKER"  "$USER_WORKER";  then show "srvu-cpan03 Node.js Worker     (${SRV_WORKER})"  "✓ ACCESIBLE"; STATUS_WORKER="ok";  else show "srvu-cpan03 Node.js Worker     (${SRV_WORKER})"  "✗ INACCESIBLE"; fi
if test_ssh "$SRV_DB"      "$PASS_DB"      "$USER_DB";      then show "srv-cpan04 PostgreSQL          (${SRV_DB})"      "✓ ACCESIBLE"; STATUS_DB="ok";      else show "srv-cpan04 PostgreSQL          (${SRV_DB})"      "✗ INACCESIBLE"; fi

# ═══════════════════════════════════════════════════════════════════════════════
# BLOQUE 2 — DNS Y SUBDOMINIO
# ═══════════════════════════════════════════════════════════════════════════════
section "BLOQUE 2 — DNS Y SUBDOMINIO tablero.ircnl.gob.mx"

subsection "Resolución DNS desde tu Mac"
DNS_TABLERO=$(dig +short "tablero.ircnl.gob.mx" 2>/dev/null || echo "NO RESUELVE")
DNS_MAIN=$(dig +short "ircnl.gob.mx" 2>/dev/null | head -1 || echo "NO RESUELVE")
DNS_WWW=$(dig +short "www.ircnl.gob.mx" 2>/dev/null | head -1 || echo "NO RESUELVE")

show "tablero.ircnl.gob.mx" "${DNS_TABLERO:-NO RESUELVE}"
show "ircnl.gob.mx" "${DNS_MAIN:-NO RESUELVE}"
show "www.ircnl.gob.mx" "${DNS_WWW:-NO RESUELVE}"

out ""
if [ -z "${DNS_TABLERO:-}" ] || [ "${DNS_TABLERO}" = "NO RESUELVE" ]; then
  out "${RED}  ✗ CRÍTICO: tablero.ircnl.gob.mx no tiene registro DNS.${NC}"
  out "    Debe crearse ANTES del despliegue:"
  out "      Tipo  : A"
  out "      Nombre: tablero"
  out "      Valor : ${SRV_PROXY}  ← apuntar al Proxy Manager"
  out "        (El Proxy Manager luego enruta hacia srv-cpan01 internamente)"
  out "      TTL   : 300"
elif [ "${DNS_TABLERO}" = "${SRV_PROXY}" ]; then
  out "${GREEN}  ✓ tablero.ircnl.gob.mx ya apunta al Proxy Manager (${SRV_PROXY})${NC}"
else
  out "${YELLOW}  ⚠ tablero.ircnl.gob.mx resuelve a ${DNS_TABLERO}${NC}"
  out "    Verificar si esa IP es correcta para el ruteo deseado."
fi

# ═══════════════════════════════════════════════════════════════════════════════
# BLOQUE 3 — PROXY MANAGER / CERT MANAGER (10.150.130.158)
# ═══════════════════════════════════════════════════════════════════════════════
section "BLOQUE 3 — PROXY MANAGER / CERT MANAGER (${SRV_PROXY})"

if [ "$STATUS_PROXY" = "ok" ]; then

  subsection "Sistema operativo y recursos"
  OS_PROXY=$(q "$SRV_PROXY" "$PASS_PROXY" "$USER_PROXY" \
    "cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d'\"' -f2 || uname -a")
  show "Sistema operativo" "$OS_PROXY"
  RAM_PROXY=$(q "$SRV_PROXY" "$PASS_PROXY" "$USER_PROXY" \
    "free -h | grep Mem | awk '{print \"Total:\",\$2,\"| Usado:\",\$3,\"| Libre:\",\$7}'")
  show "RAM" "$RAM_PROXY"

  subsection "Software de Proxy Manager instalado"
  # Nginx Proxy Manager (NPM) — el más común en Linux
  NPM_RUNNING=$(q "$SRV_PROXY" "$PASS_PROXY" "$USER_PROXY" \
    "docker ps 2>/dev/null | grep -i 'nginx-proxy-manager\|npm\|jc21' || echo 'No encontrado en Docker'")
  show "NPM en Docker" "$NPM_RUNNING"

  DOCKER_STATUS=$(q "$SRV_PROXY" "$PASS_PROXY" "$USER_PROXY" \
    "systemctl is-active docker 2>/dev/null || echo 'Docker no activo'")
  show "Docker" "$DOCKER_STATUS"

  DOCKER_COMPOSE=$(q "$SRV_PROXY" "$PASS_PROXY" "$USER_PROXY" \
    "docker compose version 2>/dev/null || docker-compose --version 2>/dev/null || echo 'No instalado'")
  show "Docker Compose" "$DOCKER_COMPOSE"

  # Otros proxies comunes
  NGINX_STATUS=$(qs "$SRV_PROXY" "$PASS_PROXY" "$SUDO_PROXY" "$USER_PROXY" \
    "systemctl is-active nginx 2>/dev/null || echo 'no activo'")
  show "Nginx nativo" "$NGINX_STATUS"

  HAPROXY=$(qs "$SRV_PROXY" "$PASS_PROXY" "$SUDO_PROXY" "$USER_PROXY" \
    "systemctl is-active haproxy 2>/dev/null || echo 'no activo'")
  show "HAProxy" "$HAPROXY"

  CADDY=$(qs "$SRV_PROXY" "$PASS_PROXY" "$SUDO_PROXY" "$USER_PROXY" \
    "systemctl is-active caddy 2>/dev/null || echo 'no activo'")
  show "Caddy" "$CADDY"

  TRAEFIK=$(q "$SRV_PROXY" "$PASS_PROXY" "$USER_PROXY" \
    "docker ps 2>/dev/null | grep -i traefik || echo 'no encontrado'")
  show "Traefik (Docker)" "$TRAEFIK"

  subsection "Puertos en escucha"
  PORTS_PROXY=$(q "$SRV_PROXY" "$PASS_PROXY" "$USER_PROXY" \
    "ss -tlnp 2>/dev/null | grep LISTEN | awk '{print \$4}' | sort -u")
  block "Puertos activos" "$PORTS_PROXY"

  subsection "Configuración de hosts/proxy rules existentes"
  # Intentar leer config de NPM si existe
  NPM_CONFIG=$(q "$SRV_PROXY" "$PASS_PROXY" "$USER_PROXY" \
    "find /opt /home /root /etc -name 'docker-compose.yml' -o -name 'docker-compose.yaml' 2>/dev/null | head -5 || echo 'No encontrado'")
  show "docker-compose.yml encontrado en" "$NPM_CONFIG"

  # Si hay docker-compose, leerlo
  if [ "$NPM_CONFIG" != "No encontrado" ] && [ "$NPM_CONFIG" != "INACCESIBLE" ]; then
    while IFS= read -r composefile; do
      [ -z "$composefile" ] && continue
      out ""
      out "  ── Contenido de $composefile ──"
      COMPOSE_CONTENT=$(q "$SRV_PROXY" "$PASS_PROXY" "$USER_PROXY" \
        "cat '$composefile' 2>/dev/null | head -80 || echo 'No se pudo leer'")
      while IFS= read -r line; do out "    $line"; done <<< "$COMPOSE_CONTENT"
    done <<< "$NPM_CONFIG"
  fi

  # Hosts proxy configurados en NPM (BD SQLite si usa NPM)
  NPM_DB=$(q "$SRV_PROXY" "$PASS_PROXY" "$USER_PROXY" \
    "find / -name 'database.sqlite' -path '*/nginx-proxy-manager/*' 2>/dev/null | head -3 || echo 'No encontrado'")
  show "Base de datos NPM (SQLite)" "$NPM_DB"

  subsection "Certificados SSL existentes"
  # Certificados en Let's Encrypt
  CERTS_LE=$(qs "$SRV_PROXY" "$PASS_PROXY" "$SUDO_PROXY" "$USER_PROXY" \
    "ls /etc/letsencrypt/live/ 2>/dev/null || echo 'Directorio no existe'")
  block "Certificados en /etc/letsencrypt/live/" "$CERTS_LE"

  # Certificados en Docker volumes (NPM los guarda aquí típicamente)
  CERTS_DOCKER=$(q "$SRV_PROXY" "$PASS_PROXY" "$USER_PROXY" \
    "find /opt /var/lib/docker -name '*.crt' -o -name '*.pem' 2>/dev/null | grep -v 'chain\|fullchain\|root' | head -15 || echo 'No encontrado'")
  block "Certificados en volúmenes Docker" "$CERTS_DOCKER"

  # Certificado para ircnl.gob.mx
  CERT_IRCNL=$(qs "$SRV_PROXY" "$PASS_PROXY" "$SUDO_PROXY" "$USER_PROXY" \
    "find / -name '*.crt' -o -name '*.pem' 2>/dev/null | xargs grep -l 'ircnl' 2>/dev/null | head -5 || echo 'No encontrado'")
  show "Certificado con 'ircnl'" "$CERT_IRCNL"

  # Verificar si hay certbot instalado aquí
  CERTBOT_PROXY=$(q "$SRV_PROXY" "$PASS_PROXY" "$USER_PROXY" \
    "which certbot 2>/dev/null || docker run --rm certbot/certbot --version 2>/dev/null | head -1 || echo 'No instalado'")
  show "certbot" "$CERTBOT_PROXY"

  subsection "Reglas de ruteo actuales hacia la red interna"
  # NPM guarda sus proxy hosts en SQLite — intentar leer si existe
  NPM_HOSTS=$(q "$SRV_PROXY" "$PASS_PROXY" "$USER_PROXY" \
    "find / -name 'database.sqlite' 2>/dev/null -path '*/npm/*' | head -1 | xargs -I{} sqlite3 {} 'SELECT domain_names,forward_host,forward_port FROM proxy_host;' 2>/dev/null || echo 'No se pudo leer (SQLite no disponible o ruta diferente)'")
  block "Proxy hosts configurados (NPM DB)" "$NPM_HOSTS"

  # Ver archivos de config Nginx generados por NPM
  NPM_NGINX_CONFS=$(q "$SRV_PROXY" "$PASS_PROXY" "$USER_PROXY" \
    "find /opt /etc /var/lib/docker -name '*.conf' -path '*/nginx/*' 2>/dev/null | head -10 || echo 'No encontrado'")
  block "Archivos .conf de Nginx/NPM" "$NPM_NGINX_CONFS"

  # Leer primer conf para ver formato
  if [ "$NPM_NGINX_CONFS" != "No encontrado" ] && [ "$NPM_NGINX_CONFS" != "INACCESIBLE" ]; then
    FIRST_CONF=$(echo "$NPM_NGINX_CONFS" | head -1)
    out ""
    out "  ── Ejemplo de conf: $FIRST_CONF ──"
    CONF_SAMPLE=$(q "$SRV_PROXY" "$PASS_PROXY" "$USER_PROXY" \
      "cat '$FIRST_CONF' 2>/dev/null | head -40 || echo 'No se pudo leer'")
    while IFS= read -r line; do out "    $line"; done <<< "$CONF_SAMPLE"
  fi

  subsection "Firewall en el Proxy Manager"
  FW_PROXY=$(qs "$SRV_PROXY" "$PASS_PROXY" "$SUDO_PROXY" "$USER_PROXY" \
    "firewall-cmd --list-all 2>/dev/null || ufw status 2>/dev/null || iptables -L INPUT -n 2>/dev/null | head -20 || echo 'Sin firewall detectado'")
  block "Reglas de firewall" "$FW_PROXY"

  subsection "IPs y interfaces de red"
  IFACES=$(q "$SRV_PROXY" "$PASS_PROXY" "$USER_PROXY" "ip addr show 2>/dev/null | grep -E 'inet |^[0-9]+:' || hostname -I")
  block "Interfaces de red" "$IFACES"

else
  out "${RED}  10.150.130.158 inaccesible — No se puede auditar el Proxy Manager${NC}"
  out "  Esto es CRÍTICO para implementar el subdominio y certificado SSL."
fi

# ═══════════════════════════════════════════════════════════════════════════════
# BLOQUE 4 — NGINX EN srv-cpan01 (10.150.111.50)
# ═══════════════════════════════════════════════════════════════════════════════
section "BLOQUE 4 — NGINX GATEWAY INTERNO (srv-cpan01 — ${SRV_GATEWAY})"

if [ "$STATUS_GATEWAY" = "ok" ]; then

  NGINX_STATUS=$(qs "$SRV_GATEWAY" "$PASS_GATEWAY" "$SUDO_GATEWAY" "$USER_GATEWAY" "systemctl is-active nginx")
  show "nginx servicio" "$NGINX_STATUS"
  NGINX_VER=$(q "$SRV_GATEWAY" "$PASS_GATEWAY" "$USER_GATEWAY" "nginx -v 2>&1")
  show "nginx versión" "$NGINX_VER"

  subsection "Configuración actual de /etc/nginx/conf.d/"
  CONF_FILES=$(qs "$SRV_GATEWAY" "$PASS_GATEWAY" "$SUDO_GATEWAY" "$USER_GATEWAY" \
    "ls /etc/nginx/conf.d/ 2>/dev/null || echo 'Vacío'")
  block "Archivos en conf.d/" "$CONF_FILES"

  # Leer cada archivo conf
  ALL_CONFS=$(qs "$SRV_GATEWAY" "$PASS_GATEWAY" "$SUDO_GATEWAY" "$USER_GATEWAY" \
    "ls /etc/nginx/conf.d/*.conf 2>/dev/null")
  if [ -n "$ALL_CONFS" ] && [ "$ALL_CONFS" != "INACCESIBLE" ]; then
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      out ""; out "  ── $f ──"
      CONTENT=$(qs "$SRV_GATEWAY" "$PASS_GATEWAY" "$SUDO_GATEWAY" "$USER_GATEWAY" "cat $f 2>/dev/null")
      while IFS= read -r line; do out "    $line"; done <<< "$CONTENT"
    done <<< "$ALL_CONFS"
  fi

  subsection "nginx.conf principal"
  NGINX_MAIN=$(qs "$SRV_GATEWAY" "$PASS_GATEWAY" "$SUDO_GATEWAY" "$USER_GATEWAY" \
    "cat /etc/nginx/nginx.conf 2>/dev/null | grep -v '^#' | grep -v '^$' | head -40")
  block "nginx.conf (sin comentarios)" "$NGINX_MAIN"

  subsection "Dashboard y archivos web"
  DASH=$(qs "$SRV_GATEWAY" "$PASS_GATEWAY" "$SUDO_GATEWAY" "$USER_GATEWAY" \
    "ls -la /var/www/dashboard/ 2>/dev/null || echo 'Directorio no existe'")
  block "/var/www/dashboard/" "$DASH"

  subsection "SELinux y puertos"
  SELINUX=$(qs "$SRV_GATEWAY" "$PASS_GATEWAY" "$SUDO_GATEWAY" "$USER_GATEWAY" "getenforce 2>/dev/null")
  show "SELinux" "$SELINUX"
  HTTPD_NET=$(qs "$SRV_GATEWAY" "$PASS_GATEWAY" "$SUDO_GATEWAY" "$USER_GATEWAY" \
    "getsebool httpd_can_network_connect 2>/dev/null || echo 'N/A'")
  show "httpd_can_network_connect" "$HTTPD_NET"

  subsection "Puertos en escucha"
  PORTS_GW=$(q "$SRV_GATEWAY" "$PASS_GATEWAY" "$USER_GATEWAY" \
    "ss -tlnp 2>/dev/null | grep LISTEN | awk '{print \$4}' | sort -u")
  block "Puertos" "$PORTS_GW"

  subsection "Firewall"
  FW_GW=$(qs "$SRV_GATEWAY" "$PASS_GATEWAY" "$SUDO_GATEWAY" "$USER_GATEWAY" \
    "firewall-cmd --list-all 2>/dev/null || echo 'N/A'")
  block "firewalld" "$FW_GW"

else
  out "${RED}  srv-cpan01 inaccesible${NC}"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# BLOQUE 5 — WORKER NODE.JS (srvu-cpan03)
# ═══════════════════════════════════════════════════════════════════════════════
section "BLOQUE 5 — WORKER NODE.JS (srvu-cpan03 — ${SRV_WORKER})"

if [ "$STATUS_WORKER" = "ok" ]; then

  subsection "PM2"
  PM2_LIST=$(q "$SRV_WORKER" "$PASS_WORKER" "$USER_WORKER" "pm2 list --no-color 2>/dev/null || echo 'PM2 no disponible'")
  block "pm2 list" "$PM2_LIST"

  subsection "Worker actual"
  WORKER_FILES=$(q "$SRV_WORKER" "$PASS_WORKER" "$USER_WORKER" \
    "ls -la /opt/api-ircnl/ 2>/dev/null || echo 'No existe'")
  block "/opt/api-ircnl/" "$WORKER_FILES"

  HEALTH=$(q "$SRV_WORKER" "$PASS_WORKER" "$USER_WORKER" \
    "curl -s --max-time 5 http://localhost:3000/api/health 2>/dev/null || echo 'No responde'")
  show "Health check API" "$HEALTH"

  ENV_KEYS=$(q "$SRV_WORKER" "$PASS_WORKER" "$USER_WORKER" \
    "cat /opt/api-ircnl/.env 2>/dev/null | grep -v '^#' | grep '=' | cut -d'=' -f1 | sort || echo 'No existe .env'")
  block ".env — claves definidas (sin valores)" "$ENV_KEYS"

  AUTH_EXISTING=$(q "$SRV_WORKER" "$PASS_WORKER" "$USER_WORKER" \
    "grep -n 'jwt\|session\|cookie\|bcrypt\|passport\|login\|rol\|role\|middleware' /opt/api-ircnl/worker.js 2>/dev/null | grep -iv 'ADMIN_TOKEN\|x-admin' | head -20 || echo 'Sin lógica de autenticación de usuarios'")
  block "Auth en worker.js" "$AUTH_EXISTING"

  PKG=$(q "$SRV_WORKER" "$PASS_WORKER" "$USER_WORKER" \
    "cat /opt/api-ircnl/package.json 2>/dev/null || echo 'No existe'")
  block "package.json" "$PKG"

  JWT_PKG=$(q "$SRV_WORKER" "$PASS_WORKER" "$USER_WORKER" \
    "ls /opt/api-ircnl/node_modules 2>/dev/null | grep -E 'jsonwebtoken|bcrypt|passport|express-session|helmet' || echo 'Ninguna librería de auth instalada'")
  show "Librerías auth en node_modules" "$JWT_PKG"

  subsection "UFW y puertos"
  UFW=$(qs "$SRV_WORKER" "$PASS_WORKER" "$SUDO_WORKER" "$USER_WORKER" "ufw status 2>/dev/null || echo 'N/A'")
  block "ufw" "$UFW"

else
  out "${RED}  srvu-cpan03 inaccesible${NC}"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# BLOQUE 6 — POSTGRESQL (srv-cpan04)
# ═══════════════════════════════════════════════════════════════════════════════
section "BLOQUE 6 — POSTGRESQL (srv-cpan04 — ${SRV_DB})"

if [ "$STATUS_DB" = "ok" ]; then

  PG_STATUS=$(qs "$SRV_DB" "$PASS_DB" "$SUDO_DB" "$USER_DB" "systemctl is-active postgresql")
  show "PostgreSQL servicio" "$PG_STATUS"

  DB_LIST=$(qs "$SRV_DB" "$PASS_DB" "$SUDO_DB" "$USER_DB" \
    "sudo -u postgres psql -tAc 'SELECT datname FROM pg_database ORDER BY datname;' 2>/dev/null || echo 'Sin acceso'")
  block "Bases de datos" "$DB_LIST"

  ROLES=$(qs "$SRV_DB" "$PASS_DB" "$SUDO_DB" "$USER_DB" \
    "sudo -u postgres psql -tAc \"SELECT rolname, rolsuper, rolcanlogin FROM pg_roles ORDER BY rolname;\" 2>/dev/null || echo 'Sin acceso'")
  block "Roles PostgreSQL (nombre|superuser|canlogin)" "$ROLES"

  TABLES=$(qs "$SRV_DB" "$PASS_DB" "$SUDO_DB" "$USER_DB" \
    "sudo -u postgres psql -d db_ircnl_main -tAc \"\dt\" 2>/dev/null || echo 'BD no existe aún'")
  block "Tablas en db_ircnl_main" "$TABLES"

  USERS_TABLE=$(qs "$SRV_DB" "$PASS_DB" "$SUDO_DB" "$USER_DB" \
    "sudo -u postgres psql -d db_ircnl_main -c '\d usuarios' 2>/dev/null || echo 'Tabla usuarios no existe'")
  block "Estructura tabla usuarios" "$USERS_TABLE"

  EXT=$(qs "$SRV_DB" "$PASS_DB" "$SUDO_DB" "$USER_DB" \
    "sudo -u postgres psql -d db_ircnl_main -tAc 'SELECT extname FROM pg_extension;' 2>/dev/null || echo 'Sin acceso'")
  show "Extensiones instaladas" "$EXT"

  TICKET_COUNT=$(qs "$SRV_DB" "$PASS_DB" "$SUDO_DB" "$USER_DB" \
    "sudo -u postgres psql -d db_ircnl_main -tAc 'SELECT COUNT(*) FROM tickets;' 2>/dev/null || echo 'Tabla no existe'")
  show "Tickets en BD (carga inicial)" "$TICKET_COUNT"

else
  out "${RED}  srv-cpan04 inaccesible${NC}"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# BLOQUE 7 — PHP LEGACY (srv-cpan02)
# ═══════════════════════════════════════════════════════════════════════════════
section "BLOQUE 7 — PHP LEGACY (srv-cpan02 — ${SRV_PHP})"

if [ "$STATUS_PHP" = "ok" ]; then
  APACHE=$(qs "$SRV_PHP" "$PASS_PHP" "$SUDO_PHP" "$USER_PHP" "systemctl is-active httpd")
  show "Apache httpd" "$APACHE"
  WEB_DIRS=$(qs "$SRV_PHP" "$PASS_PHP" "$SUDO_PHP" "$USER_PHP" "ls -la /var/www/html/ 2>/dev/null | head -20")
  block "/var/www/html/" "$WEB_DIRS"
else
  out "${YELLOW}  srv-cpan02 inaccesible${NC}"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# BLOQUE 8 — PREGUNTAS AL ADMINISTRADOR
# ═══════════════════════════════════════════════════════════════════════════════
section "BLOQUE 8 — PREGUNTAS PENDIENTES PARA EL ADMINISTRADOR"

out ""
out "${BOLD}${YELLOW}  Responde estas preguntas junto con el reporte.${NC}"
out "  Con esa información se generará el script de despliegue definitivo."
out ""

out "  ┌─ A: DNS y ruteo ──────────────────────────────────────────────────┐"
out "  │                                                                   │"
out "  │  A1. ¿Tienes acceso al panel DNS de ircnl.gob.mx para crear       │"
out "  │      el registro A de tablero.ircnl.gob.mx?                       │"
out "  │      (¿O hay que pedírselo al área de redes/DGTIC?)               │"
out "  │                                                                   │"
out "  │  A2. El registro tablero debe apuntar a:                          │"
out "  │      ¿Al Proxy Manager (${SRV_PROXY}) para que él                │"
out "  │       enrute hacia srv-cpan01 (${SRV_GATEWAY})?                  │"
out "  │      ¿O directamente a srv-cpan01 (${SRV_GATEWAY})?              │"
out "  │                                                                   │"
out "  └───────────────────────────────────────────────────────────────────┘"
out ""

out "  ┌─ B: Certificado SSL ──────────────────────────────────────────────┐"
out "  │                                                                   │"
out "  │  B1. ¿El certificado SSL de tablero.ircnl.gob.mx se generará      │"
out "  │      en el Proxy Manager (${SRV_PROXY})?                         │"
out "  │      (Es lo más lógico ya que es el generador de certificados)    │"
out "  │                                                                   │"
out "  │  B2. ¿El Proxy Manager ya genera certificados para otros           │"
out "  │      subdominios? (ej: correo.ircnl.gob.mx, etc.)                │"
out "  │      Si sí, se usa el mismo proceso para tablero.                 │"
out "  │                                                                   │"
out "  │  B3. ¿El servidor ${SRV_PROXY} tiene salida directa a Internet    │"
out "  │      para validar dominios con Let's Encrypt?                     │"
out "  │                                                                   │"
out "  └───────────────────────────────────────────────────────────────────┘"
out ""

out "  ┌─ C: Roles y usuarios ─────────────────────────────────────────────┐"
out "  │                                                                   │"
out "  │  C1. ¿Cuántos usuarios necesitan acceso al dashboard?             │"
out "  │                                                                   │"
out "  │  C2. Propuesta de roles — ¿son correctos?:                        │"
out "  │      ADMIN      → Acceso total + gestión de usuarios              │"
out "  │      DIRECTOR   → Lectura total, sin gestión de usuarios          │"
out "  │      SUPERVISOR → Todos los tabs excepto gestión de usuarios      │"
out "  │      CONSULTA   → Solo resumen, etapas y trámites                 │"
out "  │                                                                   │"
out "  │  C3. ¿LDAP/Active Directory o cuentas locales en PostgreSQL?      │"
out "  │                                                                   │"
out "  │  C4. ¿Quién administra los usuarios? ¿Panel web o SQL directo?    │"
out "  │                                                                   │"
out "  └───────────────────────────────────────────────────────────────────┘"
out ""

out "  ┌─ D: Lista de usuarios iniciales ─────────────────────────────────┐"
out "  │                                                                   │"
out "  │  D1. Proporciona la lista:                                        │"
out "  │      Nombre completo | correo@ircnl.gob.mx | ROL                 │"
out "  │                                                                   │"
out "  │  D2. ¿Username = correo completo, o alias corto (jjhernandez)?   │"
out "  │                                                                   │"
out "  └───────────────────────────────────────────────────────────────────┘"
out ""

out "  ┌─ E: Sesiones y política de seguridad ────────────────────────────┐"
out "  │                                                                   │"
out "  │  E1. ¿Solo desde intranet IRCNL, o también desde Internet?       │"
out "  │  E2. ¿Tiempo de sesión inactiva? (recomendado: 30 minutos)       │"
out "  │  E3. ¿Política de contraseñas? (recomendado: mínimo 12 chars)    │"
out "  │  E4. ¿Se necesita 'Olvidé mi contraseña' por correo?             │"
out "  │      Si sí: ¿hay servidor SMTP disponible?                        │"
out "  │                                                                   │"
out "  └───────────────────────────────────────────────────────────────────┘"

# ═══════════════════════════════════════════════════════════════════════════════
# FIN
# ═══════════════════════════════════════════════════════════════════════════════
section "FIN DEL DIAGNÓSTICO"
out "  Reporte : ${BOLD}${REPORT}${NC}"
out "  Duración: $((SECONDS)) segundos"
out ""
out "${GREEN}${BOLD}  Diagnóstico completado. Ningún cambio fue realizado.${NC}"
out ""
out "${YELLOW}  ⚠ Recuerda borrar la contraseña del script o eliminar el archivo:${NC}"
out "    rm ~/ircnl-deploy/diagnose-ircnl.sh"

echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════${NC}"
echo -e "  Reporte guardado en:"
echo -e "  ${CYAN}${REPORT}${NC}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════${NC}"
echo ""
