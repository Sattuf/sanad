using MediatR;
using Microsoft.AspNetCore.Mvc;
using Sanad.Api.Authorization;
using Sanad.Application.Modules.Companion;
using Sanad.Domain.Companion;

namespace Sanad.Api.Endpoints;

/// <summary>
/// تطبيق «سند» للرقية الذاتية (ADR-0021). العام: الخطط المنشورة وأرقام الطوارئ والعدّادات المجهولة.
/// الحساب (اختياري): مزامنة الخطة والختمات. الإدارة: مدير محتوى للخطط والمعدّين، ومنسق أو مشرف سريري لأرقام الطوارئ.
/// </summary>
public static class CompanionEndpoints
{
    public sealed record ProgressRequest(List<int> CompletedDays, DateOnly? LastCompletedOn);
    public sealed record ReminderRequest(WirdReminder? Reminder);
    public sealed record ActionRequest(KhatmaAction Action, List<int>? Juz, string? MemberKey);
    public sealed record JoinRequest(string DisplayName);
    public sealed record ConsentRequest(string ConsentRef, DateOnly ConsentDate);
    public sealed record WithdrawRequest(string Reason);
    public sealed record EventsRequest(List<CompanionEventInput> Events);
    public sealed record CompanionConfigDto(string? SupportUrl);

