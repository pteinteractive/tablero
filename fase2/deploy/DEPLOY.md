# Despliegue en Nodo .52 — Sprint 1 / S1-4

> Ejecutar desde Nodo Maestro (.50) via SSH. **No ejecutar en .50.**
> Usuario: `administrator`. Directorio destino: `/opt/ircnl/`.

---

## 0. Prerrequisitos (verificar antes de iniciar)

```bash
# Desde .50 — verificar que .NET 8 SDK está instalado en .52
ssh administrator@10.150.111.52 "dotnet --version"
# Esperado: 8.0.x  |  Si falla → instalar SDK primero (ver sección 0.1)

# Verificar PostgreSQL accesible desde .52
ssh administrator@10.150.111.52 \
  "psql postgresql://usr_ircnl_prod:@10.150.111.53:5432/db_ircnl_main -c 'SELECT 1;'"

# Verificar PM2 worker.js activo
ssh administrator@10.150.111.52 "pm2 list"
```

### 0.1 Instalar .NET 8 SDK en .52 (si no está instalado)

```bash
ssh administrator@10.150.111.52 << 'EOF'
wget https://packages.microsoft.com/config/ubuntu/24.04/packages-microsoft-prod.deb -O /tmp/pkg.deb
sudo dpkg -i /tmp/pkg.deb
sudo apt-get update
sudo apt-get install -y dotnet-sdk-8.0
dotnet --version
EOF
```

---

## 1. Publicar desde máquina de desarrollo (local → .52)

```bash
# Desde la raíz del repo, en la máquina de desarrollo
cd /ruta/al/repo/tablero/fase2

# Publicar API (self-contained, linux-x64)
dotnet publish IRCNL.Api/IRCNL.Api.csproj \
  -c Release \
  -r linux-x64 \
  --self-contained true \
  -o /tmp/publish/api

# Publicar Worker (self-contained, linux-x64)
dotnet publish IRCNL.Worker/IRCNL.Worker.csproj \
  -c Release \
  -r linux-x64 \
  --self-contained true \
  -o /tmp/publish/worker
```

---

## 2. Copiar binarios a .52

```bash
# Crear directorios destino en .52
ssh administrator@10.150.111.52 "sudo mkdir -p /opt/ircnl/api /opt/ircnl/worker /etc/ircnl"

# Copiar API
scp -r /tmp/publish/api/* administrator@10.150.111.52:/opt/ircnl/api/

# Copiar Worker
scp -r /tmp/publish/worker/* administrator@10.150.111.52:/opt/ircnl/worker/

# Permisos
ssh administrator@10.150.111.52 << 'EOF'
sudo chmod +x /opt/ircnl/api/IRCNL.Api
sudo chmod +x /opt/ircnl/worker/IRCNL.Worker
sudo chown -R www-data:www-data /opt/ircnl/
EOF
```

---

## 3. Crear archivos de variables de entorno en .52

> **IMPORTANTE:** Llenar valores reales antes de continuar. No commitear estos archivos.

```bash
# Crear /etc/ircnl/api.env
ssh administrator@10.150.111.52 "sudo tee /etc/ircnl/api.env > /dev/null" << 'EOF'
ASPNETCORE_ENVIRONMENT=Production
ASPNETCORE_URLS=http://+:5000
DATABASE_URL=postgresql://usr_ircnl_prod:CLAVE@10.150.111.53:5432/db_ircnl_main
DATABASE_URL_SEGURIDAD=postgresql://usr_ircnl_prod:CLAVE@10.150.111.53:5432/db_seguridad_acceso
JWT_PRIVATE_KEY_PATH=/etc/ircnl/jwt_private.pem
JWT_PUBLIC_KEY_PATH=/etc/ircnl/jwt_public.pem
JWT_ISSUER=tablero.ircnl.gob.mx
JWT_AUDIENCE=tablero-api
JWT_EXPIRY_MINUTES=480
REDIS_CONNECTION=10.150.111.52:6379
REDIS_PASSWORD=CLAVE_REDIS
EOF

# Crear /etc/ircnl/worker.env
ssh administrator@10.150.111.52 "sudo tee /etc/ircnl/worker.env > /dev/null" << 'EOF'
ASPNETCORE_ENVIRONMENT=Production
DATABASE_URL=postgresql://usr_ircnl_prod:CLAVE@10.150.111.53:5432/db_ircnl_main
HUBSPOT_API_KEY=BEARER_TOKEN_HUBSPOT
HUBSPOT_SYNC_INTERVAL_HOURS=1
PGCRYPTO_KEY=CLAVE_SIMETRICA_LFPDPPP
EOF

# Asegurar que solo root puede leerlos
ssh administrator@10.150.111.52 "sudo chmod 600 /etc/ircnl/api.env /etc/ircnl/worker.env"
```

---

## 4. Instalar y habilitar servicios systemd

```bash
# Copiar archivos .service desde el repo
scp fase2/deploy/ircnl-api.service administrator@10.150.111.52:/tmp/
scp fase2/deploy/ircnl-worker.service administrator@10.150.111.52:/tmp/

# Instalar en systemd
ssh administrator@10.150.111.52 << 'EOF'
sudo cp /tmp/ircnl-api.service /etc/systemd/system/
sudo cp /tmp/ircnl-worker.service /etc/systemd/system/
sudo systemctl daemon-reload

# Habilitar para inicio automático
sudo systemctl enable ircnl-api
sudo systemctl enable ircnl-worker
EOF
```

---

## 5. Iniciar servicios y smoke test

```bash
# Iniciar servicios
ssh administrator@10.150.111.52 << 'EOF'
sudo systemctl start ircnl-api
sudo systemctl start ircnl-worker

# Verificar estado
sudo systemctl status ircnl-api --no-pager
sudo systemctl status ircnl-worker --no-pager
EOF

# Smoke test API desde .50
curl -s http://10.150.111.52:5000/api/health | jq .

# Verificar logs en tiempo real (opcional)
ssh administrator@10.150.111.52 "sudo journalctl -u ircnl-worker -f --no-pager -n 50"
```

---

## 6. Verificar primer ciclo de sync .NET

```bash
# Esperar hasta 1h para el primer ciclo automático, o forzar manualmente via endpoint
# (implementar endpoint /api/sync/force en S1-5 si se necesita)

# Verificar en BD que sync_log tiene registros de la fuente dotnet
ssh administrator@10.150.111.53 \
  "sudo -i -u postgres psql -d db_ircnl_main -c \
  \"SELECT tipo, inicio, tickets_procesados, tickets_nuevos, tickets_actualizados \
    FROM sync_log \
    WHERE descripcion LIKE '%dotnet%' \
    ORDER BY inicio DESC LIMIT 5;\""
```

---

*Fase 2 / S1-4 — Nodo .52 Ubuntu 24.04 — Puerto API: 5000 — Self-contained linux-x64*
