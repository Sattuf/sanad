using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sanad.Application.Common.Access;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Common.Messaging;
using Sanad.Application.Modules.Messaging;
using Sanad.Domain.Common;
using Sanad.Domain.Directory;
using Sanad.Domain.Identity;
using Sanad.Domain.Messaging;
using Sanad.Domain.Safety;

namespace Sanad.Application.Modules.Safety;

public sealed record ReportQueueItemDto(Guid Id, string TargetType, Guid TargetSubjectId, Guid EscalationSubjectId, string Category, string Severity,
    string Status, bool HasDescription, bool? IsSubstantiated, DateTimeOffset SubmittedAtUtc);

public sealed record ReportDetailDto(ReportQueueItemDto Report, string? Description, string? CurrentEscalationLevel);

public sealed record EscalationCaseDto(Guid Id, Guid SubjectAccountId, string Level, int DocumentedReportsCount, bool IsOpen, DateTimeOffset? LastRecomputedAtUtc);

internal static class ReportMapping
{
    public static ReportQueueItemDto ToItem(Report r) => new(r.Id, r.TargetType.ToString(), r.TargetSubjectId, r.EscalationSubjectId,
        r.Category.ToString(), r.Severity.ToString(), r.Status.ToString(), r.DescriptionEncrypted is not null, r.IsSubstantiated, r.SubmittedAtUtc);

    public static EscalationCaseDto ToDto(EscalationCase e) =>
        new(e.Id, e.SubjectAccountId, e.Level.ToString(), e.DocumentedReportsCount, e.IsOpen, e.LastRecomputedAtUtc);
}

// ── تقديم بلاغ (مستخدم مصادَق، خلف CAPTCHA، Idempotency-Key) ─────────────────────
public sealed record SubmitReportCommand(ReportTargetType TargetType, Guid TargetId, ReportCategory Category, ReportSeverity Severity, string? Description)
    : ICommand<ReportCreatedDto>, IIdempotentCommand, ISensitiveRequest;

public sealed class SubmitReportCommandValidator : AbstractValidator<SubmitReportCommand>
{
    public SubmitReportCommandValidator()
    {
        RuleFor(x => x.TargetType).IsInEnum().NotEqual(ReportTargetType.Conversation)
            .WithMessage("للإبلاغ عن محادثة استخدم زر الإبلاغ داخل المحادثة.");
        RuleFor(x => x.TargetId).NotEmpty();
        RuleFor(x => x.Category).IsInEnum();
        RuleFor(x => x.Severity).IsInEnum();
        RuleFor(x => x.Description).MaximumLength(Report.MaxDescriptionLength);
    }
}

public sealed class SubmitReportCommandHandler(IApplicationDbContext db, AccessContext access, IIdentityService identity, IFieldEncryptor encryptor, IDateTime clock)
    : IRequestHandler<SubmitReportCommand, ReportCreatedDto>
{
    public async Task<ReportCreatedDto> Handle(SubmitReportCommand request, CancellationToken cancellationToken)
    {

        var escalationSubject = request.TargetType switch
        {
            ReportTargetType.ProviderProfile => await db.ProviderProfiles.Where(p => p.Id == request.TargetId).Select(p => (Guid?)p.UserId).FirstOrDefaultAsync(cancellationToken),
            ReportTargetType.Organization => await db.Organizations.AnyAsync(o => o.Id == request.TargetId, cancellationToken) ? request.TargetId : null,
            ReportTargetType.UserAccount => await identity.GetUserAsync(request.TargetId, cancellationToken) is not null ? request.TargetId : null,
            _ => null,
        } ?? throw new NotFoundException("الجهة المُبلَّغ عنها", request.TargetId);

        var report = Report.Submit(access.UserId, request.TargetId, request.TargetType, escalationSubject, request.Category, request.Severity,
            request.Description, encryptor, clock.UtcNow);
        db.Reports.Add(report);
        await db.SaveChangesAsync(cancellationToken);
        return new ReportCreatedDto(report.Id, report.Status.ToString());
    }
}

public sealed record GetMyReportsQuery : IQuery<IReadOnlyList<ReportQueueItemDto>>;

public sealed class GetMyReportsQueryHandler(IApplicationDbContext db, AccessContext access) : IRequestHandler<GetMyReportsQuery, IReadOnlyList<ReportQueueItemDto>>
{
    public async Task<IReadOnlyList<ReportQueueItemDto>> Handle(GetMyReportsQuery request, CancellationToken cancellationToken) =>
        (await db.Reports.AsNoTracking().Where(r => r.ReporterUserId == access.UserId).ToListAsync(cancellationToken))
            .OrderByDescending(r => r.SubmittedAtUtc).Select(ReportMapping.ToItem).ToList();
}

