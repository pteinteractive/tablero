using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using IRCNL.Shared.Models;
using IRCNL.Shared.Repositories;

namespace IRCNL.Worker.Services;

/// <summary>
/// BackgroundService que sincroniza tickets desde HubSpot CRM a hubspot_tickets.
/// Endpoint: POST /crm/v3/objects/tickets/search (NO GET).
/// Paginación por cursor (after). Ordenamiento hs_lastmodifieddate DESC.
/// Rate limit 10 req/s respetado con espera mínima de 100ms entre páginas.
/// Retry para 429 y errores transitorios delegado a Polly (Program.cs).
/// Intervalo configurable: HUBSPOT_SYNC_INTERVAL_HOURS (default 1h).
/// </summary>
public class HubSpotSyncService : BackgroundService
{
    // Propiedades exactas según CLAUDE.md sección 5.1
    private const string TICKET_PROPS =
        "subject,expediente_catastral,expediente_municipio,folio," +
        "nombre_persona_tramite,correo_solicitante,curp," +
        "tramite_solicitado1,tipo_tramite,es_masiva," +
        "hs_pipeline,hs_pipeline_stage,hubspot_owner_id,hubspot_owner_assigneddate," +
        "hubspot_team_id,createdate,closed_date,first_agent_reply_date," +
        "last_reply_date,hs_last_message_received_at,hs_last_message_sent_at," +
        "time_to_close,time_to_first_agent_reply,hs_time_to_first_rep_assignment," +
        "hs_time_to_first_response_sla_status,hs_time_to_close_sla_status," +
        "hs_num_times_contacted,num_notes,hs_form_id," +
        "tiempos,nombredia,solicitud,ine_ticket,content,hs_lastmodifieddate";

    // Rate limit HubSpot: 10 req/s → mínimo 100ms entre llamadas a la API
    private static readonly TimeSpan _rateLimitDelay = TimeSpan.FromMilliseconds(100);

    private readonly HttpClient _http;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<HubSpotSyncService> _logger;
    private readonly TimeSpan _intervalo;

