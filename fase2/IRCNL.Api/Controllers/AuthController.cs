using FluentValidation;
using IRCNL.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IRCNL.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IValidator<LoginRequest> _validator;
    private readonly ILogger<AuthController> _logger;

    public AuthController(IValidator<LoginRequest> validator, ILogger<AuthController> logger)
    {
        _validator = validator;
        _logger = logger;
    }

    /// <summary>
    /// Login con usuario y contraseña. Retorna JWT RS256.
    /// DT-01: JWT desactivado en Fase 1 — implementar completo en S1.
    /// DT-03: Reimplementar bcrypt con BCrypt.Net-Next (hashes existentes compatibles).
    /// </summary>
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var validacion = await _validator.ValidateAsync(request);
        if (!validacion.IsValid)
            return BadRequest(validacion.Errors.Select(e => e.ErrorMessage));

        // TODO S1: consultar db_seguridad_acceso.usuarios, verificar bcrypt, generar JWT RS256
        _logger.LogWarning("Login endpoint invocado — implementación completa pendiente S1 (DT-01/DT-03)");
        return StatusCode(501, "Autenticación JWT en implementación — Sprint 1");
    }

    [HttpPost("logout")]
    [Authorize]
    public IActionResult Logout()
    {
        // TODO S1: invalidar sesión en db_seguridad_acceso.sesiones
        return Ok();
    }
}
