using System.Security.Cryptography;
using System.Threading.RateLimiting;
using Dapper;
using FluentValidation;
using IRCNL.Api.Services;
using IRCNL.Shared.Repositories;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;

// Dapper: mapeo automático snake_case (PostgreSQL) → PascalCase (C#)
DefaultTypeMap.MatchNamesWithUnderscores = true;

var builder = WebApplication.CreateBuilder(args);

// Configuración desde variables de entorno (nunca hardcodear credenciales)
var connectionString = Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? throw new InvalidOperationException("Variable DATABASE_URL no configurada.");

var connectionStringSeg = Environment.GetEnvironmentVariable("DATABASE_URL_SEGURIDAD")
    ?? throw new InvalidOperationException("Variable DATABASE_URL_SEGURIDAD no configurada.");

var jwtPrivateKey = Environment.GetEnvironmentVariable("JWT_PRIVATE_KEY")
    ?? throw new InvalidOperationException("Variable JWT_PRIVATE_KEY no configurada.");

var jwtPublicKey = Environment.GetEnvironmentVariable("JWT_PUBLIC_KEY")
    ?? throw new InvalidOperationException("Variable JWT_PUBLIC_KEY no configurada.");

var jwtIssuer = Environment.GetEnvironmentVariable("JWT_ISSUER") ?? "tablero.ircnl.gob.mx";
var jwtAudience = Environment.GetEnvironmentVariable("JWT_AUDIENCE") ?? "tablero-api";
var jwtExpiryMinutes = int.Parse(Environment.GetEnvironmentVariable("JWT_EXPIRY_MINUTES") ?? "480");

// Repositorios Dapper
builder.Services.AddScoped<ITicketRepository>(_ => new TicketRepository(connectionString));
builder.Services.AddScoped<ISyncLogRepository>(_ => new SyncLogRepository(connectionString));
builder.Services.AddScoped<IUsuarioRepository>(_ => new UsuarioRepository(connectionStringSeg));

// Validadores FluentValidation (escanea IRCNL.Shared donde vive LoginRequestValidator)
builder.Services.AddValidatorsFromAssemblyContaining<IRCNL.Shared.DTOs.LoginRequestValidator>();

// JWT RS256 — DT-01 resuelto: clave pública RSA para validación de tokens entrantes
var rsaPublico = RSA.Create();
rsaPublico.ImportFromPem(jwtPublicKey);

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
            IssuerSigningKey = new RsaSecurityKey(rsaPublico),
            ClockSkew = TimeSpan.Zero
        };
    });

// JwtService singleton: firma con clave privada RSA (DT-01 resuelto)
builder.Services.AddSingleton<IJwtService>(
    new JwtService(jwtPrivateKey, jwtIssuer, jwtAudience, jwtExpiryMinutes));

// Política global [Authorize] — DT-02 resuelto: todos los controllers requieren JWT
// Excepciones via [AllowAnonymous]: AuthController.Login, HealthController.Get
builder.Services.AddAuthorization();
builder.Services.AddControllers(options =>
{
    var politica = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
    options.Filters.Add(new AuthorizeFilter(politica));
});

// Rate limiting — login: 5 peticiones/minuto por IP (OWASP A07: Identification and Authentication Failures)
builder.Services.AddRateLimiter(options =>
{
    options.AddPolicy("login", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(1),
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = 0
            }));
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "IRCNL Tablero API", Version = "v2" });
    c.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
    {
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        Description = "JWT RS256 — ingresar token sin prefijo 'Bearer'"
    });
    c.AddSecurityRequirement(new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
    {
        {
            new Microsoft.OpenApi.Models.OpenApiSecurityScheme
            {
                Reference = new Microsoft.OpenApi.Models.OpenApiReference
                {
                    Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            []
        }
    });
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

app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// Health probe para nginx (sin autenticación)
app.MapGet("/api/health", () => Results.Ok(new
{
    status = "ok",
    timestamp = DateTimeOffset.UtcNow,
    version = "fase2-s1"
})).AllowAnonymous();

app.Run();

// Exponer clase Program para WebApplicationFactory en pruebas de integración
public partial class Program { }
