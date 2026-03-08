namespace IRCNL.Shared.Models;

/// <summary>
/// Representa un registro en sync_log (13 columnas reales).
/// </summary>
public class SyncLog
{
    public long Id { get; set; }
    public string? Tipo { get; set; }
    public DateTimeOffset Inicio { get; set; }
    public DateTimeOffset? Fin { get; set; }
    public int? DuracionMs { get; set; }
    public int TicketsProcesados { get; set; }
    public int TicketsNuevos { get; set; }
    public int TicketsActualizados { get; set; }
    public int TicketsError { get; set; }
    public string? UltimoTicketId { get; set; }
    public string? Descripcion { get; set; }
    public string? ErrorDetalle { get; set; }
    public string? Servidor { get; set; }
}
