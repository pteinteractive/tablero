using FluentAssertions;
using IRCNL.Shared.DTOs;
using Xunit;

namespace IRCNL.Tests.Unit;

/// <summary>
/// Pruebas unitarias para LoginRequestValidator.
/// Convención: Arrange-Act-Assert. Nombres en español.
/// Cobertura 70% requerida desde S3.
/// </summary>
public class LoginRequestValidatorTests
{
    private readonly LoginRequestValidator _validator = new();

    [Fact]
    public async Task Usuario_vacio_debe_fallar_validacion()
    {
        // Arrange
        var request = new LoginRequest { Username = "", Password = "contraseña123" };

        // Act
        var resultado = await _validator.ValidateAsync(request);

        // Assert
        resultado.IsValid.Should().BeFalse();
        resultado.Errors.Should().Contain(e => e.PropertyName == "Username");
    }

    [Fact]
    public async Task Usuario_sin_formato_email_debe_fallar_validacion()
    {
        // Arrange
        var request = new LoginRequest { Username = "no-es-email", Password = "contraseña123" };

        // Act
        var resultado = await _validator.ValidateAsync(request);

        // Assert
        resultado.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Contrasena_menor_8_caracteres_debe_fallar_validacion()
    {
        // Arrange
        var request = new LoginRequest { Username = "usuario@ircnl.gob.mx", Password = "corta" };

        // Act
        var resultado = await _validator.ValidateAsync(request);

        // Assert
        resultado.IsValid.Should().BeFalse();
        resultado.Errors.Should().Contain(e => e.PropertyName == "Password");
    }

    [Fact]
    public async Task Credenciales_validas_deben_pasar_validacion()
    {
        // Arrange
        var request = new LoginRequest { Username = "javier.hernandez@ircnl.gob.mx", Password = "contraseña123" };

        // Act
        var resultado = await _validator.ValidateAsync(request);

        // Assert
        resultado.IsValid.Should().BeTrue();
    }
}
