using Dapper;
using IRCNL.Shared.Models;
using Npgsql;

namespace IRCNL.Shared.Repositories;

/// <summary>
/// Repositorio Dapper para hubspot_tickets (37 columnas).
/// Upsert con ON CONFLICT (id) DO UPDATE para sync incremental.
/// </summary>
public class TicketRepository : ITicketRepository
{
    private readonly string _connectionString;

    public TicketRepository(string connectionString)
    {
        _connectionString = connectionString;
    }

    private NpgsqlConnection Conexion() => new(_connectionString);

    public async Task<HubspotTicket?> ObtenerPorIdAsync(string id)
    {
        const string sql = "SELECT * FROM hubspot_tickets WHERE id = @Id";
        await using var conn = Conexion();
        return await conn.QueryFirstOrDefaultAsync<HubspotTicket>(sql, new { Id = id });
    }

    public async Task<int> ContarTotalAsync()
    {
        const string sql = "SELECT COUNT(*) FROM hubspot_tickets";
        await using var conn = Conexion();
        return await conn.ExecuteScalarAsync<int>(sql);
    }

    public async Task UpsertAsync(HubspotTicket ticket)
    {
        await UpsertLoteAsync([ticket]);
    }

    public async Task UpsertLoteAsync(IEnumerable<HubspotTicket> tickets)
    {
        await UpsertLoteConConteoAsync(tickets);
    }

    public async Task<(int nuevos, int actualizados, int errores)> UpsertLoteConConteoAsync(
        IEnumerable<HubspotTicket> tickets)
    {
        // NOTA: campos LFPDPPP (nombre_persona_tramite, correo_solicitante, curp, expediente_catastral)
        // deben cifrarse con pgcrypto antes de insertar. Cifrado implementar en DT-09 (S2).
        //
        // xmax = 0 → INSERT (registro nuevo). xmax != 0 → UPDATE (conflicto resuelto).
        // Esta es la forma canónica de distinguir INSERT vs UPDATE en ON CONFLICT DO UPDATE.
        const string sql = """
            INSERT INTO hubspot_tickets (
                id, subject, expediente_catastral, expediente_municipio, folio,
                nombre_persona_tramite, correo_solicitante, curp,
                tramite_solicitado1, tipo_tramite, es_masiva,
                hs_pipeline, hs_pipeline_stage, hubspot_owner_id, hubspot_owner_assigneddate,
                hubspot_team_id, createdate, closed_date, first_agent_reply_date,
                last_reply_date, hs_last_message_received_at, hs_last_message_sent_at,
                time_to_close, time_to_first_agent_reply, hs_time_to_first_rep_assignment,
                hs_time_to_first_response_sla_status, hs_time_to_close_sla_status,
                hs_num_times_contacted, num_notes, hs_form_id,
                tiempos, nombredia, solicitud, ine_ticket, content,
                hs_lastmodifieddate, synced_at
            ) VALUES (
                @Id, @Subject, @ExpedienteCatastral, @ExpedienteMunicipio, @Folio,
                @NombrePersonaTramite, @CorreoSolicitante, @Curp,
                @TramiteSolicitado1, @TipoTramite, @EsMasiva,
                @HsPipeline, @HsPipelineStage, @HubspotOwnerId, @HubspotOwnerAssigneddate,
                @HubspotTeamId, @Createdate, @ClosedDate, @FirstAgentReplyDate,
                @LastReplyDate, @HsLastMessageReceivedAt, @HsLastMessageSentAt,
                @TimeToClose, @TimeToFirstAgentReply, @HsTimeToFirstRepAssignment,
                @HsTimeToFirstResponseSlaStatus, @HsTimeToCloseSlaStatus,
                @HsNumTimesContacted, @NumNotes, @HsFormId,
                @Tiempos, @Nombredia, @Solicitud, @IneTicket, @Content,
                @HsLastmodifieddate, NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
                subject = EXCLUDED.subject,
                expediente_catastral = EXCLUDED.expediente_catastral,
                expediente_municipio = EXCLUDED.expediente_municipio,
                folio = EXCLUDED.folio,
                nombre_persona_tramite = EXCLUDED.nombre_persona_tramite,
                correo_solicitante = EXCLUDED.correo_solicitante,
                curp = EXCLUDED.curp,
                tramite_solicitado1 = EXCLUDED.tramite_solicitado1,
                tipo_tramite = EXCLUDED.tipo_tramite,
                es_masiva = EXCLUDED.es_masiva,
                hs_pipeline = EXCLUDED.hs_pipeline,
                hs_pipeline_stage = EXCLUDED.hs_pipeline_stage,
                hubspot_owner_id = EXCLUDED.hubspot_owner_id,
                hubspot_owner_assigneddate = EXCLUDED.hubspot_owner_assigneddate,
                hubspot_team_id = EXCLUDED.hubspot_team_id,
                createdate = EXCLUDED.createdate,
                closed_date = EXCLUDED.closed_date,
                first_agent_reply_date = EXCLUDED.first_agent_reply_date,
                last_reply_date = EXCLUDED.last_reply_date,
                hs_last_message_received_at = EXCLUDED.hs_last_message_received_at,
                hs_last_message_sent_at = EXCLUDED.hs_last_message_sent_at,
                time_to_close = EXCLUDED.time_to_close,
                time_to_first_agent_reply = EXCLUDED.time_to_first_agent_reply,
                hs_time_to_first_rep_assignment = EXCLUDED.hs_time_to_first_rep_assignment,
                hs_time_to_first_response_sla_status = EXCLUDED.hs_time_to_first_response_sla_status,
                hs_time_to_close_sla_status = EXCLUDED.hs_time_to_close_sla_status,
                hs_num_times_contacted = EXCLUDED.hs_num_times_contacted,
                num_notes = EXCLUDED.num_notes,
                hs_form_id = EXCLUDED.hs_form_id,
                tiempos = EXCLUDED.tiempos,
                nombredia = EXCLUDED.nombredia,
                solicitud = EXCLUDED.solicitud,
                ine_ticket = EXCLUDED.ine_ticket,
                content = EXCLUDED.content,
                hs_lastmodifieddate = EXCLUDED.hs_lastmodifieddate,
                synced_at = NOW()
            RETURNING (xmax = 0) AS es_nuevo;
            """;

        int nuevos = 0, actualizados = 0, errores = 0;
        await using var conn = Conexion();
        await conn.OpenAsync();

        foreach (var ticket in tickets)
        {
            try
            {
                var esNuevo = await conn.ExecuteScalarAsync<bool>(sql, ticket);
                if (esNuevo) nuevos++; else actualizados++;
            }
            catch (Exception)
            {
                errores++;
            }
        }

        return (nuevos, actualizados, errores);
    }
}
