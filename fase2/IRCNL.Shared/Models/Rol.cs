using System.Text.Json;

namespace IRCNL.Shared.Models;

/// <summary>
/// Roles del sistema: ADMIN, DIRECTOR, SUPERVISOR, CONSULTA.
/// Permisos como JSONB — actualizar tabs Fase 2 en S1 (DT-14).
/// </summary>
public class Rol
{
    public int Id { get; set; }
    public string Nombre { get; set; } = default!;
    public string? Descripcion { get; set; }
    public JsonDocument? Permisos { get; set; }
    public DateTimeOffset CreadoEn { get; set; }
}
