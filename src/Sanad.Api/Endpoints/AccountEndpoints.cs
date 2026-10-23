using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Modules.Accounts;
using Sanad.Application.Modules.Consent;
using Sanad.Application.Modules.Directory;
using Sanad.Application.Modules.Messaging;
using Sanad.Application.Modules.PatientCare;
using Sanad.Application.Modules.Ruqyah;
using Sanad.Application.Modules.RuqyahLibrary;
using Sanad.Application.Modules.Safety;
using Sanad.Application.Modules.Scheduling;
using Sanad.Application.Modules.Verification;
using Sanad.Api.Authorization;
using Sanad.Domain.Consent;
using Sanad.Domain.Identity;
using Sanad.Infrastructure.Persistence;

namespace Sanad.Api.Endpoints;

public static class AccountEndpoints
{
    public sealed record DeleteAccountRequest(string Confirmation);
    public sealed record ConsentRequest(ConsentType Type);
    public sealed record FavoriteRequest(Guid AudioTrackId);
    public sealed record ResubmitRequest(string DocumentType, Guid UploadedDocumentFileId);
    public sealed record NotificationDto(Guid Id, string Kind, string Title, string Body, string? Link, DateTimeOffset CreatedAtUtc, bool IsRead);

    public static IEndpointRouteBuilder MapAccountEndpoints(this IEndpointRouteBuilder app)
    {
        var me = app.MapGroup("/api/v1/me").WithTags("Me").RequireAuthorization(Policies.ManageOwnAccountOnly);

        me.MapGet("", async (ISender s) => Results.Ok(await s.Send(new GetMyProfileQuery())));
        me.MapPatch("", async (UpdateMyProfileCommand cmd, ISender s) => { await s.Send(cmd); return Results.NoContent(); });
        me.MapPatch("/privacy-preferences", async (UpdatePrivacyPreferencesCommand cmd, ISender s) => { await s.Send(cmd); return Results.NoContent(); });
        me.MapGet("/access-log", async (ISender s) => Results.Ok(await s.Send(new GetMyAccessLogQuery())));
        me.MapPost("/export", async (ISender s) => Results.Ok(await s.Send(new ExportMyDataQuery())));
        me.MapDelete("", async ([FromBody] DeleteAccountRequest req, ISender s) =>
        {
            await s.Send(new DeleteMyAccountCommand(req.Confirmation));
            return Results.NoContent();
        });

        // ── الموافقات ──
        me.MapGet("/consent", async (ISender s) => Results.Ok(await s.Send(new GetMyConsentStatusQuery())));
        me.MapGet("/consent/history", async (ISender s) => Results.Ok(await s.Send(new GetMyConsentHistoryQuery())));
        me.MapPost("/consent", async (ConsentRequest req, ISender s) => { await s.Send(new RecordConsentCommand(req.Type)); return Results.NoContent(); });
        me.MapDelete("/consent/{type}", async (ConsentType type, ISender s) => { await s.Send(new RevokeConsentCommand(type)); return Results.NoContent(); });

        // ── الترقية إلى مقدّم خدمة (قرار إداري منفصل عن الهوية) ──
        me.MapPost("/documents", async (IFormFile file, ISender s) =>
        {
            await using var stream = file.OpenReadStream();
            return Results.Ok(await s.Send(new UploadVerificationDocumentCommand(stream, file.Length)));
        }).DisableAntiforgery().WithMetadata(new RequestSizeLimitAttribute(12 * 1024 * 1024)).RequireRateLimiting("uploads");
        // حساب مسجَّل: حد لكل حساب بدل CAPTCHA (لا ودجت في أي واجهة، فكان الطلب يُرفض في الإنتاج)
        me.MapPost("/provider-upgrade-request", async (RequestProviderUpgradeCommand cmd, ISender s) => Results.Ok(await s.Send(cmd)))
            .RequireRateLimiting("uploads");
        me.MapGet("/provider-upgrade-requests", async (ISender s) => Results.Ok(await s.Send(new GetMyUpgradeRequestsQuery())));
        me.MapPost("/provider-upgrade-requests/{id:guid}/resubmit", async (Guid id, ResubmitRequest req, ISender s) =>
            Results.Ok(await s.Send(new ResubmitUpgradeDocumentCommand(id, req.DocumentType, req.UploadedDocumentFileId))));

        // ── ما يخص المستفيد ──
        me.MapGet("/bookings", async (ISender s) => Results.Ok(await s.Send(new GetMyBookingsQuery())));
        me.MapGet("/conversations", async (ISender s) => Results.Ok(await s.Send(new GetMyConversationsQuery())));
        me.MapGet("/reports", async (ISender s) => Results.Ok(await s.Send(new GetMyReportsQuery())));
        me.MapGet("/recommendations", async (ISender s) => Results.Ok(await s.Send(new GetMyRecommendationsQuery())));
        me.MapPost("/recommendations/{id:guid}/acknowledge", async (Guid id, ISender s) =>
        {
            await s.Send(new AcknowledgeRecommendationCommand(id));
            return Results.NoContent();
        });

        me.MapGet("/favorites", async (ISender s) => Results.Ok(await s.Send(new GetMyFavoritesQuery())));
        me.MapPost("/favorites", async (FavoriteRequest req, ISender s) => { await s.Send(new AddFavoriteTrackCommand(req.AudioTrackId)); return Results.NoContent(); });
        me.MapDelete("/favorites/{trackId:guid}", async (Guid trackId, ISender s) => { await s.Send(new RemoveFavoriteTrackCommand(trackId)); return Results.NoContent(); });

        // ── الورد اليومي (شخصي) ──
        me.MapGet("/wird", async (DateOnly day, ISender s) => Results.Ok(await s.Send(new GetMyWirdQuery(day))));
        me.MapPut("/wird", async (SaveMyWirdCommand cmd, ISender s) => { await s.Send(cmd); return Results.NoContent(); });

        // ── تذكير الأذكار على هذا الجهاز (Web Push) ──
        me.MapGet("/reminders/devices", async (ISender s) => Results.Ok(await s.Send(new GetMyReminderDevicesQuery())));
        me.MapPut("/reminders/device", async (SaveMyReminderDeviceCommand cmd, ISender s) => Results.Ok(await s.Send(cmd)));
        me.MapPost("/reminders/device/remove", async (RemoveMyReminderDeviceCommand cmd, ISender s) => { await s.Send(cmd); return Results.NoContent(); });
        me.MapPost("/reminders/device/test", async (SendTestReminderCommand cmd, ISender s) => { await s.Send(cmd); return Results.NoContent(); })
            .RequireRateLimiting("public");

        // ── الإشعارات داخل التطبيق (نص عام فقط) ──
        me.MapGet("/notifications", async (SanadDbContext db, ICurrentUser user) =>
        {
            var uid = user.UserId!.Value;
            var items = (await db.UserNotifications.AsNoTracking().Where(n => n.UserId == uid).ToListAsync())
                .OrderByDescending(n => n.CreatedAtUtc).Take(100)
                .Select(n => new NotificationDto(n.Id, n.Kind, n.Title, n.Body, n.Link, n.CreatedAtUtc, n.ReadAtUtc != null)).ToList();
            return Results.Ok(items);
        });
        me.MapPost("/notifications/read-all", async (SanadDbContext db, ICurrentUser user, IDateTime clock) =>
        {
            var uid = user.UserId!.Value;
            foreach (var n in await db.UserNotifications.Where(n => n.UserId == uid && n.ReadAtUtc == null).ToListAsync()) n.ReadAtUtc = clock.UtcNow;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // ── بوابة المختص (ملفه، خدماته، مواعيده، حجوزاته) ──
        var provider = me.MapGroup("/provider-profile").WithTags("ProviderPortal").RequireAuthorization(Policies.ActOnOwnServiceOffering);
        provider.MapGet("", async (ISender s) => Results.Ok(await s.Send(new GetMyProviderProfileQuery())));
        provider.MapPut("", async (UpdateMyProviderProfileCommand cmd, ISender s) => { await s.Send(cmd); return Results.NoContent(); });
        provider.MapPost("/publish", async (ISender s) => { await s.Send(new PublishMyProviderProfileCommand()); return Results.NoContent(); });
        provider.MapPost("/offerings", async (CreateServiceOfferingCommand cmd, ISender s) => Results.Ok(await s.Send(cmd)));
        provider.MapPut("/offerings/{id:guid}", async (Guid id, UpdateServiceOfferingCommand cmd, ISender s) => Results.Ok(await s.Send(cmd with { Id = id })));
        provider.MapGet("/slots", async (DateTimeOffset? from, DateTimeOffset? to, ISender s) => Results.Ok(await s.Send(new GetMySlotsQuery(from, to))));
        provider.MapPost("/slots", async (CreateAvailabilitySlotCommand cmd, ISender s) => Results.Ok(await s.Send(cmd)));
        provider.MapDelete("/slots/{id:guid}", async (Guid id, ISender s) => { await s.Send(new CancelAvailabilitySlotCommand(id)); return Results.NoContent(); });
        provider.MapGet("/bookings", async (Domain.Scheduling.BookingStatus? status, ISender s) => Results.Ok(await s.Send(new GetProviderBookingsQuery(status))));

        return app;
    }
}
