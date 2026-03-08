using FluentAssertions;
using IRCNL.Shared.Models;
using Xunit;

namespace IRCNL.Tests.Unit;

public class HubspotTicketTests
{
    [Fact]
    public void Ticket_debe_tener_37_propiedades_segun_esquema_real()
    {
        // Arrange & Act
        var propiedades = typeof(HubspotTicket).GetProperties();

        // Assert — 37 columnas definidas en CLAUDE.md sección 5.1
        propiedades.Length.Should().Be(37);
    }

    [Fact]
    public void Ticket_con_id_valido_debe_construirse_correctamente()
    {
        // Arrange & Act
        var ticket = new HubspotTicket
        {
            Id = "12345",
            Subject = "Trámite de prueba",
            HsPipeline = "default",
            HsPipelineStage = "1"
        };

        // Assert
        ticket.Id.Should().Be("12345");
        ticket.SyncedAt.Should().BeNull(); // se asigna en upsert
    }

    [Fact]
    public void TimeToClose_debe_ser_bigint_en_milisegundos()
    {
        // Arrange
        var ticket = new HubspotTicket { Id = "1", TimeToClose = 86400000L }; // 1 día en ms

        // Act & Assert
        ticket.TimeToClose.Should().Be(86400000L);
        ticket.TimeToClose.Should().BeOfType<long?>();
    }
}
