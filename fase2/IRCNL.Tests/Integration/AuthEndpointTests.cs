using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using FluentAssertions;
using IRCNL.Api.Services;
using IRCNL.Shared.DTOs;
using IRCNL.Shared.Models;
using IRCNL.Shared.Repositories;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IRCNL.Tests.Integration;

/// <summary>
/// Pruebas de integración para AuthController.
/// Convención: Arrange-Act-Assert. Nombres en español.
/// Usa WebApplicationFactory con fakes en memoria (sin DB real).
/// </summary>
public class AuthEndpointTests : IClassFixture<AuthTestFactory>
{
    private readonly HttpClient _cliente;
    private readonly AuthTestFactory _factory;

    public AuthEndpointTests(AuthTestFactory factory)
    {
        _factory = factory;
        _cliente = factory.CreateClient();
    }

    [Fact]
    public async Task Login_correcto_debe_retornar_200_con_jwt()
    {
        // Arrange
        var request = new LoginRequest
        {
            Username = FakeUsuarioRepository.TestUsername,
            Password = FakeUsuarioRepository.TestPassword
        };

        // Act
        var respuesta = await _cliente.PostAsJsonAsync("/api/auth/login", request);
        var body = await respuesta.Content.ReadFromJsonAsync<LoginResponse>();

        // Assert
        respuesta.StatusCode.Should().Be(HttpStatusCode.OK);
        body.Should().NotBeNull();
        body!.Token.Should().NotBeNullOrEmpty();
        body.Rol.Should().Be("ADMIN");
        body.Expiracion.Should().BeAfter(DateTimeOffset.UtcNow);
    }

