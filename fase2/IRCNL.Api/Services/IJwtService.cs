using IRCNL.Shared.Models;

namespace IRCNL.Api.Services;

public interface IJwtService
{
    string GenerarToken(Usuario usuario);
    DateTimeOffset ObtenerExpiracion();
}
