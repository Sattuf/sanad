using Microsoft.AspNetCore.Mvc;
using Sanad.Application.Common.Interfaces;

namespace Sanad.Api.Endpoints;

public static class EndpointFilters
{
    public const string CaptchaHeader = "X-Captcha-Token";

    /// <summary>CAPTCHA إلزامي — يُرفض الطلب قبل الوصول لأي منطق عمل (حماية من الإساءة الآلية واستنزاف التكلفة).</summary>
    public static RouteHandlerBuilder RequireCaptcha(this RouteHandlerBuilder builder) =>
        builder.AddEndpointFilter(async (ctx, next) =>
        {
            var http = ctx.HttpContext;
            var verifier = http.RequestServices.GetRequiredService<ICaptchaVerifier>();
            var token = http.Request.Headers[CaptchaHeader].ToString();
            if (!await verifier.VerifyAsync(token, http.Connection.RemoteIpAddress?.ToString(), http.RequestAborted))
                return Results.Problem(statusCode: 400, title: "تحقق CAPTCHA مطلوب أو غير صالح.",
                    extensions: new Dictionary<string, object?> { ["code"] = "captcha_failed" });
            return await next(ctx);
        }).WithMetadata(new ProducesResponseTypeAttribute(400));

    /// <summary>Idempotency-Key إلزامي (UUID أو نص آمن ≤ 100 حرف).</summary>
    public static RouteHandlerBuilder RequireIdempotencyKey(this RouteHandlerBuilder builder) =>
        builder.AddEndpointFilter(async (ctx, next) =>
        {
            var key = ctx.HttpContext.Request.Headers["Idempotency-Key"].ToString();
            if (string.IsNullOrWhiteSpace(key) || key.Length > 100 || !key.All(c => char.IsLetterOrDigit(c) || c is '-' or '_'))
                return Results.Problem(statusCode: 400, title: "الترويسة Idempotency-Key مطلوبة لهذا الطلب.",
                    extensions: new Dictionary<string, object?> { ["code"] = "idempotency_key_required" });
            return await next(ctx);
        });
}
