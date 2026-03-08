using IRCNL.Shared.Repositories;
using IRCNL.Worker.Services;
using Polly;
using Polly.Extensions.Http;

var host = Host.CreateDefaultBuilder(args)
    .ConfigureServices((context, services) =>
    {
        var connectionString = Environment.GetEnvironmentVariable("DATABASE_URL")
            ?? throw new InvalidOperationException("Variable DATABASE_URL no configurada.");

        services.AddScoped<ITicketRepository>(_ => new TicketRepository(connectionString));
        services.AddScoped<ISyncLogRepository>(_ => new SyncLogRepository(connectionString));

        // Política Polly: retry exponencial para 429 (rate limit) y errores transitorios (5xx, red).
        // Intentos: 1, 2, 4, 8 segundos (4 reintentos). El servicio NO reintenta manualmente.
        var retryPolicy = HttpPolicyExtensions
            .HandleTransientHttpError()
            .OrResult(r => r.StatusCode == System.Net.HttpStatusCode.TooManyRequests)
            .WaitAndRetryAsync(
                retryCount: 4,
                sleepDurationProvider: intento => TimeSpan.FromSeconds(Math.Pow(2, intento)),
                onRetry: (resultado, espera, intento, _) =>
                {
                    var status = resultado.Result?.StatusCode.ToString() ?? resultado.Exception?.GetType().Name;
                    Console.WriteLine(
                        $"[HubSpot] Reintento {intento}/4 — {status} — esperando {espera.TotalSeconds}s");
                });

        services.AddHttpClient<HubSpotSyncService>(client =>
        {
            client.BaseAddress = new Uri("https://api.hubapi.com");
            var apiKey = Environment.GetEnvironmentVariable("HUBSPOT_API_KEY")
                ?? throw new InvalidOperationException("Variable HUBSPOT_API_KEY no configurada.");
            client.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
            client.Timeout = TimeSpan.FromSeconds(30);
        })
        .AddPolicyHandler(retryPolicy);

        services.AddHostedService<HubSpotSyncService>();
    })
    .Build();

await host.RunAsync();
