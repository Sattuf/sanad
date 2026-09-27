using MediatR;
using Microsoft.AspNetCore.Mvc;
using Sanad.Api.Authorization;
using Sanad.Application.Modules.Accounts;
using Sanad.Application.Modules.Directory;
using Sanad.Application.Modules.Ruqyah;
using Sanad.Application.Modules.RuqyahLibrary;
using Sanad.Application.Modules.Safety;
using Sanad.Application.Modules.Verification;
using Sanad.Domain.Identity;
using Sanad.Domain.Safety;
using Sanad.Domain.Verification;

namespace Sanad.Api.Endpoints;

/// <summary>بوابات الإدارة — كل مجموعة بسياسة دورها، وكل الأدوار الإدارية تتطلب جلسة تحقق ثنائي (amr=mfa).</summary>
public static class AdminEndpoints
{
    public sealed record RecheckRequest(bool StillValid, DateTimeOffset? NewExpiresAtUtc);
    public sealed record ReasonRequest(string ReasonCode);
    public sealed record AttachOrganizationRequest(Guid? OrganizationId);
    public sealed record ReviewReportRequest(bool Substantiated, bool InvolvesPossibleCrimeOrMinorRisk);
    public sealed record RecomputeRequest(Guid SubjectAccountId);
    public sealed record RoleRequest(SanadRole Role);

    public static IEndpointRouteBuilder MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        // ── التوثيق والجهات (Coordinator) ──
        var coord = app.MapGroup("/api/v1/admin").WithTags("Admin.Verification").RequireAuthorization(Policies.ReviewVerification);

        coord.MapGet("/verifications", async (VerificationStatus? status, ISender s) => Results.Ok(await s.Send(new GetVerificationQueueQuery(status))));
        coord.MapGet("/verifications/{id:guid}/document-link", async (Guid id, ISender s) => Results.Ok(await s.Send(new GetVerificationDocumentLinkQuery(id))));
        coord.MapPost("/verifications/{id:guid}/review", async (Guid id, ReviewVerificationCommand cmd, ISender s) =>
            Results.Ok(await s.Send(cmd with { VerificationId = id })));
        coord.MapPost("/verifications/{id:guid}/recheck", async (Guid id, RecheckRequest req, ISender s) =>
            Results.Ok(await s.Send(new RecheckVerificationCommand(id, req.StillValid, req.NewExpiresAtUtc))));
        coord.MapGet("/verifications/history/{subjectId:guid}", async (Guid subjectId, ISender s) =>
            Results.Ok(await s.Send(new GetVerificationHistoryQuery(subjectId))));

        coord.MapGet("/providers", async (ISender s) => Results.Ok(await s.Send(new ListProvidersForAdminQuery())));
        coord.MapPost("/profiles/{id:guid}/suspend", async (Guid id, ReasonRequest req, ISender s) =>
        {
            await s.Send(new SuspendProfileCommand(id, req.ReasonCode));
            return Results.NoContent();
        });
        coord.MapPost("/profiles/{id:guid}/lift-suspension", async (Guid id, ISender s) =>
        {
            await s.Send(new LiftProfileSuspensionCommand(id));
            return Results.NoContent();
        });
        coord.MapPost("/profiles/{id:guid}/organization", async (Guid id, AttachOrganizationRequest req, ISender s) =>
        {
            await s.Send(new AttachProviderToOrganizationCommand(id, req.OrganizationId));
            return Results.NoContent();
        });

        coord.MapGet("/organizations", async (ISender s) => Results.Ok(await s.Send(new ListOrganizationsForAdminQuery())));
        coord.MapPost("/organizations", async (CreateOrganizationCommand cmd, ISender s) => Results.Ok(await s.Send(cmd)));
        coord.MapPost("/organizations/{id:guid}/publish", async (Guid id, ISender s) =>
        {
            await s.Send(new PublishOrganizationCommand(id));
            return Results.NoContent();
        });
        coord.MapPost("/organizations/{id:guid}/suspend", async (Guid id, ReasonRequest req, ISender s) =>
        {
            await s.Send(new SuspendOrganizationCommand(id, req.ReasonCode));
            return Results.NoContent();
        });

