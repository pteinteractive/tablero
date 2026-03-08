namespace IRCNL.Shared.Models;

public class Sesion
{
    public Guid Id { get; set; }
    public int UsuarioId { get; set; }
    public string TokenHash { get; set; } = default!;
    public string? IpOrigen { get; set; }
    public string? UserAgent { get; set; }
    public DateTimeOffset CreadoEn { get; set; }
    public DateTimeOffset ExpiraEn { get; set; }
    public bool Activa { get; set; }
}
