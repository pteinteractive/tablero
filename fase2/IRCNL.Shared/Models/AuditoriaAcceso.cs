namespace IRCNL.Shared.Models;

public class AuditoriaAcceso
{
    public long Id { get; set; }
    public int? UsuarioId { get; set; }
    public string? Username { get; set; }
    public string Evento { get; set; } = default!;
    public string? IpOrigen { get; set; }
    public string? UserAgent { get; set; }
    public string? Detalle { get; set; }
    public DateTimeOffset CreadoEn { get; set; }
}
