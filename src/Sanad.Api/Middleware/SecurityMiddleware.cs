using Sanad.Application.Common.Interfaces;
using Serilog.Context;

namespace Sanad.Api.Middleware;

/// <summary>رؤوس أمان HTTP — references/11-security-hardening-and-scalability.md §11.7.</summary>
public sealed class SecurityHeadersMiddleware(RequestDelegate next)
{
    private const string DefaultCsp = "default-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'";

    public Task InvokeAsync(HttpContext ctx)
    {
        var headers = ctx.Response.Headers;
        headers.XContentTypeOptions = "nosniff";
        headers.XFrameOptions = "DENY";
        headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
        headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
        headers["Cross-Origin-Opener-Policy"] = "same-origin";

        var path = ctx.Request.Path;
        if (path.StartsWithSegments("/swagger"))
            headers.ContentSecurityPolicy = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'";
        else if (path.StartsWithSegments("/api/v1/media"))
            // استثناء مضبوط: الوسائط العامة (صفحة المشاركة) تُشغَّل من أصل الواجهة — نسمح بالتضمين كوسائط فقط
            headers.ContentSecurityPolicy = "default-src 'none'; media-src 'self'; frame-ancestors 'none'";
        else
            headers.ContentSecurityPolicy = DefaultCsp;

        if (path.StartsWithSegments("/api") && !path.StartsWithSegments("/api/v1/media"))
            headers.CacheControl = "no-store";
        return next(ctx);
    }
}

/// <summary>Correlation-Id في كل سطر سجل وفي كل استجابة.</summary>
public sealed class CorrelationIdMiddleware(RequestDelegate next)
{
    public const string Header = "X-Correlation-Id";

    public async Task InvokeAsync(HttpContext ctx)
    {
        var incoming = ctx.Request.Headers[Header].ToString();
        if (!string.IsNullOrWhiteSpace(incoming) && incoming.Length <= 64 && incoming.All(c => char.IsLetterOrDigit(c) || c == '-'))
            ctx.TraceIdentifier = incoming;
        ctx.Response.Headers[Header] = ctx.TraceIdentifier;
        using (LogContext.PushProperty("CorrelationId", ctx.TraceIdentifier))
            await next(ctx);
    }
}

/// <summary>
/// مسار الإحالة العاجلة على مستوى HTTP: أي استجابة رُصد فيها مؤشر خطر تحمل رأساً صريحاً،
/// فيعرض العميل شاشة الطوارئ فوراً بصرف النظر عن شكل جسم الاستجابة أو نجاحها.
/// </summary>
public sealed class EmergencySignalShortCircuitMiddleware(RequestDelegate next)
{
    public const string Header = "X-Sanad-Emergency-Referral";

    public Task InvokeAsync(HttpContext ctx, ISafetySignalContext safety)
    {
        ctx.Response.OnStarting(() =>
        {
            if (safety.EmergencyReferralTriggered) ctx.Response.Headers[Header] = "1";
            return Task.CompletedTask;
        });
        return next(ctx);
    }
}