    public static IEndpointRouteBuilder MapCompanionEndpoints(this IEndpointRouteBuilder app)
    {
        // ── عام ──
        var pub = app.MapGroup("/api/v1/public/companion").WithTags("Companion").AllowAnonymous().RequireRateLimiting("public");
        pub.MapGet("/plans", async (ISender s) => Results.Ok(await s.Send(new GetPublishedPlansQuery())));
        pub.MapGet("/plans/{id:guid}", async (Guid id, ISender s) => Results.Ok(await s.Send(new GetPublishedPlanQuery(id))));
        pub.MapPost("/events", async (EventsRequest req, ISender s) =>
        {
            await s.Send(new RecordCompanionEventsCommand(req.Events));
            return Results.NoContent();
        });
        // رابط الدعم خارج التطبيق فقط وبـ HTTPS (سياسات المتاجر، content-guardrails.md §5)؛ فارغ ⇐ زر الدعم معطّل
        pub.MapGet("/config", (IConfiguration config) =>
        {
            var url = config["Companion:SupportUrl"];
            var ok = Uri.TryCreate(url, UriKind.Absolute, out var u) && u.Scheme == Uri.UriSchemeHttps;
            return Results.Ok(new CompanionConfigDto(ok ? u!.ToString() : null));
        });

        // ── حسابي (اختياري) ──
        var me = app.MapGroup("/api/v1/me/companion").WithTags("Companion.Me").RequireAuthorization(Policies.ManageOwnAccountOnly);
        me.MapGet("/enrollment", async (ISender s) => Results.Ok(await s.Send(new GetMyEnrollmentQuery())));
        me.MapPost("/enrollment", async (StartMyPlanCommand cmd, ISender s) => Results.Ok(await s.Send(cmd)));
        me.MapPut("/enrollment/{id:guid}/progress", async (Guid id, ProgressRequest req, ISender s) =>
            Results.Ok(await s.Send(new SyncMyPlanProgressCommand(id, req.CompletedDays, req.LastCompletedOn))));
        me.MapPatch("/enrollment/reminder", async (ReminderRequest req, ISender s) =>
        {
            await s.Send(new SetMyWirdReminderCommand(req.Reminder));
            return Results.NoContent();
        });
        me.MapDelete("/enrollment", async (ISender s) =>
        {
            await s.Send(new StopMyPlanCommand());
            return Results.NoContent();
        });

        me.MapGet("/khatmas", async (ISender s) => Results.Ok(await s.Send(new GetMyKhatmasQuery())));
        me.MapPost("/khatmas", async (CreateKhatmaCommand cmd, ISender s) => Results.Ok(await s.Send(cmd)));
        me.MapGet("/khatmas/{id:guid}", async (Guid id, ISender s) => Results.Ok(await s.Send(new GetKhatmaQuery(id))));
        me.MapPut("/khatmas/{id:guid}", async (Guid id, UpdateKhatmaCommand cmd, ISender s) => Results.Ok(await s.Send(cmd with { Id = id })));
        me.MapPost("/khatmas/{id:guid}/actions", async (Guid id, ActionRequest req, ISender s) =>
            Results.Ok(await s.Send(new KhatmaActionCommand(id, req.Action, req.Juz, req.MemberKey))));
        me.MapDelete("/khatmas/{id:guid}", async (Guid id, ISender s) =>
        {
            await s.Send(new DeleteKhatmaCommand(id));
            return Results.NoContent();
        });
        me.MapGet("/invites/{code}", async (string code, ISender s) => Results.Ok(await s.Send(new PreviewKhatmaInviteQuery(code))))
            .RequireRateLimiting("invite");
        me.MapPost("/invites/{code}/join", async (string code, JoinRequest req, ISender s) =>
            Results.Ok(await s.Send(new JoinKhatmaCommand(code, req.DisplayName)))).RequireRateLimiting("invite");

        // ── إدارة الخطط والمعدّين (مدير محتوى بتحقق ثنائي) ──
        var content = app.MapGroup("/api/v1/admin/companion").WithTags("Admin.Companion").RequireAuthorization(Policies.ManageContentLibrary);
        content.MapGet("/authors", async (ISender s) => Results.Ok(await s.Send(new GetPlanAuthorsQuery())));
        content.MapPost("/authors", async (CreatePlanAuthorCommand cmd, ISender s) => Results.Ok(await s.Send(cmd)));
        content.MapPut("/authors/{id:guid}", async (Guid id, UpdatePlanAuthorCommand cmd, ISender s) => Results.Ok(await s.Send(cmd with { Id = id })));
        content.MapPost("/authors/{id:guid}/consent", async (Guid id, ConsentRequest req, ISender s) =>
            Results.Ok(await s.Send(new RecordAuthorConsentCommand(id, req.ConsentRef, req.ConsentDate))));
        content.MapPost("/authors/{id:guid}/consent/revoke", async (Guid id, ISender s) => Results.Ok(await s.Send(new RevokeAuthorConsentCommand(id))));

        content.MapGet("/plans", async (ISender s) => Results.Ok(await s.Send(new GetAdminPlansQuery())));
        content.MapPost("/plans", async (CreatePlanCommand cmd, ISender s) => Results.Ok(await s.Send(cmd)));
        content.MapPut("/plans/{id:guid}", async (Guid id, UpdatePlanCommand cmd, ISender s) => Results.Ok(await s.Send(cmd with { Id = id })));
        content.MapPost("/plans/{id:guid}/versions", async (Guid id, ISender s) => Results.Ok(await s.Send(new CreatePlanVersionCommand(id))));
        content.MapPost("/plans/{id:guid}/review", async (Guid id, ReviewPlanCommand cmd, ISender s) => Results.Ok(await s.Send(cmd with { Id = id })));
        content.MapPost("/plans/{id:guid}/withdraw", async (Guid id, WithdrawRequest req, ISender s) =>
            Results.Ok(await s.Send(new WithdrawPlanCommand(id, req.Reason))));
        content.MapDelete("/plans/{id:guid}", async (Guid id, ISender s) =>
        {
            await s.Send(new DeletePlanDraftCommand(id));
            return Results.NoContent();
        });

        app.MapGet("/api/v1/admin/companion/stats", async ([FromQuery] int? days, ISender s) =>
                Results.Ok(await s.Send(new GetCompanionStatsQuery(days ?? 30))))
            .WithTags("Admin.Companion").RequireAuthorization(Policies.ViewCompanionInsights);

        return app;
    }
}