    [Fact]
    public async Task Login_contrasena_incorrecta_debe_retornar_401()
    {
        // Arrange
        var request = new LoginRequest
        {
            Username = FakeUsuarioRepository.TestUsername,
            Password = "ContraseñaIncorrecta99!"
        };

        // Act
        var respuesta = await _cliente.PostAsJsonAsync("/api/auth/login", request);

        // Assert
        respuesta.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Login_usuario_inexistente_debe_retornar_401()
    {
        // Arrange
        var request = new LoginRequest
        {
            Username = "noexiste@ircnl.gob.mx",
            Password = "ContrasenaValida123!"
        };

        // Act
        var respuesta = await _cliente.PostAsJsonAsync("/api/auth/login", request);

        // Assert
        respuesta.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Sin_token_endpoint_protegido_debe_retornar_401()
    {
        // Act — sin Authorization header
        var respuesta = await _cliente.GetAsync("/api/tickets/count");

        // Assert
        respuesta.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Con_token_valido_endpoint_protegido_debe_retornar_200()
    {
        // Arrange — obtener token via login
        var loginRequest = new LoginRequest
        {
            Username = FakeUsuarioRepository.TestUsername,
            Password = FakeUsuarioRepository.TestPassword
        };
        var loginResp = await _cliente.PostAsJsonAsync("/api/auth/login", loginRequest);
        var loginBody = await loginResp.Content.ReadFromJsonAsync<LoginResponse>();
        loginBody.Should().NotBeNull();

        // Act — usar token en endpoint protegido
        var clienteAutenticado = _factory.CreateClient();
        clienteAutenticado.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", loginBody!.Token);

        var respuesta = await clienteAutenticado.GetAsync("/api/tickets/count");

        // Assert
        respuesta.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}

// ─── Test Factory ─────────────────────────────────────────────────────────────

public class AuthTestFactory : WebApplicationFactory<Program>
{
    private readonly string _privateKeyPem;
    private readonly string _publicKeyPem;

    public AuthTestFactory()
    {
        // Generar par RSA 2048 solo para tests (nunca usar en producción)
        using var rsa = RSA.Create(2048);
        _privateKeyPem = rsa.ExportPkcs8PrivateKeyPem();
        _publicKeyPem = rsa.ExportSubjectPublicKeyInfoPem();

        // Configurar variables de entorno antes de que el host se construya
        Environment.SetEnvironmentVariable("DATABASE_URL", "Host=127.0.0.1;Database=test_main;Username=test;Password=test");
        Environment.SetEnvironmentVariable("DATABASE_URL_SEGURIDAD", "Host=127.0.0.1;Database=test_seg;Username=test;Password=test");
        Environment.SetEnvironmentVariable("JWT_PRIVATE_KEY", _privateKeyPem);
        Environment.SetEnvironmentVariable("JWT_PUBLIC_KEY", _publicKeyPem);
        Environment.SetEnvironmentVariable("JWT_ISSUER", "test.ircnl");
        Environment.SetEnvironmentVariable("JWT_AUDIENCE", "test-api");
        Environment.SetEnvironmentVariable("JWT_EXPIRY_MINUTES", "60");
        Environment.SetEnvironmentVariable("REDIS_CONNECTION", "");
    }

    protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureServices(services =>
        {
            // Reemplazar repositorios con fakes en memoria (sin DB real)
            ReemplazarServicio<IUsuarioRepository>(services,
                _ => new FakeUsuarioRepository());

            ReemplazarServicio<ITicketRepository>(services,
                _ => new FakeTicketRepository());

            ReemplazarServicio<ISyncLogRepository>(services,
                _ => new FakeSyncLogRepository());
        });
    }

    private static void ReemplazarServicio<T>(IServiceCollection services,
        Func<IServiceProvider, T> factory) where T : class
    {
        var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(T));
        if (descriptor != null) services.Remove(descriptor);
        services.AddScoped(factory);
    }
}

// ─── Fakes en memoria ─────────────────────────────────────────────────────────

public class FakeUsuarioRepository : IUsuarioRepository
{
    public static readonly string TestUsername = "test@ircnl.gob.mx";
    public static readonly string TestPassword = "TestPassword1!";

    // Factor 4 (mínimo) para tests rápidos — producción usa factor 12+
    private static readonly string _hash = BCrypt.Net.BCrypt.HashPassword(TestPassword, 4);

    public Task<Usuario?> ObtenerPorUsernameAsync(string username)
    {
        if (username != TestUsername) return Task.FromResult<Usuario?>(null);

        return Task.FromResult<Usuario?>(new Usuario
        {
            Id = 1,
            Username = TestUsername,
            NombreCompleto = "Usuario Test IRCNL",
            PasswordHash = _hash,
            RolId = 1,
            Activo = true,
            DebeCambiarPass = false,
            IntentosFallidos = 0,
            Rol = new Rol { Id = 1, Nombre = "ADMIN" }
        });
    }

    public Task ActualizarIntentosFallidosAsync(int id, int intentos, DateTimeOffset? bloqueadoHasta)
        => Task.CompletedTask;

    public Task ActualizarUltimoLoginAsync(int id)
        => Task.CompletedTask;

    public Task RegistrarSesionAsync(int usuarioId, string tokenHash, string? ip, string? userAgent, DateTimeOffset expiracion)
        => Task.CompletedTask;

    public Task InvalidarSesionAsync(string tokenHash)
        => Task.CompletedTask;

    public Task RegistrarAuditoriaAsync(int? usuarioId, string username, string evento, string? ip, string? userAgent, string? detalle)
        => Task.CompletedTask;
}

public class FakeTicketRepository : ITicketRepository
{
    public Task<HubspotTicket?> ObtenerPorIdAsync(string id) =>
        Task.FromResult<HubspotTicket?>(null);

    public Task<int> ContarTotalAsync() =>
        Task.FromResult(131285);

    public Task UpsertAsync(HubspotTicket ticket) => Task.CompletedTask;

    public Task UpsertLoteAsync(IEnumerable<HubspotTicket> tickets) => Task.CompletedTask;
}

public class FakeSyncLogRepository : ISyncLogRepository
{
    public Task<long> IniciarSyncAsync(string tipo, string servidor) =>
        Task.FromResult(1L);

    public Task FinalizarSyncAsync(long id, int procesados, int nuevos, int actualizados, int errores, string? ultimoTicketId, string? errorDetalle = null) =>
        Task.CompletedTask;
}
