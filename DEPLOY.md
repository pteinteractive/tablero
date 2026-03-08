# DEPLOY.md — Guía de Despliegue IRCNL Tablero
## Sprint S1-5 | 07/03/2026

---

## 1. Actualización Nginx Proxy Manager — Puerto 3000 → 5000 (Nodo .52)

### Contexto
El Nodo .52 ejecuta actualmente PM2 "api-ircnl" (Node.js) en el puerto **3000**.
La migración a ASP.NET Core 8 usa el puerto **5000** (producción) y **5001** (desarrollo .54).

### Proxy Host afectado

| Proxy ID | Dominio | Cambio requerido |
|---|---|---|
| Proxy 91 | `tablero.ircnl.gob.mx` | `/api/*` → `.52:5000` (desde `.52:3000`) |

### Pasos en Nginx Proxy Manager (UI Web — Nodo .158)

1. Acceder a `http://10.150.111.158:81` con credenciales de administrador
2. Ir a **Proxy Hosts** → seleccionar Proxy 91 (`tablero.ircnl.gob.mx`)
3. En la pestaña **Details**, localizar la regla de proxy para `/api/*`
4. Cambiar **Forward Port** de `3000` a `5000`
5. Guardar y verificar que el certificado SSL permanece activo

### Validación post-cambio

```bash
# Desde cualquier nodo interno
curl -s https://tablero.ircnl.gob.mx/api/health

# Respuesta esperada:
# {"status":"ok","timestamp":"...","version":"fase2-s1"}
```

### Rollback

Si la API .NET no responde, revertir el puerto a `3000` en Nginx Proxy Manager.
PM2 "api-ircnl" permanece en standby hasta que el .NET esté validado en producción.

---

## 2. Configuración de Nodos

### Nodo .52 — Producción (Ubuntu 24.04)

```bash
# Desde .50 (nodo maestro SSH)
ssh administrator@10.150.111.52

# Ejecutar script de instalación
bash /ruta/al/repo/deploy/setup-nodo52-dotnet.sh

# Completar .env
nano /opt/tablero/fase2/.env

# Verificar conectividad a PostgreSQL .53
psql postgresql://usr_ircnl_prod:PASSWORD@10.150.111.53:5432/db_ircnl_main -c "SELECT COUNT(*) FROM hubspot_tickets;"

# Iniciar servicios .NET
systemctl start tablero-api
systemctl start tablero-worker

# Smoke test
curl http://10.150.111.52:5000/api/health

# Una vez validado, detener PM2 legacy
pm2 stop api-ircnl
pm2 save
```

### Nodo .54 — Sandbox desarrollo (Ubuntu 24.04)

```bash
# Desde .50 (nodo maestro SSH)
ssh administrator@10.150.111.54

# Ejecutar script de instalación
bash /ruta/al/repo/deploy/setup-nodo54.sh

# Completar .env de desarrollo
nano /opt/tablero/fase2/.env

# Iniciar servicio
systemctl start tablero-api-dev

# Smoke test
curl http://10.150.111.54:5001/api/health
```

---

## 3. Variables de entorno requeridas

Ver `.env.example` en la raíz del repositorio.

Responsables de cada variable:

| Variable | Responsable |
|---|---|
| `HUBSPOT_API_KEY` | Javier Hernández |
| `DATABASE_URL*` | Maricarmen Valdez |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | Maximiliano Álvarez |
| `PGCRYPTO_KEY` | Maricarmen Valdez |
| `REDIS_PASSWORD` | Fabián Arredondo |

---

## 4. Generación de claves RSA para JWT RS256

```bash
# Generar par de claves RSA 2048 bits
openssl genrsa -out jwt_private.pem 2048
openssl rsa -in jwt_private.pem -pubout -out jwt_public.pem

# Verificar
openssl rsa -in jwt_private.pem -check -noout

# Formatear para .env (reemplazar saltos de línea por \n)
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' jwt_private.pem
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' jwt_public.pem

# IMPORTANTE: eliminar los .pem locales después de copiar al .env
rm jwt_private.pem jwt_public.pem
```

---

## 5. Secuencia de despliegue completa (Sprint 1)

```
[S1-1] .env.example actualizado         ✅ S1-5
[S1-2] db_seguridad_acceso creada        ⏳
[S1-3] BackgroundService compilando      ✅ S1-3
[S1-4] Validación paralela PM2 vs .NET   ✅ S1-4
[S1-5] Nodo .54 sandbox configurado      ✅ S1-5
       .NET SDK en .54 instalado         → ejecutar setup-nodo54.sh
       .NET SDK en .52 instalado         → ejecutar setup-nodo52-dotnet.sh
[S1-6] Nginx: /api/* → 5000             → pendiente tras validar .NET en .52
[S1-7] PM2 deshabilitado en .52          → tras validar Nginx
```

---

## 6. Comandos de monitoreo

```bash
# Estado servicios .NET
systemctl status tablero-api
systemctl status tablero-worker
systemctl status tablero-api-dev   # .54 solamente

# Logs en tiempo real
journalctl -u tablero-api -f
journalctl -u tablero-worker -f

# Estado PM2 (legacy, mientras coexiste)
pm2 status
pm2 logs api-ircnl

# PostgreSQL desde .53
ssh administrator@10.150.111.53 \
  "sudo -i -u postgres psql -d db_ircnl_main -c 'SELECT COUNT(*) FROM hubspot_tickets;'"

# Sync log — última sincronización
ssh administrator@10.150.111.53 \
  "sudo -i -u postgres psql -d db_ircnl_main -c 'SELECT * FROM sync_log ORDER BY inicio DESC LIMIT 5;'"
```
