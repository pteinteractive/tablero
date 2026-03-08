using IRCNL.Shared.Repositories;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IRCNL.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TicketsController : ControllerBase
{
    private readonly ITicketRepository _tickets;

    public TicketsController(ITicketRepository tickets)
    {
        _tickets = tickets;
    }

    /// <summary>Tab 2: Expediente Maestro</summary>
    [HttpGet("{id}")]
    public async Task<IActionResult> ObtenerPorId(string id)
    {
        var ticket = await _tickets.ObtenerPorIdAsync(id);
        if (ticket is null) return NotFound();
        // No exponer campos LFPDPPP directamente — mapear a DTO sin datos sensibles
        return Ok(ticket);
    }

    [HttpGet("count")]
    public async Task<IActionResult> Contar()
    {
        var total = await _tickets.ContarTotalAsync();
        return Ok(new { total });
    }
}
