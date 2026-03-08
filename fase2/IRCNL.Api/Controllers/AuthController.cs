using System.IdentityModel.Tokens.Jwt;
using System.Security.Cryptography;
using System.Text;
using FluentValidation;
using IRCNL.Api.Services;
using IRCNL.Shared.DTOs;
using IRCNL.Shared.Repositories;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace IRCNL.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IValidator<LoginRequest> _validator;
    private readonly IUsuarioRepository _usuarios;
    private readonly IJwtService _jwtService;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        IValidator<LoginRequest> validator,
        IUsuarioRepository usuarios,
        IJwtService jwtService,
        ILogger<AuthController> logger)
    {
        _validator = validator;
        _usuarios = usuarios;
        _jwtService = jwtService;
        _logger = logger;
    }

    /// <summary>
    /// Login con usuario (email) y contraseña. Retorna JWT RS256.
    /// DT-01 resuelto: JWT RS256 activo.
    /// DT-03 resuelto: BCrypt.Net-Next (hashes existentes compatibles).
    /// </summary>
    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var validacion = await _validator.ValidateAsync(request);
        if (!validacion.IsValid)
            return BadRequest(validacion.Errors.Select(e => e.ErrorMessage));

        var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
        var userAgent = HttpContext.Request.Headers["User-Agent"].ToString();

        var usuario = await _usuarios.ObtenerPorUsernameAsync(request.Username);

        // No revelar si el usuario existe (OWASP A07)
        if (usuario is null)
        {
            await _usuarios.RegistrarAuditoriaAsync(null, request.Username,
                "LOGIN_FALLIDO_USUARIO", ip, userAgent, "Usuario no encontrado");
            return Unauthorized(new { mensaje = "Credenciales incorrectas." });
        }

        if (!usuario.Activo)
        {
            await _usuarios.RegistrarAuditoriaAsync(usuario.Id, usuario.Username,
                "LOGIN_FALLIDO_INACTIVO", ip, userAgent, "Usuario inactivo");
            return Unauthorized(new { mensaje = "Credenciales incorrectas." });
        }

        if (usuario.BloqueadoHasta.HasValue && usuario.BloqueadoHasta > DateTimeOffset.UtcNow)
        {
            await _usuarios.RegistrarAuditoriaAsync(usuario.Id, usuario.Username,
                "LOGIN_BLOQUEADO", ip, userAgent,
                $"Bloqueado hasta {usuario.BloqueadoHasta:O}");
            return Unauthorized(new { mensaje = "Cuenta bloqueada temporalmente. Intente más tarde." });
        }

        // DT-03: verificar hash bcrypt (BCrypt.Net-Next, compatible con hashes de Fase 1)
        if (!BCrypt.Net.BCrypt.Verify(request.Password, usuario.PasswordHash))
        {
            var nuevosIntentos = usuario.IntentosFallidos + 1;
            DateTimeOffset? bloqueoHasta = nuevosIntentos >= 5
                ? DateTimeOffset.UtcNow.AddMinutes(15) : null;

            await _usuarios.ActualizarIntentosFallidosAsync(usuario.Id, nuevosIntentos, bloqueoHasta);
            await _usuarios.RegistrarAuditoriaAsync(usuario.Id, usuario.Username,
                "LOGIN_FALLIDO_PASS", ip, userAgent, $"Intento {nuevosIntentos}/5");

            return Unauthorized(new { mensaje = "Credenciales incorrectas." });
        }

        // Login correcto
        await _usuarios.ActualizarUltimoLoginAsync(usuario.Id);

        var tokenString = _jwtService.GenerarToken(usuario);
        var expiracion = _jwtService.ObtenerExpiracion();

        // Almacenar hash del token (no el token completo) — principio mínimo privilegio
        var tokenHash = Convert.ToHexString(
            SHA256.HashData(Encoding.UTF8.GetBytes(tokenString)));

        await _usuarios.RegistrarSesionAsync(usuario.Id, tokenHash, ip, userAgent, expiracion);
        await _usuarios.RegistrarAuditoriaAsync(usuario.Id, usuario.Username,
            "LOGIN_EXITOSO", ip, userAgent, null);

        _logger.LogInformation("Login exitoso: {Username} desde {Ip}", usuario.Username, ip);

        return Ok(new LoginResponse
        {
            Token = tokenString,
            Expiracion = expiracion,
            NombreCompleto = usuario.NombreCompleto,
            Rol = usuario.Rol?.Nombre ?? "CONSULTA"
        });
    }

    /// <summary>
    /// Invalida la sesión activa del usuario autenticado.
    /// </summary>
    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout()
    {
        var authHeader = HttpContext.Request.Headers["Authorization"].ToString();
        var token = authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
            ? authHeader["Bearer ".Length..].Trim()
            : string.Empty;

        if (!string.IsNullOrEmpty(token))
        {
            var tokenHash = Convert.ToHexString(
                SHA256.HashData(Encoding.UTF8.GetBytes(token)));
            await _usuarios.InvalidarSesionAsync(tokenHash);
        }

        var username = User.FindFirst(JwtRegisteredClaimNames.Email)?.Value ?? "unknown";
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
        await _usuarios.RegistrarAuditoriaAsync(null, username, "LOGOUT", ip, null, null);

        return Ok();
    }
}
