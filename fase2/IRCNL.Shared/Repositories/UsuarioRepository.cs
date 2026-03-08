using Dapper;
using IRCNL.Shared.Models;
using Npgsql;

namespace IRCNL.Shared.Repositories;

/// <summary>
/// Repositorio Dapper para db_seguridad_acceso.usuarios (DT-15).
/// Todos los accesos usan usr_ircnl_prod sobre db_seguridad_acceso.
/// </summary>
public class UsuarioRepository : IUsuarioRepository
{
    private readonly string _connectionString;

    public UsuarioRepository(string connectionString)
    {
        _connectionString = connectionString;
    }

    public async Task<Usuario?> ObtenerPorUsernameAsync(string username)
    {
        await using var conn = new NpgsqlConnection(_connectionString);

        var usuario = await conn.QueryFirstOrDefaultAsync<Usuario>(
            @"SELECT id, username, nombre_completo, password_hash, rol_id,
                     activo, debe_cambiar_pass, intentos_fallidos, bloqueado_hasta,
                     ultimo_login, creado_en, modificado_en
              FROM usuarios WHERE username = @Username",
            new { Username = username });

        if (usuario is not null)
        {
            usuario.Rol = await conn.QueryFirstOrDefaultAsync<Rol>(
                "SELECT id, nombre, descripcion, creado_en FROM roles WHERE id = @RolId",
                new { RolId = usuario.RolId });
        }

        return usuario;
    }

    public async Task ActualizarIntentosFallidosAsync(int id, int intentos, DateTimeOffset? bloqueadoHasta)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.ExecuteAsync(
            @"UPDATE usuarios SET intentos_fallidos = @Intentos, bloqueado_hasta = @BloqueadoHasta,
                     modificado_en = NOW() WHERE id = @Id",
            new { Id = id, Intentos = intentos, BloqueadoHasta = bloqueadoHasta });
    }

    public async Task ActualizarUltimoLoginAsync(int id)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.ExecuteAsync(
            @"UPDATE usuarios SET ultimo_login = NOW(), intentos_fallidos = 0,
                     bloqueado_hasta = NULL, modificado_en = NOW() WHERE id = @Id",
            new { Id = id });
    }

    public async Task RegistrarSesionAsync(int usuarioId, string tokenHash, string? ip, string? userAgent, DateTimeOffset expiracion)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.ExecuteAsync(
            @"INSERT INTO sesiones (usuario_id, token_hash, ip_origen, user_agent, expira_en)
              VALUES (@UsuarioId, @TokenHash, @Ip::inet, @UserAgent, @ExpiraEn)",
            new { UsuarioId = usuarioId, TokenHash = tokenHash, Ip = ip, UserAgent = userAgent, ExpiraEn = expiracion });
    }

    public async Task InvalidarSesionAsync(string tokenHash)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.ExecuteAsync(
            "UPDATE sesiones SET activa = FALSE WHERE token_hash = @TokenHash",
            new { TokenHash = tokenHash });
    }

    public async Task RegistrarAuditoriaAsync(int? usuarioId, string username, string evento, string? ip, string? userAgent, string? detalle)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.ExecuteAsync(
            @"INSERT INTO auditoria_accesos (usuario_id, username, evento, ip_origen, user_agent, detalle)
              VALUES (@UsuarioId, @Username, @Evento, @Ip::inet, @UserAgent, @Detalle)",
            new { UsuarioId = usuarioId, Username = username, Evento = evento, Ip = ip, UserAgent = userAgent, Detalle = detalle });
    }
}
