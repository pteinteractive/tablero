using Dapper;
using IRCNL.Shared.Models;
using Npgsql;

namespace IRCNL.Shared.Repositories;

public class SyncLogRepository : ISyncLogRepository
{
    private readonly string _connectionString;

    public SyncLogRepository(string connectionString)
    {
        _connectionString = connectionString;
    }

    private NpgsqlConnection Conexion() => new(_connectionString);

    public async Task<long> IniciarSyncAsync(string tipo, string servidor)
    {
        const string sql = """
            INSERT INTO sync_log (tipo, inicio, tickets_procesados, tickets_nuevos, tickets_actualizados, tickets_error, servidor)
            VALUES (@Tipo, NOW(), 0, 0, 0, 0, @Servidor)
            RETURNING id;
            """;
        await using var conn = Conexion();
        return await conn.ExecuteScalarAsync<long>(sql, new { Tipo = tipo, Servidor = servidor });
    }

    public async Task FinalizarSyncAsync(long id, int procesados, int nuevos, int actualizados, int errores, string? ultimoTicketId, string? errorDetalle = null)
    {
        const string sql = """
            UPDATE sync_log SET
                fin = NOW(),
                duracion_ms = EXTRACT(EPOCH FROM (NOW() - inicio))::int * 1000,
                tickets_procesados = @Procesados,
                tickets_nuevos = @Nuevos,
                tickets_actualizados = @Actualizados,
                tickets_error = @Errores,
                ultimo_ticket_id = @UltimoTicketId,
                error_detalle = @ErrorDetalle
            WHERE id = @Id;
            """;
        await using var conn = Conexion();
        await conn.ExecuteAsync(sql, new { Id = id, Procesados = procesados, Nuevos = nuevos, Actualizados = actualizados, Errores = errores, UltimoTicketId = ultimoTicketId, ErrorDetalle = errorDetalle });
    }
}
