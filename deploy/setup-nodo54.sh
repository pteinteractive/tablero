#!/usr/bin/env bash
# =============================================================================
# setup-nodo54.sh — Configuración sandbox de desarrollo (.54)
# Ubuntu 24.04 | 7.8Gi RAM | Puerto 5001
# Sprint S1-5 | 07/03/2026
#
# USO: bash setup-nodo54.sh
# Ejecutar como: administrator en 10.150.111.54
# Prerequisito: acceso SSH sin password desde .50
# =============================================================================

set -euo pipefail

REPO_URL="git@github.com:pteinteractive/tablero.git"
APP_DIR="/opt/tablero"
SERVICE_NAME="tablero-api-dev"
DOTNET_VERSION="8.0"
APP_PORT=5001
ENV_FILE="$APP_DIR/fase2/.env"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
error() { echo "[ERROR] $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 1. Verificar OS
# ---------------------------------------------------------------------------
log "Verificando sistema operativo..."
. /etc/os-release
[[ "$ID" == "ubuntu" && "$VERSION_ID" == "24.04" ]] \
  || error "Este script requiere Ubuntu 24.04. Detectado: $PRETTY_NAME"

# ---------------------------------------------------------------------------
# 2. Actualizar paquetes base
# ---------------------------------------------------------------------------
log "Actualizando paquetes base..."
apt-get update -qq
apt-get install -y -qq \
  curl wget git unzip apt-transport-https ca-certificates \
  software-properties-common gnupg2

# ---------------------------------------------------------------------------
# 3. Instalar .NET SDK 8
# ---------------------------------------------------------------------------
log "Instalando .NET SDK $DOTNET_VERSION..."

if dotnet --version 2>/dev/null | grep -q "^8\."; then
  log ".NET SDK 8 ya está instalado: $(dotnet --version)"
else
  # Paquete oficial Microsoft para Ubuntu 24.04
  wget -q https://packages.microsoft.com/config/ubuntu/24.04/packages-microsoft-prod.deb \
    -O /tmp/packages-microsoft-prod.deb
  dpkg -i /tmp/packages-microsoft-prod.deb
  rm -f /tmp/packages-microsoft-prod.deb

  apt-get update -qq
  apt-get install -y -qq dotnet-sdk-8.0
fi

log ".NET SDK: $(dotnet --version)"

# ---------------------------------------------------------------------------
# 4. Clonar repositorio
# ---------------------------------------------------------------------------
log "Configurando directorio de aplicación en $APP_DIR..."

if [[ -d "$APP_DIR/.git" ]]; then
  log "Repositorio ya existe. Haciendo pull..."
  git -C "$APP_DIR" pull origin main
else
  git clone "$REPO_URL" "$APP_DIR"
fi

# ---------------------------------------------------------------------------
# 5. Crear archivo .env para desarrollo
# ---------------------------------------------------------------------------
log "Creando .env de desarrollo (completar valores reales)..."

if [[ -f "$ENV_FILE" ]]; then
  log ".env ya existe en $ENV_FILE — no se sobreescribe."
else
  cat > "$ENV_FILE" << 'EOF'
# ─── .env Nodo .54 — Ambiente de DESARROLLO ──────────────────────────────────
# IMPORTANTE: completar con valores reales antes de iniciar el servicio
# NUNCA subir este archivo a git

# ─── Base de datos PostgreSQL ──────────────────────────────────────────────────
DATABASE_URL=postgresql://usr_ircnl_prod:CAMBIAR_PASSWORD@10.150.111.53:5432/db_ircnl_main
DATABASE_URL_POA=postgresql://usr_ircnl_prod:CAMBIAR_PASSWORD@10.150.111.53:5432/db_poa_2026
DATABASE_URL_CATASTRO=postgresql://usr_ircnl_prod:CAMBIAR_PASSWORD@10.150.111.53:5432/db_catastro_tramites
DATABASE_URL_SEGURIDAD=postgresql://usr_ircnl_prod:CAMBIAR_PASSWORD@10.150.111.53:5432/db_seguridad_acceso
DATABASE_URL_SALUD=postgresql://usr_ircnl_prod:CAMBIAR_PASSWORD@10.150.111.53:5432/db_salud_integral

# ─── HubSpot API ───────────────────────────────────────────────────────────────
HUBSPOT_API_KEY=CAMBIAR_POR_TOKEN_HUBSPOT

# ─── JWT RS256 (generar con: openssl genrsa -out private.pem 2048) ─────────────
JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nCAMBIAR\n-----END RSA PRIVATE KEY-----"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nCAMBIAR\n-----END PUBLIC KEY-----"
JWT_ISSUER=tablero.ircnl.gob.mx
JWT_AUDIENCE=tablero-api
JWT_EXPIRY_MINUTES=480

# ─── pgcrypto — cifrado LFPDPPP ────────────────────────────────────────────────
PGCRYPTO_KEY=CAMBIAR_POR_CLAVE_SIMETRICA_32BYTES

# ─── Redis (instalar S2) ───────────────────────────────────────────────────────
REDIS_CONNECTION=10.150.111.52:6379
REDIS_PASSWORD=CAMBIAR_POR_PASSWORD_REDIS

# ─── Sincronización HubSpot ────────────────────────────────────────────────────
HUBSPOT_SYNC_INTERVAL_HOURS=1

# ─── ASP.NET Core — Desarrollo ────────────────────────────────────────────────
ASPNETCORE_ENVIRONMENT=Development
ASPNETCORE_URLS=http://+:5001

# ─── Legacy (worker.js — soporte durante migración) ────────────────────────────
DB_HOST=10.150.111.53
DB_PORT=5432
DB_NAME=db_ircnl_main
DB_USER=usr_ircnl_prod
DB_PASS=CAMBIAR_PASSWORD
EOF
  log ".env creado en $ENV_FILE"
fi

# ---------------------------------------------------------------------------
# 6. Compilar proyecto
# ---------------------------------------------------------------------------
log "Compilando solución .NET..."
cd "$APP_DIR/fase2"
dotnet restore IRCNL.Tablero.sln
dotnet build IRCNL.Tablero.sln -c Release --no-restore

# ---------------------------------------------------------------------------
# 7. Publicar API
# ---------------------------------------------------------------------------
log "Publicando IRCNL.Api..."
dotnet publish IRCNL.Api/IRCNL.Api.csproj \
  -c Release \
  --no-restore \
  -o /opt/tablero-publish/api

# ---------------------------------------------------------------------------
# 8. Crear usuario de sistema para el servicio
# ---------------------------------------------------------------------------
log "Configurando usuario de sistema 'tablero'..."
id -u tablero &>/dev/null || useradd --system --no-create-home --shell /usr/sbin/nologin tablero
chown -R tablero:tablero /opt/tablero-publish/

# ---------------------------------------------------------------------------
# 9. Instalar servicio systemd
# ---------------------------------------------------------------------------
log "Instalando servicio systemd: $SERVICE_NAME..."

cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=IRCNL Tablero API — Nodo .54 Desarrollo
After=network.target

[Service]
Type=notify
User=tablero
WorkingDirectory=/opt/tablero-publish/api
ExecStart=/usr/bin/dotnet /opt/tablero-publish/api/IRCNL.Api.dll
Restart=always
RestartSec=10
KillSignal=SIGINT
SyslogIdentifier=$SERVICE_NAME
EnvironmentFile=$ENV_FILE
# Seguridad
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF

# ---------------------------------------------------------------------------
# 10. Habilitar y arrancar servicio
# ---------------------------------------------------------------------------
log "Habilitando servicio..."
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

log ""
log "============================================================"
log "  Nodo .54 configurado como sandbox de desarrollo"
log "  Servicio: $SERVICE_NAME"
log "  Puerto:   $APP_PORT"
log ""
log "  PENDIENTE: completar $ENV_FILE con valores reales"
log ""
log "  Comandos útiles:"
log "    systemctl start $SERVICE_NAME"
log "    systemctl status $SERVICE_NAME"
log "    journalctl -u $SERVICE_NAME -f"
log "    curl http://10.150.111.54:5001/api/health"
log "============================================================"
