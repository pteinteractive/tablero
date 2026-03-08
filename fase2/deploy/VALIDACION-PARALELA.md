# Validación Paralela — Node.js vs .NET Worker

> Sprint 1 / S1-4 | Objetivo: confirmar paridad del BackgroundService .NET antes de apagar PM2.

## Estrategia

Ejecutar ambos workers en paralelo durante **3 ciclos de sync** (~3 horas con `HUBSPOT_SYNC_INTERVAL_HOURS=1`).
Comparar métricas en `sync_log` para verificar consistencia en tickets procesados, nuevos y actualizados.

---

## Paso 1 — Confirmar que PM2 sigue activo antes de la validación

```bash
ssh administrator@10.150.111.52 "pm2 status"
# Esperado: "api-ircnl" en estado "online"

# Registrar última entrada de PM2 antes de la comparación
ssh administrator@10.150.111.52 \
  "psql \$DATABASE_URL -c \
  \"SELECT tipo, inicio, tickets_procesados, tickets_nuevos, tickets_actualizados, descripcion \
    FROM sync_log \
    ORDER BY inicio DESC LIMIT 3;\""
```

---

## Paso 2 — Iniciar worker .NET (si no está corriendo)

```bash
ssh administrator@10.150.111.52 "sudo systemctl start ircnl-worker && sudo systemctl status ircnl-worker --no-pager"
```

---

## Paso 3 — Monitorear ciclos en tiempo real

```bash
# Terminal 1: logs del worker .NET
ssh administrator@10.150.111.52 "sudo journalctl -u ircnl-worker -f --no-pager"

# Terminal 2: consulta de sync_log cada 5 minutos (ejecutar manualmente o en bucle)
watch -n 300 'ssh administrator@10.150.111.52 \
  "sudo -i -u postgres psql -d db_ircnl_main -c \
  \"SELECT descripcion, inicio, tickets_procesados, tickets_nuevos, tickets_actualizados, tickets_error \
    FROM sync_log \
    ORDER BY inicio DESC LIMIT 10;\""'
```

---

## Paso 4 — Comparar 3 ciclos tras ~3 horas

```bash
# Desde .53 — comparar métricas por fuente (nodejs vs dotnet)
# NOTA: sync_log.descripcion debe incluir el identificador de fuente
ssh administrator@10.150.111.52 \
  "sudo -i -u postgres psql -d db_ircnl_main" << 'SQL'

-- Últimos 6 registros (3 por fuente esperados)
SELECT
    descripcion                               AS fuente,
    COUNT(*)                                  AS ciclos,
    ROUND(AVG(tickets_procesados))            AS avg_procesados,
    ROUND(AVG(tickets_nuevos))                AS avg_nuevos,
    ROUND(AVG(tickets_actualizados))          AS avg_actualizados,
    ROUND(AVG(duracion_ms) / 1000.0, 1)      AS avg_duracion_seg,
    SUM(tickets_error)                        AS total_errores,
    MAX(inicio)                               AS ultimo_ciclo
FROM sync_log
WHERE inicio >= NOW() - INTERVAL '4 hours'
GROUP BY descripcion
ORDER BY descripcion;

SQL
```

### Criterios de aprobación (DoD validación paralela)

| Métrica | Condición |
|---|---|
| `avg_procesados` | Diferencia ≤ 5% entre nodejs y dotnet |
| `avg_nuevos + avg_actualizados` | Dentro del rango esperado (≈ variación normal HubSpot) |
| `total_errores` | 0 errores en dotnet durante los 3 ciclos |
| `avg_duracion_seg` | Dotnet ≤ 2× tiempo de nodejs (aceptable en primera versión) |
| Registros en hubspot_tickets | `SELECT COUNT(*) FROM hubspot_tickets;` ≥ 131,285 |

```bash
# Verificación final de count
ssh administrator@10.150.111.52 \
  "sudo -i -u postgres psql -d db_ircnl_main -c 'SELECT COUNT(*) FROM hubspot_tickets;'"
```

---

## Paso 5 — Apagar PM2 tras validación exitosa

> **DETENER si cualquier criterio falla.** Escalar a Javier Hernández si hay discrepancias en sync_log.

```bash
# 5.1 Detener el proceso PM2 del worker.js
ssh administrator@10.150.111.52 "pm2 stop api-ircnl"

# 5.2 Verificar que solo el worker .NET sigue generando sync_log
ssh administrator@10.150.111.52 \
  "sudo -i -u postgres psql -d db_ircnl_main -c \
  \"SELECT descripcion, inicio, tickets_procesados FROM sync_log ORDER BY inicio DESC LIMIT 3;\""

# 5.3 Esperar 1 ciclo completo (1h) y confirmar que el worker .NET opera solo
# Si es correcto → eliminar PM2 del startup
ssh administrator@10.150.111.52 "pm2 delete api-ircnl && pm2 save"

# 5.4 Deshabilitar PM2 del inicio automático del sistema
ssh administrator@10.150.111.52 "pm2 unstartup systemd"
# Ejecutar el comando sudo que PM2 imprima como output del comando anterior

# 5.5 Confirmar estado final
ssh administrator@10.150.111.52 "pm2 list && sudo systemctl status ircnl-worker --no-pager"
```

---

## Paso 6 — Rollback (si la validación falla)

```bash
# Reactivar PM2 sin borrar nada
ssh administrator@10.150.111.52 "pm2 start api-ircnl"

# Detener worker .NET sin desinstalarlo
ssh administrator@10.150.111.52 "sudo systemctl stop ircnl-worker"

# Documentar el error y escalar a Javier Hernández con:
# - Output de sync_log comparison (Paso 4)
# - Últimos 100 líneas del journal del worker .NET
ssh administrator@10.150.111.52 "sudo journalctl -u ircnl-worker -n 100 --no-pager"
```

---

*Fase 2 / S1-4 — Validación Paralela — Criterio: 3 ciclos sin errores antes de apagar PM2*