// ── قائمة البلاغات والمراجعة (Coordinator + 2FA) ────────────────────────────────
[RequireRoles(SanadRoles.Coordinator, RequireMfa = true)]
public sealed record GetReportsQueueQuery(ReportStatus? Status) : IQuery<IReadOnlyList<ReportQueueItemDto>>;

public sealed class GetReportsQueueQueryHandler(IApplicationDbContext db) : IRequestHandler<GetReportsQueueQuery, IReadOnlyList<ReportQueueItemDto>>
{
    public async Task<IReadOnlyList<ReportQueueItemDto>> Handle(GetReportsQueueQuery request, CancellationToken cancellationToken)
    {
        var query = db.Reports.AsNoTracking();
        query = request.Status is { } s ? query.Where(r => r.Status == s)
            : query.Where(r => r.Status == ReportStatus.Open || r.Status == ReportStatus.UnderInvestigation);
        return (await query.ToListAsync(cancellationToken))
            .OrderByDescending(r => r.Severity).ThenBy(r => r.SubmittedAtUtc).Take(300).Select(ReportMapping.ToItem).ToList();
    }
}

[RequireRoles(SanadRoles.Coordinator, RequireMfa = true)]
public sealed record GetReportDetailQuery(Guid ReportId) : IQuery<ReportDetailDto>, ISensitiveRequest;

public sealed class GetReportDetailQueryHandler(IApplicationDbContext db, IFieldEncryptor encryptor, IAuditLogger audit)
    : IRequestHandler<GetReportDetailQuery, ReportDetailDto>
{
    public async Task<ReportDetailDto> Handle(GetReportDetailQuery request, CancellationToken cancellationToken)
    {
        var r = await db.Reports.AsNoTracking().FirstOrDefaultAsync(x => x.Id == request.ReportId, cancellationToken)
            ?? throw new NotFoundException("البلاغ", request.ReportId);
        var level = await db.EscalationCases.AsNoTracking().Where(e => e.SubjectAccountId == r.EscalationSubjectId && e.IsOpen)
            .Select(e => (EscalationLevel?)e.Level).FirstOrDefaultAsync(cancellationToken);
        await audit.LogAsync("Safety.ReportDescriptionRead", nameof(Report), r.Id, ct: cancellationToken);
        return new ReportDetailDto(ReportMapping.ToItem(r), r.DescriptionEncrypted is null ? null : encryptor.Decrypt(r.DescriptionEncrypted), level?.ToString());
    }
}

[RequireRoles(SanadRoles.Coordinator, RequireMfa = true)]
public sealed record StartReportInvestigationCommand(Guid ReportId) : ICommand<Unit>;

public sealed class StartReportInvestigationCommandHandler(IApplicationDbContext db, AccessContext access) : IRequestHandler<StartReportInvestigationCommand, Unit>
{
    public async Task<Unit> Handle(StartReportInvestigationCommand request, CancellationToken cancellationToken)
    {
        var r = await db.Reports.FirstOrDefaultAsync(x => x.Id == request.ReportId, cancellationToken) ?? throw new NotFoundException("البلاغ", request.ReportId);
        r.StartInvestigation(access.UserId);
        await db.SaveChangesAsync(cancellationToken);
        return Unit.Value;
    }
}

/// <summary>
/// قرار المنسق على بلاغ. البلاغ الموثَّق يعيد حساب التصعيد تلقائياً — رفعاً فقط؛ الخفض يتطلب RecomputeEscalationCommand صريحاً.
/// </summary>
[RequireRoles(SanadRoles.Coordinator, RequireMfa = true)]
public sealed record ReviewReportCommand(Guid ReportId, bool Substantiated, bool InvolvesPossibleCrimeOrMinorRisk) : ICommand<EscalationCaseDto?>;

public sealed class ReviewReportCommandHandler(IApplicationDbContext db, AccessContext access, IDateTime clock, EscalationService escalation)
    : IRequestHandler<ReviewReportCommand, EscalationCaseDto?>
{
    public async Task<EscalationCaseDto?> Handle(ReviewReportCommand request, CancellationToken cancellationToken)
    {
        var r = await db.Reports.FirstOrDefaultAsync(x => x.Id == request.ReportId, cancellationToken) ?? throw new NotFoundException("البلاغ", request.ReportId);
        if (r.ReporterUserId == access.UserId) throw new ForbiddenAccessException("لا يراجع المنسق بلاغاً قدّمه بنفسه.");
        r.Review(access.UserId, request.Substantiated, request.InvolvesPossibleCrimeOrMinorRisk, clock.UtcNow);
        await db.SaveChangesAsync(cancellationToken);
        if (!request.Substantiated) return null;
        var esc = await escalation.RecomputeAsync(r.EscalationSubjectId, null, cancellationToken);
        return ReportMapping.ToDto(esc);
    }
}

