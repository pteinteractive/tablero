using IRCNL.Shared.Models;

namespace IRCNL.Shared.Repositories;

public interface IUsuarioRepository
{
    Task<Usuario?> ObtenerPorUsernameAsync(string username);
    Task ActualizarIntentosFallidosAsync(int id, int intentos, DateTimeOffset? bloqueadoHasta);
    Task ActualizarUltimoLoginAsync(int id);
    Task RegistrarSesionAsync(int usuarioId, string tokenHash, string? ip, string? userAgent, DateTimeOffset expiracion);
    Task InvalidarSesionAsync(string tokenHash);
    Task RegistrarAuditoriaAsync(int? usuarioId, string username, string evento, string? ip, string? userAgent, string? detalle);
}
