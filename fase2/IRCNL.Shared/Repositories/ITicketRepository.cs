using IRCNL.Shared.Models;

namespace IRCNL.Shared.Repositories;

public interface ITicketRepository
{
    Task<HubspotTicket?> ObtenerPorIdAsync(string id);
    Task<int> ContarTotalAsync();
    Task UpsertAsync(HubspotTicket ticket);
    Task UpsertLoteAsync(IEnumerable<HubspotTicket> tickets);
}
