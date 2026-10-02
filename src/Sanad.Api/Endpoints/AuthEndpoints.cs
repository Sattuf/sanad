using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json;
using MediatR;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Caching.Distributed;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Modules.Accounts;
using Sanad.Infrastructure.Identity;

namespace Sanad.Api.Endpoints;

public static class AuthEndpoints
{
    public const string ExternalScheme = "External";

    public sealed record LoginRequest(string Email, string Password);
    public sealed record TicketRequest(string Ticket);
    public sealed record TicketCodeRequest(string Ticket, string Code);
    public sealed record TicketPasswordRequest(string Ticket, string NewPassword);
    public sealed record PhoneRequest(string PhoneNumber);
    public sealed record PhoneVerifyRequest(string PhoneNumber, string Code, string? Email = null);
    public sealed record RefreshRequest(string RefreshToken);
    public sealed record RevokeRequest(string? RefreshToken);
    public sealed record ExchangeRequest(string Code);
    public sealed record GoogleNativeRequest(string IdToken);
    public sealed record AppleRequest(string IdentityToken, string Nonce, string? DisplayName);
    public sealed record AuthProvidersDto(bool Google, bool CaptchaEnabled, string? CaptchaSiteKey, bool GoogleNative, bool Apple);

    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/v1/auth").WithTags("Auth").AllowAnonymous();

        g.MapGet("/providers", (IConfiguration config, IExternalIdTokenValidator external) => Results.Ok(new AuthProvidersDto(
            !string.IsNullOrWhiteSpace(config["Auth:Google:ClientId"]),
            config.GetValue("Captcha:Enabled", true), config["Captcha:SiteKey"],
            external.IsEnabled(ExternalLoginProvider.Google), external.IsEnabled(ExternalLoginProvider.Apple))));

        // ── البريد ──
        g.MapPost("/register/email", async (RegisterWithEmailCommand cmd, ISender sender) => Results.Ok(await sender.Send(cmd)))
            .RequireCaptcha().RequireRateLimiting("auth");
        g.MapPost("/login/email", async (LoginRequest req, ISender sender) =>
            Results.Ok(await sender.Send(new LoginWithEmailCommand(req.Email, req.Password)))).RequireRateLimiting("auth");

        // ── المراحل الوسيطة (تذكرة قصيرة الأجل) ──
        g.MapPost("/login/change-password", async (TicketPasswordRequest req, ISender sender) =>
            Results.Ok(await sender.Send(new ChangeRequiredPasswordCommand(req.Ticket, req.NewPassword)))).RequireRateLimiting("auth");
        g.MapPost("/login/2fa/setup", async (TicketRequest req, ISender sender) =>
            Results.Ok(await sender.Send(new BeginTwoFactorSetupCommand(req.Ticket)))).RequireRateLimiting("auth");
        g.MapPost("/login/2fa/enable", async (TicketCodeRequest req, ISender sender) =>
            Results.Ok(await sender.Send(new CompleteTwoFactorSetupCommand(req.Ticket, req.Code)))).RequireRateLimiting("auth");
        g.MapPost("/login/2fa/verify", async (TicketCodeRequest req, ISender sender) =>
            Results.Ok(await sender.Send(new VerifyTwoFactorCommand(req.Ticket, req.Code)))).RequireRateLimiting("auth");

        // ── الهاتف OTP: CAPTCHA + حد معدل صارم (استنزاف رصيد SMS تهديد تكلفة حقيقي) ──
        g.MapPost("/phone/request-otp", async (PhoneRequest req, ISender sender) =>
        {
            await sender.Send(new RequestPhoneOtpCommand(req.PhoneNumber));
            return Results.Accepted();
        }).RequireCaptcha().RequireRateLimiting("otp");
        g.MapPost("/phone/verify-otp", async (PhoneVerifyRequest req, ISender sender) =>
            Results.Ok(await sender.Send(new VerifyPhoneOtpCommand(req.PhoneNumber, req.Code, req.Email)))).RequireRateLimiting("otp-verify");

        // ── الرموز ──
        g.MapPost("/refresh", async (RefreshRequest req, ISender sender) =>
            Results.Ok(await sender.Send(new RefreshTokenCommand(req.RefreshToken)))).RequireRateLimiting("auth");
        app.MapPost("/api/v1/auth/revoke", async (RevokeRequest req, ClaimsPrincipal user, ISender sender) =>
        {
            var jti = user.FindFirstValue(JwtRegisteredClaimNames.Jti);
            var exp = long.TryParse(user.FindFirstValue(JwtRegisteredClaimNames.Exp), out var e) ? DateTimeOffset.FromUnixTimeSeconds(e) : (DateTimeOffset?)null;
            await sender.Send(new RevokeTokenCommand(req.RefreshToken, jti, exp));
            return Results.NoContent();
        }).WithTags("Auth").RequireAuthorization();

