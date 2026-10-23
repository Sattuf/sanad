using MediatR;
using Sanad.Api.Authorization;
using Sanad.Application.Modules.Messaging;
using Sanad.Application.Modules.PatientCare;
using Sanad.Application.Modules.Safety;
using Sanad.Application.Modules.Scheduling;
using Sanad.Domain.Safety;

namespace Sanad.Api.Endpoints;

public static class BookingEndpoints
{
    public sealed record ProposeAlternativeRequest(Guid AlternativeSlotId);
    public sealed record RejectRequest(string AdministrativeReason);
    public sealed record CaseNoteRequest(string Text);
    public sealed record RecommendationRequest(string GuidanceText, IReadOnlyList<Guid>? RecommendedAudioTrackIds);
    public sealed record PostMessageRequest(string Body);
    public sealed record ReportConversationRequest(Guid? MessageId, ReportCategory Category, ReportSeverity Severity, string? Description);

    public static IEndpointRouteBuilder MapBookingEndpoints(this IEndpointRouteBuilder app)
    {
        var b = app.MapGroup("/api/v1/bookings").WithTags("Scheduling").RequireAuthorization();

        b.MapPost("", async (CreateBookingRequestCommand cmd, ISender s) => Results.Ok(await s.Send(cmd))).RequireIdempotencyKey();
        b.MapGet("/{id:guid}", async (Guid id, ISender s) => Results.Ok(await s.Send(new GetBookingStatusQuery(id))));
        b.MapPost("/{id:guid}/accept", async (Guid id, ISender s) => { await s.Send(new AcceptBookingCommand(id)); return Results.NoContent(); });
        b.MapPost("/{id:guid}/propose-alternative", async (Guid id, ProposeAlternativeRequest req, ISender s) =>
        {
            await s.Send(new ProposeAlternativeTimeCommand(id, req.AlternativeSlotId));
            return Results.NoContent();
        }).RequireAuthorization(Policies.ActOnOwnServiceOffering);
        b.MapPost("/{id:guid}/reject", async (Guid id, RejectRequest req, ISender s) =>
        {
            await s.Send(new RejectBookingCommand(id, req.AdministrativeReason));
            return Results.NoContent();
        }).RequireAuthorization(Policies.ActOnOwnServiceOffering);
        b.MapPost("/{id:guid}/cancel", async (Guid id, ISender s) => { await s.Send(new CancelBookingCommand(id)); return Results.NoContent(); });
        b.MapPost("/{id:guid}/complete", async (Guid id, ISender s) => { await s.Send(new CompleteBookingCommand(id)); return Results.NoContent(); })
            .RequireAuthorization(Policies.ActOnOwnServiceOffering);
        b.MapPost("/{id:guid}/dispute", async (Guid id, ISender s) => { await s.Send(new OpenBookingDisputeCommand(id)); return Results.NoContent(); });

        // "ملاحظتي للمختص": صاحب الحجز، المختص المُسنَد، أو منسق عند تصعيد مرتبط
        b.MapGet("/{id:guid}/note", async (Guid id, ISender s) => Results.Ok(await s.Send(new GetBookingNoteQuery(id))))
            .RequireAuthorization(Policies.ReadOwnBeneficiaryNoteOnly);

        // ════ تمييز حاسم: /provider-note (خاص، إشرافي) و/recommendations (يصل للمستفيد) — مساران وPolicies منفصلة تماماً ════
        b.MapPost("/{id:guid}/provider-note", async (Guid id, CaseNoteRequest req, ISender s) =>
                Results.Ok(new { id = await s.Send(new RecordProviderCaseNoteCommand(id, req.Text)) }))
            .WithTags("PatientCare").RequireAuthorization(Policies.ActOnOwnServiceOffering);
        b.MapGet("/{id:guid}/provider-note", async (Guid id, ISender s) => Results.Ok(await s.Send(new GetCaseNoteForBookingQuery(id))))
            .WithTags("PatientCare").RequireAuthorization(Policies.ReadCaseNoteWithSupervisionOnly);

        b.MapPost("/{id:guid}/recommendations", async (Guid id, RecommendationRequest req, ISender s) =>
                Results.Ok(new { id = await s.Send(new SendProviderRecommendationCommand(id, req.GuidanceText, req.RecommendedAudioTrackIds)) }))
            .WithTags("PatientCare").RequireAuthorization(Policies.ActOnOwnServiceOffering);
        b.MapGet("/{id:guid}/recommendations", async (Guid id, ISender s) => Results.Ok(await s.Send(new GetSentRecommendationsForBookingQuery(id))))
            .WithTags("PatientCare").RequireAuthorization(Policies.ActOnOwnServiceOffering);

        // ── المحادثة الإدارية ──
        b.MapPost("/{id:guid}/conversation", async (Guid id, ISender s) => Results.Ok(await s.Send(new OpenConversationCommand(id))))
            .WithTags("Messaging");

        var c = app.MapGroup("/api/v1/conversations").WithTags("Messaging").RequireAuthorization(Policies.ReadAssignedConversationOnly);
        c.MapGet("/{id:guid}/messages", async (Guid id, DateTimeOffset? before, int? take, ISender s) =>
            Results.Ok(await s.Send(new GetConversationMessagesQuery(id, before, take))));
        c.MapPost("/{id:guid}/messages", async (Guid id, PostMessageRequest req, ISender s) =>
            Results.Ok(await s.Send(new PostMessageCommand(id, req.Body)))).RequireRateLimiting("messages");
        c.MapPost("/{id:guid}/report", async (Guid id, ReportConversationRequest req, ISender s) =>
            Results.Ok(await s.Send(new ReportConversationCommand(id, req.MessageId, req.Category, req.Severity, req.Description))))
            .RequireRateLimiting("reports");

        // ── البلاغات العامة: حد لكل حساب + Idempotency-Key ──
        // بلا CAPTCHA: المُبلِّغ مسجَّل الدخول، وتطبيق الجوال لا يستطيع عرض ودجت Turnstile أصلاً، فكان كل بلاغ منه يُرفض في الإنتاج
        app.MapPost("/api/v1/reports", async (SubmitReportCommand cmd, ISender s) => Results.Ok(await s.Send(cmd)))
            .WithTags("Safety").RequireAuthorization().RequireRateLimiting("reports").RequireIdempotencyKey();

        return app;
    }
}
