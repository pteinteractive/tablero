namespace IRCNL.Shared.DTOs;

public class LoginResponse
{
    public string Token { get; set; } = default!;
    public DateTimeOffset Expiracion { get; set; }
    public string NombreCompleto { get; set; } = default!;
    public string Rol { get; set; } = default!;
}