        // ── جوجل: Challenge → Callback → رمز لمرة واحدة يُستبدل من الواجهة (لا رموز في الرابط) ──
        g.MapGet("/google/challenge", (IConfiguration config) =>
        {
            if (string.IsNullOrWhiteSpace(config["Auth:Google:ClientId"])) return Results.NotFound();
            var props = new AuthenticationProperties { RedirectUri = "/api/v1/auth/google/callback" };
            return Results.Challenge(props, ["Google"]);
        });

        g.MapGet("/google/callback", async (HttpContext http, ISender sender, IDistributedCache cache, IConfiguration config) =>
        {
            var frontend = config["Frontend:BaseUrl"] ?? "/";
            var result = await http.AuthenticateAsync(ExternalScheme);
            await http.SignOutAsync(ExternalScheme);
            var principal = result.Principal;
            var key = principal?.FindFirstValue(ClaimTypes.NameIdentifier);
            var email = principal?.FindFirstValue(ClaimTypes.Email);
            var verified = principal?.FindFirstValue("urn:google:email_verified");
            if (!result.Succeeded || key is null || email is null || !string.Equals(verified, "true", StringComparison.OrdinalIgnoreCase))
                return Results.Redirect($"{frontend}/login?error=google");

            var auth = await sender.Send(new CompleteGoogleLoginCommand(key, email, principal!.FindFirstValue(ClaimTypes.Name)));
            var code = JwtTokenService.NewOpaqueToken();
            await cache.SetStringAsync($"sanad:google-exchange:{JwtTokenService.Hash(code)}", JsonSerializer.Serialize(auth),
                new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(60) });
            return Results.Redirect($"{frontend}/auth/callback?code={Uri.EscapeDataString(code)}");
        });

        g.MapPost("/google/exchange", async (ExchangeRequest req, IDistributedCache cache) =>
        {
            var cacheKey = $"sanad:google-exchange:{JwtTokenService.Hash(req.Code ?? string.Empty)}";
            var json = await cache.GetStringAsync(cacheKey);
            if (json is null) return Results.Problem(statusCode: 401, title: "رمز الدخول منتهي أو مستخدم.");
            await cache.RemoveAsync(cacheKey); // لمرة واحدة فقط
            return Results.Ok(JsonSerializer.Deserialize<AuthResponse>(json));
        }).RequireRateLimiting("auth");

        // ── الجوال: رمز هوية من حزمة جوجل/أبل الأصلية يُتحقق منه هنا مباشرة (ADR-0019) ──
        g.MapPost("/google/native", async (GoogleNativeRequest req, IExternalIdTokenValidator external, ISender sender, CancellationToken ct) =>
        {
            if (!external.IsEnabled(ExternalLoginProvider.Google)) return Results.NotFound();
            var identity = await external.ValidateGoogleAsync(req.IdToken ?? string.Empty, ct);
            if (identity?.VerifiedEmail is null) return ExternalLoginFailed("جوجل");
            return Results.Ok(await sender.Send(new CompleteGoogleLoginCommand(identity.Subject, identity.VerifiedEmail, identity.DisplayName), ct));
        }).RequireRateLimiting("auth");

        g.MapPost("/apple", async (AppleRequest req, IExternalIdTokenValidator external, ISender sender, CancellationToken ct) =>
        {
            if (!external.IsEnabled(ExternalLoginProvider.Apple)) return Results.NotFound();
            var identity = await external.ValidateAppleAsync(req.IdentityToken ?? string.Empty, req.Nonce ?? string.Empty, ct);
            if (identity is null) return ExternalLoginFailed("أبل");
            // أبل ترسل الاسم للتطبيق في أول دخول فقط (لا في الرمز) — يُقبل من التطبيق لإنشاء الحساب فقط
            var name = string.IsNullOrWhiteSpace(req.DisplayName) ? null : req.DisplayName.Trim()[..Math.Min(100, req.DisplayName.Trim().Length)];
            return Results.Ok(await sender.Send(new CompleteAppleLoginCommand(identity.Subject, identity.VerifiedEmail, name), ct));
        }).RequireRateLimiting("auth");

        return app;
    }

    private static IResult ExternalLoginFailed(string provider) =>
        Results.Problem(statusCode: 401, title: $"تعذّر التحقق من الدخول عبر {provider}. حاول مجدداً.",
            extensions: new Dictionary<string, object?> { ["code"] = "external_token_invalid" });
}
