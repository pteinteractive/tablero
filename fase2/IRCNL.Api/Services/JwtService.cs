using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using IRCNL.Shared.Models;
using Microsoft.IdentityModel.Tokens;

namespace IRCNL.Api.Services;

/// <summary>
/// Servicio JWT RS256. DT-01 resuelto: firma con clave privada RSA 2048.
/// La clave pública se usa en Program.cs para validación por el middleware.
/// </summary>
public class JwtService : IJwtService
{
    private readonly RsaSecurityKey _clavePrivada;
    private readonly string _issuer;
    private readonly string _audience;
    private readonly int _expiryMinutes;

    public JwtService(string privateKeyPem, string issuer, string audience, int expiryMinutes)
    {
        var rsa = RSA.Create();
        rsa.ImportFromPem(privateKeyPem);
        _clavePrivada = new RsaSecurityKey(rsa);
        _issuer = issuer;
        _audience = audience;
        _expiryMinutes = expiryMinutes;
    }

    public string GenerarToken(Usuario usuario)
    {
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, usuario.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, usuario.Username),
            new Claim("nombre", usuario.NombreCompleto),
            new Claim(ClaimTypes.Role, usuario.Rol?.Nombre ?? "CONSULTA"),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var credenciales = new SigningCredentials(_clavePrivada, SecurityAlgorithms.RsaSha256);
        var token = new JwtSecurityToken(
            issuer: _issuer,
            audience: _audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(_expiryMinutes),
            signingCredentials: credenciales);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public DateTimeOffset ObtenerExpiracion() =>
        DateTimeOffset.UtcNow.AddMinutes(_expiryMinutes);
}
