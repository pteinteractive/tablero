#!/usr/bin/env bash
# =============================================================================
# setup-nodo52-dotnet.sh — Instalar .NET SDK 8 en Nodo .52 (Producción)
# Ubuntu 24.04 | 15Gi RAM | Puerto 5000
# Sprint S1-5 | 07/03/2026
#
# USO: bash setup-nodo52-dotnet.sh
# Ejecutar como: administrator en 10.150.111.52
# NOTA: PM2 "api-ircnl" (Node.js) permanece activo hasta migración completa
# =============================================================================

set -euo pipefail

DOTNET_VERSION="8.0"
APP_DIR="/opt/tablero"
PUBLISH_DIR="/opt/tablero-publish"
SERVICE_NAME="tablero-api"
ENV_FILE="$APP_DIR/fase2/.env"
REPO_URL="git@github.com:pteinteractive/tablero.git"
APP_PORT=5000

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
  curl wget git apt-transport-https ca-certificates \
  software-properties-common gnupg2

# ---------------------------------------------------------------------------
# 3. Instalar .NET SDK 8
# ---------------------------------------------------------------------------
log "Instalando .NET SDK $DOTNET_VERSION..."

if dotnet --version 2>/dev/null | grep -q "^8\."; then
  log ".NET SDK 8 ya está instalado: $(dotnet --version)"
else
  wget -q https://packages.microsoft.com/config/ubuntu/24.04/packages-microsoft-prod.deb \
    -O /tmp/packages-microsoft-prod.deb
  dpkg -i /tmp/packages-microsoft-prod.deb
  rm -f /tmp/packages-microsoft-prod.deb

  apt-get update -qq
  apt-get install -y -qq dotnet-sdk-8.0
fi

DOTNET_INSTALLED="$(dotnet --version)"
log ".NET SDK instalado: $DOTNET_INSTALLED"

# ---------------------------------------------------------------------------
# 4. Clonar o actualizar repositorio
# ---------------------------------------------------------------------------
log "Configurando directorio de aplicación en $APP_DIR..."

if [[ -d "$APP_DIR/.git" ]]; then
  log "Repositorio ya existe. Haciendo pull..."
  git -C "$APP_DIR" pull origin main
else
  git clone "$REPO_URL" "$APP_DIR"
fi

# ---------------------------------------------------------------------------
# 5. Compilar y publicar API
# ---------------------------------------------------------------------------
log "Compilando y publicando IRCNL.Api para producción..."
cd "$APP_DIR/fase2"
dotnet restore IRCNL.Tablero.sln
dotnet publish IRCNL.Api/IRCNL.Api.csproj \
  -c Release \
  --no-restore \
  -o "$PUBLISH_DIR/api"

# ---------------------------------------------------------------------------
# 6. Compilar y publicar Worker
# ---------------------------------------------------------------------------
log "Compilando y publicando IRCNL.Worker..."
dotnet publish IRCNL.Worker/IRCNL.Worker.csproj \
  -c Release \
  --no-restore \
  -o "$PUBLISH_DIR/worker"

# ---------------------------------------------------------------------------
# 7. Crear usuario de sistema
# ---------------------------------------------------------------------------
log "Configurando usuario de sistema 'tablero'..."
id -u tablero &>/dev/null || useradd --system --no-create-home --shell /usr/sbin/nologin tablero
chown -R tablero:tablero "$PUBLISH_DIR/"

# ---------------------------------------------------------------------------
# 8. Crear .env si no existe
# ---------------------------------------------------------------------------
if [[ ! -f "$ENV_FILE" ]]; then
  log "Creando .env de producción desde .env.example..."
  cp "$APP_DIR/.env.example" "$ENV_FILE"
  log "IMPORTANTE: editar $ENV_FILE con valores de producción antes de iniciar servicio"
fi

# ---------------------------------------------------------------------------
# 9. Instalar servicio systemd — API
# ---------------------------------------------------------------------------
log "Instalando servicio systemd: $SERVICE_NAME..."

cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=IRCNL Tablero API — Nodo .52 Producción
After=network.target postgresql.target
# Nota: PM2 "api-ircnl" (Node.js) se deshabilita cuando este servicio esté validado

[Service]
Type=notify
User=tablero
WorkingDirectory=$PUBLISH_DIR/api
ExecStart=/usr/bin/dotnet $PUBLISH_DIR/api/IRCNL.Api.dll
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
# 10. Instalar servicio systemd — Worker
# ---------------------------------------------------------------------------
log "Instalando servicio systemd: tablero-worker..."

cat > "/etc/systemd/system/tablero-worker.service" << EOF
[Unit]
Description=IRCNL Tablero Worker (HubSpot Sync) — Nodo .52 Producción
After=network.target ${SERVICE_NAME}.service

[Service]
Type=notify
User=tablero
WorkingDirectory=$PUBLISH_DIR/worker
ExecStart=/usr/bin/dotnet $PUBLISH_DIR/worker/IRCNL.Worker.dll
Restart=always
RestartSec=30
KillSignal=SIGINT
SyslogIdentifier=tablero-worker
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
# 11. Registrar servicios (sin arrancar — requiere .env completo)
# ---------------------------------------------------------------------------
log "Registrando servicios en systemd..."
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl enable tablero-worker

log ""
log "============================================================"
log "  .NET SDK 8 instalado en Nodo .52"
log "  Servicios registrados (NO iniciados)"
log ""
log "  PENDIENTE antes de iniciar:"
log "    1. Completar $ENV_FILE con valores reales"
log "    2. Verificar conectividad a .53 (PostgreSQL)"
log "    3. Actualizar Nginx Proxy Manager: /api/* → 5000"
log "       (ver DEPLOY.md — sección Nginx Proxy Manager)"
log "    4. Detener PM2 tras validar: pm2 stop api-ircnl"
log ""
log "  Comandos para iniciar:"
log "    systemctl start $SERVICE_NAME"
log "    systemctl start tablero-worker"
log "    curl http://10.150.111.52:5000/api/health"
log ""
log "  Monitoreo:"
log "    journalctl -u $SERVICE_NAME -f"
log "    journalctl -u tablero-worker -f"
log "============================================================"
