namespace IRCNL.Shared.Models;

/// <summary>
/// Representa un ticket de HubSpot sincronizado en db_ircnl_main.hubspot_tickets.
/// 37 columnas exactas del esquema real (verificado 07/03/2026).
/// Campos LFPDPPP cifrados con pgcrypto: nombre_persona_tramite, correo_solicitante, curp, expediente_catastral.
/// </summary>
public class HubspotTicket
{
    public string Id { get; set; } = default!;                          // PK - hs_object_id
    public string? Subject { get; set; }
    public string? ExpedienteCatastral { get; set; }                    // 🔒 LFPDPPP
    public string? ExpedienteMunicipio { get; set; }
    public string? Folio { get; set; }                                  // ⚠️ 126,647 vacíos (DT-05)
    public string? NombrePersonaTramite { get; set; }                   // 🔒 LFPDPPP
    public string? CorreoSolicitante { get; set; }                      // 🔒 LFPDPPP
    public string? Curp { get; set; }                                   // 🔒 LFPDPPP
    public string? TramiteSolicitado1 { get; set; }
    public string? TipoTramite { get; set; }
    public bool? EsMasiva { get; set; }
    public string? HsPipeline { get; set; }
    public string? HsPipelineStage { get; set; }
    public string? HubspotOwnerId { get; set; }                         // text, NO bigint
    public DateTimeOffset? HubspotOwnerAssigneddate { get; set; }
    public string? HubspotTeamId { get; set; }
    public DateTimeOffset? Createdate { get; set; }
    public DateTimeOffset? ClosedDate { get; set; }                     // OJO: "closed_date" NO "closedate"
    public DateTimeOffset? FirstAgentReplyDate { get; set; }
    public DateTimeOffset? LastReplyDate { get; set; }
    public DateTimeOffset? HsLastMessageReceivedAt { get; set; }
    public DateTimeOffset? HsLastMessageSentAt { get; set; }
    public long? TimeToClose { get; set; }                              // milisegundos
    public long? TimeToFirstAgentReply { get; set; }                    // milisegundos
    public long? HsTimeToFirstRepAssignment { get; set; }               // bigint, NO interval
    public string? HsTimeToFirstResponseSlaStatus { get; set; }
    public string? HsTimeToCloseSlaStatus { get; set; }
    public int? HsNumTimesContacted { get; set; }
    public int? NumNotes { get; set; }
    public string? HsFormId { get; set; }
    public string? Tiempos { get; set; }
    public string? Nombredia { get; set; }
    public string? Solicitud { get; set; }
    public string? IneTicket { get; set; }
    public string? Content { get; set; }
    public DateTimeOffset? HsLastmodifieddate { get; set; }
    public DateTimeOffset? SyncedAt { get; set; }                       // campo local, NO HubSpot
}
