using Sanad.Application.Common.Interfaces;
using Serilog.Context;

namespace Sanad.Api.Middleware;

/// <summary>رؤوس أمان HTTP — references/11-security-hardening-and-scalability.md §11.7.</summary>
public sealed class SecurityHeadersMiddleware(RequestDelegate next)
{
    private const string DefaultCsp = "default-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'";

    public Task InvokeAsync(HttpContext ctx)
    {
        // عند بدء الإرسال لا قبل التنفيذ: معالج الاستثناءات يمسح رؤوس الاستجابة قبل كتابة الخطأ،
        // فرؤوس تُضبط مسبقاً كانت تضيع من كل 4xx/5xx يمر به (وجده ZAP واختبار ApiHardeningTests)
        ctx.Response.OnStarting(() => { Apply(ctx); return Task.CompletedTask; });
        return next(ctx);
    }

    private static void Apply(HttpContext ctx)
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

        // الصوت يُشغَّل بعنصر <audio> من أصل الواجهة (طلب بلا CORS)، فيُسمح به عبر الأصول؛ وما عداه JSON يُجلب بـ CORS
        headers["Cross-Origin-Resource-Policy"] = path.StartsWithSegments("/api/v1/media") || path.StartsWithSegments("/api/v1/public/recitation")
            || path.StartsWithSegments("/api/v1/files/signed") ? "cross-origin" : "same-origin";

        // نقطة النهاية قد تضبط تخزيناً مؤقتاً عاماً (التلاوات) فلا نتجاوزه
        if (path.StartsWithSegments("/api") && !path.StartsWithSegments("/api/v1/media") && string.IsNullOrEmpty(headers.CacheControl))
            headers.CacheControl = "no-store";
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

