using IRCNL.Shared.Models;

namespace IRCNL.Shared.Repositories;

public interface ITicketRepository
{
    Task<HubspotTicket?> ObtenerPorIdAsync(string id);
    Task<int> ContarTotalAsync();
    Task UpsertAsync(HubspotTicket ticket);
    Task UpsertLoteAsync(IEnumerable<HubspotTicket> tickets);
    /// <summary>
    /// Upsert por lote con conteo de inserciones vs actualizaciones.
    /// Maneja errores por registro sin abortar el ciclo.
    /// Retorna (nuevos, actualizados, errores).
    /// </summary>
    Task<(int nuevos, int actualizados, int errores)> UpsertLoteConConteoAsync(IEnumerable<HubspotTicket> tickets);
}
