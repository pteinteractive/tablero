using System.Text.Json;

namespace IRCNL.Api.Middleware;

/// <summary>
/// Captura excepciones no controladas y retorna respuesta JSON estructurada.
/// Nunca expone stack traces en producción.
/// </summary>
public class ExcepcionGlobalMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExcepcionGlobalMiddleware> _logger;
    private readonly IHostEnvironment _env;

    public ExcepcionGlobalMiddleware(RequestDelegate next, ILogger<ExcepcionGlobalMiddleware> logger, IHostEnvironment env)
    {
        _next = next;
        _logger = logger;
        _env = env;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Excepción no controlada en {Path}", context.Request.Path);
            context.Response.StatusCode = 500;
            context.Response.ContentType = "application/json";

            var respuesta = new
            {
                error = "Error interno del servidor.",
                detalle = _env.IsDevelopment() ? ex.Message : null
            };

            await context.Response.WriteAsync(JsonSerializer.Serialize(respuesta));
        }
    }
}
