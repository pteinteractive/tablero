using IRCNL.Shared.Models;

namespace IRCNL.Shared.Repositories;

public interface ISyncLogRepository
{
    Task<long> IniciarSyncAsync(string tipo, string servidor);
    Task FinalizarSyncAsync(long id, int procesados, int nuevos, int actualizados, int errores, string? ultimoTicketId, string? errorDetalle = null);
}
