using MediatR;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Modules.Directory;
using Sanad.Application.Modules.Ruqyah;
using Sanad.Application.Modules.RuqyahLibrary;
using Sanad.Application.Modules.Safety;
using Sanad.Application.Modules.Scheduling;
using Sanad.Domain.Directory;
using Sanad.Domain.Identity;
using Sanad.Infrastructure.Storage;

namespace Sanad.Api.Endpoints;

/// <summary>الدليل العام، صفحة المشاركة، الوسائط العامة، ومعلومات الطوارئ — بلا مصادقة، بحد معدل.</summary>
public static class PublicEndpoints
{
    /// <summary>صلاحية رابط الصوت الموقّع حين لا يوجد CDN — تكفي لسورة طويلة مع الإيقاف والاستئناف.</summary>
    private static readonly TimeSpan MediaLinkTtl = TimeSpan.FromHours(6);

    public static IEndpointRouteBuilder MapPublicEndpoints(this IEndpointRouteBuilder app)
    {
        var dir = app.MapGroup("/api/v1").WithTags("Directory");

        dir.MapGet("/directory", async (string? q, OrganizationTrack? track, PractitionerType? practitionerType, ServiceDeliveryMode? deliveryMode,
                string? language, string? city, int? page, int? pageSize, ISender s) =>
            Results.Ok(await s.Send(new SearchDirectoryQuery(q, track, practitionerType, deliveryMode, language, city, page, pageSize))))
            .AllowAnonymous().RequireRateLimiting("public");
        dir.MapGet("/directory/transparency", async (ISender s) => Results.Ok(await s.Send(new GetVerificationTransparencyQuery())))
            .AllowAnonymous().RequireRateLimiting("public");
        dir.MapGet("/providers/compare", async (string ids, ISender s) =>
        {
            var parsed = ids.Split(',', StringSplitOptions.RemoveEmptyEntries).Select(x => Guid.TryParse(x, out var g) ? g : Guid.Empty).ToList();
            return Results.Ok(await s.Send(new CompareProvidersQuery(parsed)));
        }).AllowAnonymous().RequireRateLimiting("public");
        dir.MapGet("/providers/{id:guid}", async (Guid id, ISender s) => Results.Ok(await s.Send(new GetProviderByIdQuery(id))))
            .AllowAnonymous().RequireRateLimiting("public");
        dir.MapGet("/organizations/{id:guid}", async (Guid id, ISender s) => Results.Ok(await s.Send(new GetOrganizationByIdQuery(id))))
            .AllowAnonymous().RequireRateLimiting("public");
        dir.MapGet("/providers/{id:guid}/availability", async (Guid id, DateTimeOffset? from, DateTimeOffset? to, ISender s) =>
            Results.Ok(await s.Send(new GetProviderAvailabilityQuery(id, from, to)))).RequireAuthorization();

        // ── مكتبة الرقية (مصادَق) ──
        var lib = app.MapGroup("/api/v1/library").WithTags("RuqyahLibrary").RequireAuthorization();
        lib.MapGet("", async (Domain.RuqyahLibrary.AudioTrackCategory? category, string? q, ISender s) =>
            Results.Ok(await s.Send(new GetLibraryQuery(category, q))));
        lib.MapPost("/tracks/{id:guid}/share-link", async (Guid id, ISender s) => Results.Ok(await s.Send(new CreateSharedLinkCommand(id))))
            .RequireRateLimiting("share");

        // ── صفحة المشاركة العامة: بلا مصادقة إطلاقاً، ولا أي بيانات مستخدم ──
        app.MapGet("/api/v1/public/shared/{shortCode}", async (string shortCode, ISender s) =>
                Results.Ok(await s.Send(new ResolveSharedLinkQuery(shortCode))))
            .WithTags("PublicShare").AllowAnonymous().RequireRateLimiting("public");

        // ── بث الصوت: منشور فقط (أو معاينة ContentManager) — يدعم Range للتقديم/التأخير ──
        app.MapGet("/api/v1/media/tracks/{id:guid}", async (Guid id, bool? preview, HttpContext http, ISender s, IFileStorage storage) =>
            {
                var media = await s.Send(new GetTrackMediaQuery(id, preview == true));
                // المنشور يُخدم من CDN/التخزين مباشرة؛ المعاينة غير المنشورة تُبث عبر الـ API دائماً
                if (preview != true && storage.DirectReadUrl(media.StorageKey, MediaLinkTtl) is { } direct) return Results.Redirect(direct);
                var stream = await storage.OpenReadAsync(media.StorageKey, http.RequestAborted);
                if (stream is null) return Results.NotFound();
                http.Response.Headers.CacheControl = preview == true ? "no-store" : "public, max-age=3600";
                return Results.Stream(stream, media.ContentType, enableRangeProcessing: true);
            })
            .WithTags("Media").AllowAnonymous().RequireRateLimiting("media");

        // ── تلاوة آيات «الرقية والتحصين»: عامة، يجلبها الخادم من المصدر مرة واحدة ثم يخدمها من تخزينه ──
        app.MapGet("/api/v1/public/recitation/reciters", async (ISender s) => Results.Ok(await s.Send(new GetRecitationRecitersQuery())))
            .WithTags("Recitation").AllowAnonymous().RequireRateLimiting("public");
        app.MapGet("/api/v1/public/recitation/{reciter}/{surah:int}/{ayah:int}", async (string reciter, int surah, int ayah, HttpContext http, ISender s, IFileStorage storage) =>
            {
                var media = await s.Send(new GetAyahAudioQuery(reciter, surah, ayah));
                if (storage.DirectReadUrl(media.StorageKey, MediaLinkTtl) is { } direct) return Results.Redirect(direct);
                var stream = await storage.OpenReadAsync(media.StorageKey, http.RequestAborted);
                if (stream is null) return Results.NotFound();
                http.Response.Headers.CacheControl = "public, max-age=604800, immutable";
                return Results.Stream(stream, media.ContentType, enableRangeProcessing: true);
            })
            .WithTags("Recitation").AllowAnonymous().RequireRateLimiting("media");

        // ── الأدعية المكتوبة المنشورة (بعد المراجعة) — تُدمج في مجموعات «الرقية والتحصين» ──
        app.MapGet("/api/v1/public/ruqyah/duas", async (ISender s) => Results.Ok(await s.Send(new GetPublishedDuasQuery())))
            .WithTags("Ruqyah").AllowAnonymous().RequireRateLimiting("public");

        // ── المفتاح العام لإشعارات الأذكار (VAPID) — Enabled=false إن لم تُعدّ ──
        app.MapGet("/api/v1/public/reminders/push-config", async (ISender s) => Results.Ok(await s.Send(new GetPushConfigQuery())))
            .WithTags("Ruqyah").AllowAnonymous().RequireRateLimiting("public");

        // ── أدنى إصدار مدعوم من تطبيق الجوال: أقدم منه يُطلب منه التحديث (لا كسر لـ /api/v1 دون ذلك) ──
        app.MapGet("/api/v1/public/app/min-version", (IConfiguration config) => Results.Ok(new MobileMinVersionDto(
                config["MobileApp:MinVersion:Ios"] ?? "0.0.0", config["MobileApp:MinVersion:Android"] ?? "0.0.0",
                config["MobileApp:StoreUrl:Ios"], config["MobileApp:StoreUrl:Android"])))
            .WithTags("Mobile").AllowAnonymous().RequireRateLimiting("public");

        // ── روابط المستندات الخاصة الموقّعة قصيرة الأجل ──
        // روابط التخزين المحلي الموقّعة فقط؛ مع S3 تصدر الروابط الموقّعة من خدمة التخزين نفسها
        app.MapGet("/api/v1/files/signed", async (string key, long exp, string sig, HttpContext http, IFileStorage files) =>
            {
                if (files is not LocalFileStorage storage || !storage.ValidateSignature(key, exp, sig)) return Results.NotFound();
                var stream = await storage.OpenReadAsync(key, http.RequestAborted);
                if (stream is null) return Results.NotFound();
                var ext = Path.GetExtension(key).ToLowerInvariant();
                var type = ext switch { ".pdf" => "application/pdf", ".jpg" => "image/jpeg", ".png" => "image/png", _ => "application/octet-stream" };
                return Results.File(stream, type, $"document{ext}");
            })
            .WithTags("Files").AllowAnonymous().RequireRateLimiting("public");

        // ── الطوارئ (عام بالكامل) ──
        app.MapGet("/api/v1/safety/emergency-info", async (ISender s) => Results.Ok(await s.Send(new GetEmergencyReferralInfoQuery())))
            .WithTags("Safety").AllowAnonymous();

        return app;
    }
}

public sealed record MobileMinVersionDto(string Ios, string Android, string? IosStoreUrl, string? AndroidStoreUrl);