    public HubSpotSyncService(
        HttpClient http,
        IServiceScopeFactory scopeFactory,
        ILogger<HubSpotSyncService> logger)
    {
        _http = http;
        _scopeFactory = scopeFactory;
        _logger = logger;

        var horas = int.TryParse(
            Environment.GetEnvironmentVariable("HUBSPOT_SYNC_INTERVAL_HOURS"), out var h) ? h : 1;
        _intervalo = TimeSpan.FromHours(horas);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("HubSpotSyncService iniciado. Intervalo: {Intervalo}", _intervalo);

        // PeriodicTimer: no acumula deriva, espera exacta entre ticks
        using var timer = new PeriodicTimer(_intervalo);

        // Ejecutar inmediatamente al arrancar, luego cada _intervalo
        await SincronizarAsync(stoppingToken);

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            await SincronizarAsync(stoppingToken);
        }
    }

    private async Task SincronizarAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var ticketRepo = scope.ServiceProvider.GetRequiredService<ITicketRepository>();
        var syncLogRepo = scope.ServiceProvider.GetRequiredService<ISyncLogRepository>();

        var servidor = Environment.MachineName;
        var syncId = await syncLogRepo.IniciarSyncAsync("incremental", servidor);

        int procesados = 0, nuevos = 0, actualizados = 0, errores = 0;
        string? ultimoTicketId = null;
        string? cursor = null;

        try
        {
            _logger.LogInformation("Iniciando sync HubSpot — syncId={SyncId}", syncId);

            do
            {
                var (tickets, nextCursor, error) = await ObtenerPaginaAsync(cursor, ct);

                if (error is not null)
                {
                    _logger.LogError("Error al obtener página HubSpot: {Error}", error);
                    errores++;
                    break;
                }

                if (tickets is null || tickets.Count == 0)
                    break;

                // Upsert con conteo preciso de inserciones vs actualizaciones.
                // Errores por registro NO abortan el ciclo.
                var (pgNuevos, pgActualizados, pgErrores) =
                    await ticketRepo.UpsertLoteConConteoAsync(tickets);

                procesados += tickets.Count;
                nuevos += pgNuevos;
                actualizados += pgActualizados;
                errores += pgErrores;
                ultimoTicketId = tickets[^1].Id;
                cursor = nextCursor;

                _logger.LogDebug(
                    "Página procesada: {Total} tickets (+{N} nuevos, ~{A} actualizados, !{E} errores). Cursor: {Cursor}",
                    tickets.Count, pgNuevos, pgActualizados, pgErrores, cursor);

                // Respetar rate limit 10 req/s entre páginas
                if (cursor is not null)
                    await Task.Delay(_rateLimitDelay, ct);

            } while (cursor is not null && !ct.IsCancellationRequested);

            _logger.LogInformation(
                "Sync completado — procesados={P} nuevos={N} actualizados={A} errores={E}",
                procesados, nuevos, actualizados, errores);
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("Sync cancelado — syncId={SyncId}", syncId);
            await syncLogRepo.FinalizarSyncAsync(syncId, procesados, nuevos, actualizados, errores,
                ultimoTicketId, "Cancelado por señal de parada");
            return;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error inesperado en sync HubSpot — syncId={SyncId}", syncId);
            errores++;
            await syncLogRepo.FinalizarSyncAsync(syncId, procesados, nuevos, actualizados, errores,
                ultimoTicketId, ex.Message);
            return;
        }

        await syncLogRepo.FinalizarSyncAsync(syncId, procesados, nuevos, actualizados, errores, ultimoTicketId);
    }

    /// <summary>
    /// POST /crm/v3/objects/tickets/search con paginación por cursor.
    /// Ordenamiento hs_lastmodifieddate DESC.
    /// Retry para 429 y 5xx manejado por Polly en Program.cs.
    /// Retorna (tickets, nextCursor, errorMessage).
    /// </summary>
    private async Task<(List<HubspotTicket>? tickets, string? nextCursor, string? error)> ObtenerPaginaAsync(
        string? cursor, CancellationToken ct)
    {
        var body = new
        {
            properties = TICKET_PROPS.Split(','),
            sorts = new[] { new { propertyName = "hs_lastmodifieddate", direction = "DESCENDING" } },
            limit = 100,
            after = cursor
        };

        HttpResponseMessage response;
        try
        {
            response = await _http.PostAsJsonAsync("/crm/v3/objects/tickets/search", body, ct);
        }
        catch (HttpRequestException ex)
        {
            return (null, null, $"Error de red: {ex.Message}");
        }

        if (!response.IsSuccessStatusCode)
        {
            var contenido = await response.Content.ReadAsStringAsync(ct);
            return (null, null, $"HTTP {(int)response.StatusCode}: {contenido}");
        }

        HubSpotSearchResponse? json;
        try
        {
            json = await response.Content.ReadFromJsonAsync<HubSpotSearchResponse>(
                cancellationToken: ct);
        }
        catch (JsonException ex)
        {
            return (null, null, $"JSON inválido: {ex.Message}");
        }

        if (json is null) return (null, null, "Respuesta vacía de HubSpot");

        var tickets = json.Results?.Select(MapearTicket).ToList() ?? [];
        return (tickets, json.Paging?.Next?.After, null);
    }

    private static HubspotTicket MapearTicket(HubSpotTicketResult result)
    {
        var p = result.Properties ?? new Dictionary<string, string?>();

        static DateTimeOffset? ParseFecha(string? v) =>
            DateTimeOffset.TryParse(v, out var d) ? d : null;

        static long? ParseLong(string? v) =>
            long.TryParse(v, out var n) ? n : null;

        static int? ParseInt(string? v) =>
            int.TryParse(v, out var n) ? n : null;

        static bool? ParseBool(string? v) =>
            bool.TryParse(v, out var b) ? b : null;

        return new HubspotTicket
        {
            Id = result.Id ?? throw new InvalidOperationException("Ticket sin ID"),
            Subject = p.GetValueOrDefault("subject"),
            ExpedienteCatastral = p.GetValueOrDefault("expediente_catastral"),
            ExpedienteMunicipio = p.GetValueOrDefault("expediente_municipio"),
            Folio = p.GetValueOrDefault("folio"),
            NombrePersonaTramite = p.GetValueOrDefault("nombre_persona_tramite"),
            CorreoSolicitante = p.GetValueOrDefault("correo_solicitante"),
            Curp = p.GetValueOrDefault("curp"),
            TramiteSolicitado1 = p.GetValueOrDefault("tramite_solicitado1"),
            TipoTramite = p.GetValueOrDefault("tipo_tramite"),
            EsMasiva = ParseBool(p.GetValueOrDefault("es_masiva")),
            HsPipeline = p.GetValueOrDefault("hs_pipeline"),
            HsPipelineStage = p.GetValueOrDefault("hs_pipeline_stage"),
            HubspotOwnerId = p.GetValueOrDefault("hubspot_owner_id"),
            HubspotOwnerAssigneddate = ParseFecha(p.GetValueOrDefault("hubspot_owner_assigneddate")),
            HubspotTeamId = p.GetValueOrDefault("hubspot_team_id"),
            Createdate = ParseFecha(p.GetValueOrDefault("createdate")),
            ClosedDate = ParseFecha(p.GetValueOrDefault("closed_date")),
            FirstAgentReplyDate = ParseFecha(p.GetValueOrDefault("first_agent_reply_date")),
            LastReplyDate = ParseFecha(p.GetValueOrDefault("last_reply_date")),
            HsLastMessageReceivedAt = ParseFecha(p.GetValueOrDefault("hs_last_message_received_at")),
            HsLastMessageSentAt = ParseFecha(p.GetValueOrDefault("hs_last_message_sent_at")),
            TimeToClose = ParseLong(p.GetValueOrDefault("time_to_close")),
            TimeToFirstAgentReply = ParseLong(p.GetValueOrDefault("time_to_first_agent_reply")),
            HsTimeToFirstRepAssignment = ParseLong(p.GetValueOrDefault("hs_time_to_first_rep_assignment")),
            HsTimeToFirstResponseSlaStatus = p.GetValueOrDefault("hs_time_to_first_response_sla_status"),
            HsTimeToCloseSlaStatus = p.GetValueOrDefault("hs_time_to_close_sla_status"),
            HsNumTimesContacted = ParseInt(p.GetValueOrDefault("hs_num_times_contacted")),
            NumNotes = ParseInt(p.GetValueOrDefault("num_notes")),
            HsFormId = p.GetValueOrDefault("hs_form_id"),
            Tiempos = p.GetValueOrDefault("tiempos"),
            Nombredia = p.GetValueOrDefault("nombredia"),
            Solicitud = p.GetValueOrDefault("solicitud"),
            IneTicket = p.GetValueOrDefault("ine_ticket"),
            Content = p.GetValueOrDefault("content"),
            HsLastmodifieddate = ParseFecha(p.GetValueOrDefault("hs_lastmodifieddate"))
        };
    }

    // DTOs internos para deserializar respuesta HubSpot
    private record HubSpotSearchResponse(
        [property: JsonPropertyName("results")] List<HubSpotTicketResult>? Results,
        [property: JsonPropertyName("paging")] HubSpotPaging? Paging);

    private record HubSpotTicketResult(
        [property: JsonPropertyName("id")] string? Id,
        [property: JsonPropertyName("properties")] Dictionary<string, string?>? Properties);

    private record HubSpotPaging(
        [property: JsonPropertyName("next")] HubSpotPagingNext? Next);

    private record HubSpotPagingNext(
        [property: JsonPropertyName("after")] string? After);
}
