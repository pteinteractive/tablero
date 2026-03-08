using IRCNL.Blazor;
using IRCNL.Shared.Repositories;
using Microsoft.AspNetCore.Authentication.JwtBearer;

var builder = WebApplication.CreateBuilder(args);

var connectionString = Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? throw new InvalidOperationException("Variable DATABASE_URL no configurada.");

// Servicios Blazor Server
builder.Services.AddRazorPages();
builder.Services.AddServerSideBlazor();

// Repositorios
builder.Services.AddScoped<ITicketRepository>(_ => new TicketRepository(connectionString));

// Auth — DT-02: bypass frontend eliminado por Blazor Server (decisión cerrada)
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(); // TODO S1: configurar RS256 igual que IRCNL.Api

builder.Services.AddAuthorization();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
}

app.UseStaticFiles();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();

app.MapBlazorHub();
app.MapFallbackToPage("/_Host");

app.Run();
