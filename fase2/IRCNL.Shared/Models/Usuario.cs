namespace IRCNL.Shared.Models;

/// <summary>
/// Usuario del sistema. Migrar de db_ircnl_main a db_seguridad_acceso en S1 (DT-15).
/// Hashes bcrypt existentes compatibles con BCrypt.Net-Next.
/// </summary>
public class Usuario
{
    public int Id { get; set; }
    public string Username { get; set; } = default!;        // email
    public string NombreCompleto { get; set; } = default!;
    public string PasswordHash { get; set; } = default!;    // bcrypt
    public int RolId { get; set; }
    public bool Activo { get; set; }
    public bool DebeCambiarPass { get; set; }
    public int IntentosFallidos { get; set; }
    public DateTimeOffset? BloqueadoHasta { get; set; }
    public DateTimeOffset? UltimoLogin { get; set; }
    public DateTimeOffset CreadoEn { get; set; }
    public DateTimeOffset ModificadoEn { get; set; }

    public Rol? Rol { get; set; }
}
