using IRCNL.Shared.Repositories;
using IRCNL.Worker.Services;

var host = Host.CreateDefaultBuilder(args)
    .ConfigureServices((context, services) =>
    {
        var connectionString = Environment.GetEnvironmentVariable("DATABASE_URL")
            ?? throw new InvalidOperationException("Variable DATABASE_URL no configurada.");

        services.AddScoped<ITicketRepository>(_ => new TicketRepository(connectionString));
        services.AddScoped<ISyncLogRepository>(_ => new SyncLogRepository(connectionString));

        // HttpClient para HubSpot con retry (Polly)
        services.AddHttpClient<HubSpotSyncService>(client =>
        {
            client.BaseAddress = new Uri("https://api.hubapi.com");
            var apiKey = Environment.GetEnvironmentVariable("HUBSPOT_API_KEY")
                ?? throw new InvalidOperationException("Variable HUBSPOT_API_KEY no configurada.");
            client.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
            client.Timeout = TimeSpan.FromSeconds(30);
        });

        services.AddHostedService<HubSpotSyncService>();
    })
    .Build();

await host.RunAsync();
