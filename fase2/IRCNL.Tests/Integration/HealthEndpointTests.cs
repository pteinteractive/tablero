using System.Net;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace IRCNL.Tests.Integration;

/// <summary>
/// Pruebas de integración usando WebApplicationFactory.
/// Convención: Arrange-Act-Assert. Nombres en español.
/// </summary>
public class HealthEndpointTests : IClassFixture<WebApplicationFactory<IRCNL.Api.Program>>
{
    private readonly HttpClient _cliente;

    public HealthEndpointTests(WebApplicationFactory<IRCNL.Api.Program> factory)
    {
        _cliente = factory.CreateClient();
    }

    [Fact]
    public async Task Health_endpoint_debe_retornar_200_ok()
    {
        // Act
        var respuesta = await _cliente.GetAsync("/api/health");

        // Assert
        respuesta.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Health_endpoint_debe_retornar_json_con_status_ok()
    {
        // Act
        var respuesta = await _cliente.GetAsync("/api/health");
        var contenido = await respuesta.Content.ReadAsStringAsync();

        // Assert
        contenido.Should().Contain("\"status\"");
        contenido.Should().Contain("ok");
    }
}
