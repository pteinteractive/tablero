namespace IRCNL.Shared.DTOs;

/// <summary>
/// DTO liviano para listados y dashboards. No expone campos LFPDPPP.
/// </summary>
public class TicketResumen
{
    public string Id { get; set; } = default!;
    public string? Subject { get; set; }
    public string? TramiteSolicitado1 { get; set; }
    public string? TipoTramite { get; set; }
    public string? HsPipeline { get; set; }
    public string? HsPipelineStage { get; set; }
    public string? ExpedienteMunicipio { get; set; }
    public string? HubspotOwnerId { get; set; }
    public DateTimeOffset? Createdate { get; set; }
    public DateTimeOffset? ClosedDate { get; set; }
    public long? TimeToClose { get; set; }
    public string? HsTimeToCloseSlaStatus { get; set; }
}
