using System.Text;
using FluentValidation;
using IRCNL.Shared.Repositories;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Configuración desde variables de entorno (nunca hardcodear credenciales)
var connectionString = Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? throw new InvalidOperationException("Variable DATABASE_URL no configurada.");

var jwtPrivateKey = Environment.GetEnvironmentVariable("JWT_PRIVATE_KEY")
    ?? throw new InvalidOperationException("Variable JWT_PRIVATE_KEY no configurada.");

var jwtIssuer = Environment.GetEnvironmentVariable("JWT_ISSUER") ?? "tablero.ircnl.gob.mx";
var jwtAudience = Environment.GetEnvironmentVariable("JWT_AUDIENCE") ?? "tablero-api";

// Repositorios (Dapper)
builder.Services.AddScoped<ITicketRepository>(_ => new TicketRepository(connectionString));
builder.Services.AddScoped<ISyncLogRepository>(_ => new SyncLogRepository(connectionString));

// Validadores FluentValidation
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

// Auth JWT RS256 — DT-01: migrar de HS256 a RS256 (decisión cerrada)
// TODO S1: cargar RSA key pair desde JWT_PRIVATE_KEY / JWT_PUBLIC_KEY
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            // RS256: reemplazar con RsaSecurityKey en S1
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtPrivateKey))
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "IRCNL Tablero API", Version = "v2" });
});

// Redis (instalar S2-4)
var redisConnection = Environment.GetEnvironmentVariable("REDIS_CONNECTION");
if (!string.IsNullOrEmpty(redisConnection))
{
    var redisPassword = Environment.GetEnvironmentVariable("REDIS_PASSWORD") ?? string.Empty;
    builder.Services.AddStackExchangeRedisCache(options =>
    {
        options.Configuration = redisConnection;
        options.ConfigurationOptions = new StackExchange.Redis.ConfigurationOptions
        {
            EndPoints = { redisConnection },
            Password = redisPassword
        };
    });
}

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// Health check básico
app.MapGet("/api/health", () => Results.Ok(new
{
    status = "ok",
    timestamp = DateTimeOffset.UtcNow,
    version = "fase2-s1"
}));

app.Run();