        // ── البلاغات والتصعيد (Coordinator) ──
        coord.MapGet("/reports", async (ReportStatus? status, ISender s) => Results.Ok(await s.Send(new GetReportsQueueQuery(status)))).WithTags("Admin.Safety");
        coord.MapGet("/reports/{id:guid}", async (Guid id, ISender s) => Results.Ok(await s.Send(new GetReportDetailQuery(id)))).WithTags("Admin.Safety");
        coord.MapPost("/reports/{id:guid}/investigate", async (Guid id, ISender s) =>
        {
            await s.Send(new StartReportInvestigationCommand(id));
            return Results.NoContent();
        }).WithTags("Admin.Safety");
        coord.MapPost("/reports/{id:guid}/review", async (Guid id, ReviewReportRequest req, ISender s) =>
            Results.Ok(await s.Send(new ReviewReportCommand(id, req.Substantiated, req.InvolvesPossibleCrimeOrMinorRisk)))).WithTags("Admin.Safety");
        coord.MapGet("/escalations", async (bool? openOnly, ISender s) => Results.Ok(await s.Send(new GetEscalationCasesQuery(openOnly ?? true)))).WithTags("Admin.Safety");
        coord.MapPost("/escalations/recompute", async (RecomputeRequest req, ISender s) =>
            Results.Ok(await s.Send(new RecomputeEscalationCommand(req.SubjectAccountId)))).WithTags("Admin.Safety");
        coord.MapPost("/escalations/{id:guid}/close", async (Guid id, ISender s) =>
        {
            await s.Send(new CloseEscalationCommand(id));
            return Results.NoContent();
        }).WithTags("Admin.Safety");

        app.MapGet("/api/v1/admin/safety-alerts", async (ISender s) => Results.Ok(await s.Send(new GetSafetyAlertsQuery())))
            .WithTags("Admin.Safety").RequireAuthorization(Policies.ReviewSafety);

        // ── مكتبة الرقية (ContentManager) ──
        var lib = app.MapGroup("/api/v1/admin/library").WithTags("Admin.Library").RequireAuthorization(Policies.ManageContentLibrary);
        lib.MapGet("/tracks", async (ISender s) => Results.Ok(await s.Send(new GetAdminLibraryQuery())));
        lib.MapPost("/uploads", async (IFormFile file, ISender s) =>
        {
            await using var stream = file.OpenReadStream();
            return Results.Ok(await s.Send(new UploadLibraryAudioCommand(stream, file.Length)));
        }).DisableAntiforgery().WithMetadata(new RequestSizeLimitAttribute(64 * 1024 * 1024));
        lib.MapPost("/tracks", async (CreateAudioTrackCommand cmd, ISender s) => Results.Ok(await s.Send(cmd)));
        lib.MapPut("/tracks/{id:guid}", async (Guid id, UpdateAudioTrackCommand cmd, ISender s) => Results.Ok(await s.Send(cmd with { Id = id })));
        lib.MapPost("/tracks/{id:guid}/publish", async (Guid id, ISender s) => Results.Ok(await s.Send(new PublishTrackCommand(id))));
        lib.MapPost("/tracks/{id:guid}/unpublish", async (Guid id, ISender s) => Results.Ok(await s.Send(new UnpublishTrackCommand(id))));
        lib.MapGet("/catalog", async (ISender s) => Results.Ok(await s.Send(new GetLibraryCatalogQuery())));
        lib.MapPost("/catalog/import", async (ImportCatalogTrackCommand cmd, ISender s) => Results.Ok(await s.Send(cmd)));
        lib.MapPost("/youtube", async (AddYouTubeTrackCommand cmd, ISender s) => Results.Ok(await s.Send(cmd)));

        // ── الأدعية المكتوبة (ContentManager): مسودة ← مراجعة ← نشر بيد مدير محتوى آخر ──
        var duas = app.MapGroup("/api/v1/admin/ruqyah/duas").WithTags("Admin.Ruqyah").RequireAuthorization(Policies.ManageContentLibrary);
        duas.MapGet("", async (ISender s) => Results.Ok(await s.Send(new GetAdminDuasQuery())));
        duas.MapPost("", async (CreateWrittenDuaCommand cmd, ISender s) => Results.Ok(await s.Send(cmd)));
        duas.MapPut("/{id:guid}", async (Guid id, UpdateWrittenDuaCommand cmd, ISender s) => Results.Ok(await s.Send(cmd with { Id = id })));
        duas.MapPost("/{id:guid}/review", async (Guid id, ReviewWrittenDuaCommand cmd, ISender s) => Results.Ok(await s.Send(cmd with { Id = id })));
        duas.MapDelete("/{id:guid}", async (Guid id, ISender s) => { await s.Send(new DeleteWrittenDuaCommand(id)); return Results.NoContent(); });

        // ── إدارة الأدوار (SystemAdmin فقط) — لا منح SystemAdmin من التطبيق إطلاقاً ──
        var users = app.MapGroup("/api/v1/admin/users").WithTags("Admin.Users").RequireAuthorization(Policies.AssignSystemRoles);
        users.MapGet("", async (string? search, int? page, int? pageSize, ISender s) => Results.Ok(await s.Send(new SearchUsersQuery(search, page, pageSize))));
        users.MapPost("/{id:guid}/roles", async (Guid id, RoleRequest req, ISender s) =>
        {
            await s.Send(new AssignRoleCommand(id, req.Role));
            return Results.NoContent();
        });
        users.MapDelete("/{id:guid}/roles/{role}", async (Guid id, SanadRole role, ISender s) =>
        {
            await s.Send(new RemoveRoleCommand(id, role));
            return Results.NoContent();
        });

        return app;
    }
}