/// <summary>إعادة حساب صريحة من منسق مراجِع — الوحيدة المسموح لها بخفض مستوى التصعيد.</summary>
[RequireRoles(SanadRoles.Coordinator, RequireMfa = true)]
public sealed record RecomputeEscalationCommand(Guid SubjectAccountId) : ICommand<EscalationCaseDto>;

public sealed class RecomputeEscalationCommandHandler(EscalationService escalation, AccessContext access) : IRequestHandler<RecomputeEscalationCommand, EscalationCaseDto>
{
    public async Task<EscalationCaseDto> Handle(RecomputeEscalationCommand request, CancellationToken cancellationToken) =>
        ReportMapping.ToDto(await escalation.RecomputeAsync(request.SubjectAccountId, access.UserId, cancellationToken));
}

[RequireRoles(SanadRoles.Coordinator, RequireMfa = true)]
public sealed record CloseEscalationCommand(Guid EscalationCaseId) : ICommand<Unit>;

public sealed class CloseEscalationCommandHandler(IApplicationDbContext db, AccessContext access) : IRequestHandler<CloseEscalationCommand, Unit>
{
    public async Task<Unit> Handle(CloseEscalationCommand request, CancellationToken cancellationToken)
    {
        var e = await db.EscalationCases.FirstOrDefaultAsync(x => x.Id == request.EscalationCaseId, cancellationToken)
            ?? throw new NotFoundException("ملف التصعيد", request.EscalationCaseId);
        e.Close(access.UserId);
        await db.SaveChangesAsync(cancellationToken);
        return Unit.Value;
    }
}

[RequireRoles(SanadRoles.Coordinator, RequireMfa = true)]
public sealed record GetEscalationCasesQuery(bool OpenOnly = true) : IQuery<IReadOnlyList<EscalationCaseDto>>;

public sealed class GetEscalationCasesQueryHandler(IApplicationDbContext db) : IRequestHandler<GetEscalationCasesQuery, IReadOnlyList<EscalationCaseDto>>
{
    public async Task<IReadOnlyList<EscalationCaseDto>> Handle(GetEscalationCasesQuery request, CancellationToken cancellationToken)
    {
        var q = db.EscalationCases.AsNoTracking();
        if (request.OpenOnly) q = q.Where(e => e.IsOpen);
        return (await q.ToListAsync(cancellationToken)).OrderByDescending(e => e.Level).Select(ReportMapping.ToDto).ToList();
    }
}

/// <summary>
/// يطبّق أثر مستوى التصعيد: تقييد المحادثات، تعليق الملف المهني، والإحالة التنظيمية.
/// </summary>
public sealed class EscalationService(IApplicationDbContext db, IDateTime clock, IDirectorySearchCache cache)
{
    public async Task<EscalationCase> RecomputeAsync(Guid subjectAccountId, Guid? reviewedByCoordinatorId, CancellationToken ct)
    {
        var now = clock.UtcNow;
        var windowStart = now - EscalationCase.CountingWindow;
        var documented = (await db.Reports.Where(r => r.EscalationSubjectId == subjectAccountId && r.IsSubstantiated == true).ToListAsync(ct))
            .Where(r => r.ReviewedAtUtc >= windowStart).ToList();

        var esc = await db.EscalationCases.FirstOrDefaultAsync(e => e.SubjectAccountId == subjectAccountId && e.IsOpen, ct);
        if (esc is null)
        {
            esc = EscalationCase.Open(subjectAccountId);
            db.EscalationCases.Add(esc);
        }

        var severe = documented.Any(r => r.Severity == ReportSeverity.Critical);
        var crime = documented.Any(r => r.InvolvesPossibleCrimeOrMinorRisk);
        esc.Recompute(documented.Count, severe, crime, reviewedByCoordinatorId, now);

        await ApplyEffectsAsync(esc, ct);
        await db.SaveChangesAsync(ct);
        return esc;
    }

    private async Task ApplyEffectsAsync(EscalationCase esc, CancellationToken ct)
    {
        var subject = esc.SubjectAccountId;
        if (esc.Level >= EscalationLevel.Restriction)
        {
            var conversations = await db.Conversations.Where(c => c.Members.Any(m => m.UserId == subject) && c.Status == ConversationStatus.Active).ToListAsync(ct);
            foreach (var c in conversations) c.ChangeStatus(ConversationStatus.Restricted);
        }
        if (esc.Level >= EscalationLevel.Suspension)
        {
            var profile = await db.ProviderProfiles.FirstOrDefaultAsync(p => p.UserId == subject && p.Status != PublicationStatus.Suspended, ct);
            profile?.Suspend(esc.Level == EscalationLevel.RegulatoryReferral ? "regulatory_referral" : "escalation_suspension");
            var org = await db.Organizations.FirstOrDefaultAsync(o => o.Id == subject && o.Status != PublicationStatus.Suspended, ct);
            org?.Suspend("escalation_suspension");
            await cache.InvalidateAsync(CacheKeys.DirectoryPrefix, ct);
        }
    }
}
