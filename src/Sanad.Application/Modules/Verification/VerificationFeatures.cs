using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sanad.Application.Common.Access;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Common.Messaging;
using Sanad.Domain.Common;
using Sanad.Domain.Directory;
using Sanad.Domain.Exceptions;
using Sanad.Domain.Identity;
using Sanad.Domain.Verification;

namespace Sanad.Application.Modules.Verification;

public sealed record VerificationSummaryDto(Guid Id, string SubjectType, Guid SubjectId, string? DeclaredPractitionerType, string? DeclaredTitle,
    string DocumentType, string IssuingAuthority, string Status, string? RejectionReason, DateTimeOffset SubmittedAtUtc,
    DateTimeOffset? LastCheckedAtUtc, DateTimeOffset? ExpiresAtUtc)
{
    public static VerificationSummaryDto From(VerificationRecord v) => new(v.Id, v.SubjectType.ToString(), v.SubjectId,
        v.DeclaredPractitionerType?.ToString(), v.DeclaredTitle, v.DocumentType, v.IssuingAuthority, v.Status.ToString(),
        v.RejectionReason?.ToString(), v.SubmittedAtUtc, v.LastCheckedAtUtc, v.ExpiresAtUtc);
}

/// <summary>عنصر قائمة المراجعة للمنسق — يُظهر صراحة هل نوع المستند يطابق النوع المُعلَن.</summary>
public sealed record VerificationQueueItemDto(VerificationSummaryDto Verification, string? ApplicantDisplayName, bool DocumentMatchesDeclaredType,
    bool HasDocument, string? OrganizationName);

// ── طلب الترقية: المستخدم يختار نوعه صراحة (طبيب مرخّص / شيخ-راقٍ شرعي) ─────────────
public sealed record RequestProviderUpgradeCommand(PractitionerType RequestedType, string DeclaredTitle, string DocumentType,
    string IssuingAuthority, Guid UploadedDocumentFileId) : ICommand<VerificationSummaryDto>;

public sealed class RequestProviderUpgradeCommandValidator : AbstractValidator<RequestProviderUpgradeCommand>
{
    public RequestProviderUpgradeCommandValidator()
    {
        RuleFor(x => x.RequestedType).IsInEnum();
        RuleFor(x => x.DeclaredTitle).NotEmpty().MaximumLength(200);
        RuleFor(x => x.DocumentType).NotEmpty().Must(VerificationDocumentTypes.IsKnownPractitionerDocument)
            .WithMessage("نوع المستند غير مدرج في القائمة المسموحة.");
        RuleFor(x => x.IssuingAuthority).NotEmpty().MaximumLength(200);
        RuleFor(x => x.UploadedDocumentFileId).NotEmpty();
    }
}

public sealed class RequestProviderUpgradeCommandHandler(IApplicationDbContext db, AccessContext access, IDateTime clock, IContentPolicyChecker policy)
    : IRequestHandler<RequestProviderUpgradeCommand, VerificationSummaryDto>
{
    public async Task<VerificationSummaryDto> Handle(RequestProviderUpgradeCommand request, CancellationToken cancellationToken)
    {
        var userId = access.UserId;
        if (access.IsInRole(SanadRoles.Practitioner) || await db.ProviderProfiles.AnyAsync(p => p.UserId == userId, cancellationToken))
            throw new ConflictException("حسابك مقدّم خدمة موثّق بالفعل.");
        if (await db.VerificationRecords.AnyAsync(v => v.ApplicantUserId == userId &&
                (v.Status == VerificationStatus.PendingReview || v.Status == VerificationStatus.RequiresCompletion), cancellationToken))
            throw new ConflictException("لديك طلب ترقية قيد المراجعة بالفعل.");

        await EnsureOwnedDocumentAsync(db, userId, request.UploadedDocumentFileId, cancellationToken);
        ContentPolicy.EnsureAllowed(policy, "اللقب المهني", request.DeclaredTitle);

        // لا تغيير في الدور هنا إطلاقاً — الدور يتغيّر فقط بعد اعتماد المنسق
        var record = VerificationRecord.RequestProviderUpgrade(userId, request.RequestedType, request.DeclaredTitle,
            request.DocumentType, request.IssuingAuthority, request.UploadedDocumentFileId, clock.UtcNow);
        db.VerificationRecords.Add(record);
        await db.SaveChangesAsync(cancellationToken);
        return VerificationSummaryDto.From(record);
    }

    internal static async Task EnsureOwnedDocumentAsync(IApplicationDbContext db, Guid userId, Guid fileId, CancellationToken ct)
    {
        var file = await db.StoredFiles.AsNoTracking().FirstOrDefaultAsync(f => f.Id == fileId, ct);
        if (file is null || file.OwnerUserId != userId || file.Purpose != StoredFilePurpose.VerificationDocument)
            throw new RequestValidationException("uploadedDocumentFileId", "المستند غير موجود أو لا يخصك.");
        if (await db.VerificationRecords.AnyAsync(v => v.DocumentFileId == fileId, ct))
            throw new RequestValidationException("uploadedDocumentFileId", "هذا المستند مستخدم في طلب سابق — ارفع نسخة جديدة.");
    }
}

public sealed record GetMyUpgradeRequestsQuery : IQuery<IReadOnlyList<VerificationSummaryDto>>;

public sealed class GetMyUpgradeRequestsQueryHandler(IApplicationDbContext db, AccessContext access)
    : IRequestHandler<GetMyUpgradeRequestsQuery, IReadOnlyList<VerificationSummaryDto>>
{
    public async Task<IReadOnlyList<VerificationSummaryDto>> Handle(GetMyUpgradeRequestsQuery request, CancellationToken cancellationToken) =>
        (await db.VerificationRecords.AsNoTracking().Where(v => v.ApplicantUserId == access.UserId)
            .OrderByDescending(v => v.SubmittedAtUtc).ToListAsync(cancellationToken)).Select(VerificationSummaryDto.From).ToList();
}

public sealed record ResubmitUpgradeDocumentCommand(Guid VerificationId, string DocumentType, Guid UploadedDocumentFileId) : ICommand<VerificationSummaryDto>;

public sealed class ResubmitUpgradeDocumentCommandHandler(IApplicationDbContext db, AccessContext access, IDateTime clock)
    : IRequestHandler<ResubmitUpgradeDocumentCommand, VerificationSummaryDto>
{
    public async Task<VerificationSummaryDto> Handle(ResubmitUpgradeDocumentCommand request, CancellationToken cancellationToken)
    {
        var record = await db.VerificationRecords.FirstOrDefaultAsync(v => v.Id == request.VerificationId && v.ApplicantUserId == access.UserId, cancellationToken)
            ?? throw new NotFoundException("طلب الترقية", request.VerificationId);
        await RequestProviderUpgradeCommandHandler.EnsureOwnedDocumentAsync(db, access.UserId, request.UploadedDocumentFileId, cancellationToken);
        record.Resubmit(access.UserId, request.DocumentType, request.UploadedDocumentFileId, clock.UtcNow);
        await db.SaveChangesAsync(cancellationToken);
        return VerificationSummaryDto.From(record);
    }
}

// ── قائمة المراجعة (Coordinator + 2FA) ─────────────────────────────────────────
[RequireRoles(SanadRoles.Coordinator, RequireMfa = true)]
public sealed record GetVerificationQueueQuery(VerificationStatus? Status) : IQuery<IReadOnlyList<VerificationQueueItemDto>>;

public sealed class GetVerificationQueueQueryHandler(IApplicationDbContext db, IIdentityService identity)
    : IRequestHandler<GetVerificationQueueQuery, IReadOnlyList<VerificationQueueItemDto>>
{
    public async Task<IReadOnlyList<VerificationQueueItemDto>> Handle(GetVerificationQueueQuery request, CancellationToken cancellationToken)
    {
        var query = db.VerificationRecords.AsNoTracking();
        query = request.Status is { } s
            ? query.Where(v => v.Status == s)
            : query.Where(v => v.Status == VerificationStatus.PendingReview || v.Status == VerificationStatus.RequiresCompletion);
        var records = await query.OrderBy(v => v.SubmittedAtUtc).Take(200).ToListAsync(cancellationToken);

        var names = await identity.GetDisplayNamesAsync(records.Where(r => r.ApplicantUserId != null).Select(r => r.ApplicantUserId!.Value), cancellationToken);
        var orgIds = records.Where(r => r.SubjectType == VerificationSubjectType.Organization).Select(r => r.SubjectId).ToList();
        var orgs = await db.Organizations.AsNoTracking().Where(o => orgIds.Contains(o.Id)).ToDictionaryAsync(o => o.Id, o => o.DisplayName, cancellationToken);

        return records.Select(r => new VerificationQueueItemDto(VerificationSummaryDto.From(r),
            r.ApplicantUserId is { } uid && names.TryGetValue(uid, out var n) ? n : null,
            r.DocumentMatchesDeclaredType(), r.DocumentFileId is not null,
            orgs.TryGetValue(r.SubjectId, out var on) ? on : null)).ToList();
    }
}

public sealed record DocumentLinkDto(string Url, DateTimeOffset ExpiresAtUtc);

/// <summary>رابط موقّع قصير الأجل لمستند التوثيق — كل وصول يُسجَّل في التدقيق.</summary>
[RequireRoles(SanadRoles.Coordinator, RequireMfa = true)]
public sealed record GetVerificationDocumentLinkQuery(Guid VerificationId) : IQuery<DocumentLinkDto>;

public sealed class GetVerificationDocumentLinkQueryHandler(IApplicationDbContext db, IFileStorage storage, IDateTime clock, IAuditLogger audit)
    : IRequestHandler<GetVerificationDocumentLinkQuery, DocumentLinkDto>
{
    private static readonly TimeSpan Ttl = TimeSpan.FromMinutes(5);

    public async Task<DocumentLinkDto> Handle(GetVerificationDocumentLinkQuery request, CancellationToken cancellationToken)
    {
        var record = await db.VerificationRecords.AsNoTracking().FirstOrDefaultAsync(v => v.Id == request.VerificationId, cancellationToken)
            ?? throw new NotFoundException("طلب التوثيق", request.VerificationId);
        var fileId = record.DocumentFileId ?? throw new NotFoundException("المستند", request.VerificationId);
        var file = await db.StoredFiles.AsNoTracking().FirstAsync(f => f.Id == fileId, cancellationToken);
        await audit.LogAsync("Verification.DocumentAccessed", nameof(VerificationRecord), record.Id, ct: cancellationToken);
        return new DocumentLinkDto(storage.GenerateShortLivedDownloadUrl(file.StorageKey, Ttl), clock.UtcNow.Add(Ttl));
    }
}

public enum VerificationDecision { Approve, ConditionallyApprove, Reject, RequireCompletion }

public sealed record ReviewVerificationResultDto(VerificationSummaryDto Verification, bool AutoRejectedForDocumentMismatch, Guid? CreatedProviderProfileId);

/// <summary>
/// مراجعة المنسق. عند الاعتماد: يُتحقق أولاً من تطابق نوع المستند مع النوع المُعلَن — عدم التطابق يعني رفضاً فورياً
/// بسبب DocumentTypeMismatch، لا اعتماداً شرطياً. الاعتماد يمنح دور Practitioner وينشئ ملفاً (مسودة).
/// </summary>
[RequireRoles(SanadRoles.Coordinator, RequireMfa = true)]
public sealed record ReviewVerificationCommand(Guid VerificationId, VerificationDecision Decision, VerificationRejectionReason? RejectionReason,
    DateTimeOffset? ExpiresAtUtc) : ICommand<ReviewVerificationResultDto>;

public sealed class ReviewVerificationCommandValidator : AbstractValidator<ReviewVerificationCommand>
{
    public ReviewVerificationCommandValidator()
    {
        RuleFor(x => x.VerificationId).NotEmpty();
        RuleFor(x => x.Decision).IsInEnum();
        RuleFor(x => x.RejectionReason).NotNull().IsInEnum().When(x => x.Decision == VerificationDecision.Reject)
            .WithMessage("سبب الرفض مطلوب.");
        RuleFor(x => x.ExpiresAtUtc).NotNull()
            .When(x => x.Decision is VerificationDecision.Approve or VerificationDecision.ConditionallyApprove)
            .WithMessage("تاريخ انتهاء التوثيق مطلوب عند الاعتماد.");
    }
}

public sealed class ReviewVerificationCommandHandler(IApplicationDbContext db, IIdentityService identity, AccessContext access,
    IDateTime clock, IDirectorySearchCache cache)
    : IRequestHandler<ReviewVerificationCommand, ReviewVerificationResultDto>
{
    public async Task<ReviewVerificationResultDto> Handle(ReviewVerificationCommand request, CancellationToken cancellationToken)
    {
        var record = await db.VerificationRecords.FirstOrDefaultAsync(v => v.Id == request.VerificationId, cancellationToken)
            ?? throw new NotFoundException("طلب التوثيق", request.VerificationId);
        var coordinatorId = access.UserId;
        var now = clock.UtcNow;
        if (record.ApplicantUserId == coordinatorId) throw new ForbiddenAccessException("لا يراجع المنسق طلبه الشخصي.");

        switch (request.Decision)
        {
            case VerificationDecision.Approve or VerificationDecision.ConditionallyApprove when !record.DocumentMatchesDeclaredType():
                record.Reject(coordinatorId, VerificationRejectionReason.DocumentTypeMismatch, now);
                await db.SaveChangesAsync(cancellationToken);
                return new ReviewVerificationResultDto(VerificationSummaryDto.From(record), true, null);

            case VerificationDecision.Approve or VerificationDecision.ConditionallyApprove:
                record.Approve(coordinatorId, request.Decision == VerificationDecision.ConditionallyApprove, request.ExpiresAtUtc!.Value, now);
                Guid? profileId = null;
                if (record.SubjectType == VerificationSubjectType.ProviderProfile)
                    profileId = await ApplyProviderApprovalAsync(record, coordinatorId, now, cancellationToken);
                await db.SaveChangesAsync(cancellationToken);
                await cache.InvalidateAsync(CacheKeys.DirectoryPrefix, cancellationToken);
                return new ReviewVerificationResultDto(VerificationSummaryDto.From(record), false, profileId);

            case VerificationDecision.Reject:
                record.Reject(coordinatorId, request.RejectionReason!.Value, now);
                break;

            case VerificationDecision.RequireCompletion:
                record.RequireCompletion(coordinatorId, now);
                break;
        }
        await db.SaveChangesAsync(cancellationToken);
        return new ReviewVerificationResultDto(VerificationSummaryDto.From(record), false, null);
    }

    private async Task<Guid> ApplyProviderApprovalAsync(VerificationRecord record, Guid coordinatorId, DateTimeOffset now, CancellationToken ct)
    {
        var applicantId = record.ApplicantUserId ?? throw new DomainException("طلب بلا مقدّم.");
        var existing = await db.ProviderProfiles.FirstOrDefaultAsync(p => p.UserId == applicantId, ct);
        if (existing is null)
        {
            var user = await identity.GetUserAsync(applicantId, ct) ?? throw new NotFoundException("المستخدم", applicantId);
            existing = ProviderProfile.CreateFromApprovedUpgrade(record, user.DisplayName, now);
            db.ProviderProfiles.Add(existing);
        }
        else
        {
            existing.ReplaceVerification(record);
        }
        await db.SaveChangesAsync(ct);
        await identity.AssignRoleAsync(applicantId, SanadRole.Practitioner, coordinatorId, ct);
        return existing.Id;
    }
}

/// <summary>إعادة تحقق دورية. عدم السريان يعلّق التوثيق ويعلّق الملف/الجهة المنشورة فوراً.</summary>
[RequireRoles(SanadRoles.Coordinator, RequireMfa = true)]
public sealed record RecheckVerificationCommand(Guid VerificationId, bool StillValid, DateTimeOffset? NewExpiresAtUtc) : ICommand<VerificationSummaryDto>;

public sealed class RecheckVerificationCommandHandler(IApplicationDbContext db, AccessContext access, IDateTime clock, IDirectorySearchCache cache)
    : IRequestHandler<RecheckVerificationCommand, VerificationSummaryDto>
{
    public async Task<VerificationSummaryDto> Handle(RecheckVerificationCommand request, CancellationToken cancellationToken)
    {
        var record = await db.VerificationRecords.FirstOrDefaultAsync(v => v.Id == request.VerificationId, cancellationToken)
            ?? throw new NotFoundException("طلب التوثيق", request.VerificationId);
        record.Recheck(access.UserId, request.StillValid, request.NewExpiresAtUtc, clock.UtcNow);
        if (!request.StillValid)
        {
            var profile = await db.ProviderProfiles.FirstOrDefaultAsync(p => p.Id == record.SubjectId, cancellationToken);
            if (profile is { Status: not PublicationStatus.Suspended }) profile.Suspend("verification_invalid");
            var org = await db.Organizations.FirstOrDefaultAsync(o => o.Id == record.SubjectId, cancellationToken);
            if (org is { Status: not PublicationStatus.Suspended }) org.Suspend("verification_invalid");
        }
        await db.SaveChangesAsync(cancellationToken);
        await cache.InvalidateAsync(CacheKeys.DirectoryPrefix, cancellationToken);
        return VerificationSummaryDto.From(record);
    }
}

[RequireRoles(SanadRoles.Coordinator, RequireMfa = true)]
public sealed record GetVerificationHistoryQuery(Guid SubjectId) : IQuery<IReadOnlyList<VerificationSummaryDto>>;

public sealed class GetVerificationHistoryQueryHandler(IApplicationDbContext db) : IRequestHandler<GetVerificationHistoryQuery, IReadOnlyList<VerificationSummaryDto>>
{
    public async Task<IReadOnlyList<VerificationSummaryDto>> Handle(GetVerificationHistoryQuery request, CancellationToken cancellationToken) =>
        (await db.VerificationRecords.AsNoTracking().Where(v => v.SubjectId == request.SubjectId).OrderByDescending(v => v.SubmittedAtUtc)
            .ToListAsync(cancellationToken)).Select(VerificationSummaryDto.From).ToList();
}

// ── تعليق/رفع تعليق ملف مختص ────────────────────────────────────────────────────
[RequireRoles(SanadRoles.Coordinator, RequireMfa = true)]
public sealed record SuspendProfileCommand(Guid ProviderProfileId, string ReasonCode) : ICommand<Unit>;

public sealed class SuspendProfileCommandValidator : AbstractValidator<SuspendProfileCommand>
{
    public SuspendProfileCommandValidator() => RuleFor(x => x.ReasonCode).NotEmpty().MaximumLength(100);
}

public sealed class SuspendProfileCommandHandler(IApplicationDbContext db, IDirectorySearchCache cache) : IRequestHandler<SuspendProfileCommand, Unit>
{
    public async Task<Unit> Handle(SuspendProfileCommand request, CancellationToken cancellationToken)
    {
        var profile = await db.ProviderProfiles.FirstOrDefaultAsync(p => p.Id == request.ProviderProfileId, cancellationToken)
            ?? throw new NotFoundException("مقدّم الخدمة", request.ProviderProfileId);
        profile.Suspend(request.ReasonCode);
        await db.SaveChangesAsync(cancellationToken);
        await cache.InvalidateAsync(CacheKeys.DirectoryPrefix, cancellationToken);
        return Unit.Value;
    }
}

[RequireRoles(SanadRoles.Coordinator, RequireMfa = true)]
public sealed record LiftProfileSuspensionCommand(Guid ProviderProfileId) : ICommand<Unit>;

public sealed class LiftProfileSuspensionCommandHandler(IApplicationDbContext db) : IRequestHandler<LiftProfileSuspensionCommand, Unit>
{
    public async Task<Unit> Handle(LiftProfileSuspensionCommand request, CancellationToken cancellationToken)
    {
        var profile = await db.ProviderProfiles.FirstOrDefaultAsync(p => p.Id == request.ProviderProfileId, cancellationToken)
            ?? throw new NotFoundException("مقدّم الخدمة", request.ProviderProfileId);
        profile.LiftSuspension();
        await db.SaveChangesAsync(cancellationToken);
        return Unit.Value;
    }
}

public sealed record ProviderAdminDto(Guid Id, Guid UserId, string DisplayName, string PractitionerType, string Status, string? SuspensionReasonCode, Guid? OrganizationId);

[RequireRoles(SanadRoles.Coordinator, RequireMfa = true)]
public sealed record ListProvidersForAdminQuery : IQuery<IReadOnlyList<ProviderAdminDto>>;

public sealed class ListProvidersForAdminQueryHandler(IApplicationDbContext db) : IRequestHandler<ListProvidersForAdminQuery, IReadOnlyList<ProviderAdminDto>>
{
    public async Task<IReadOnlyList<ProviderAdminDto>> Handle(ListProvidersForAdminQuery request, CancellationToken cancellationToken) =>
        (await db.ProviderProfiles.AsNoTracking().OrderBy(p => p.DisplayName).Take(500).ToListAsync(cancellationToken))
            .Select(p => new ProviderAdminDto(p.Id, p.UserId, p.DisplayName, p.Type.ToString(), p.Status.ToString(), p.SuspensionReasonCode, p.OrganizationId))
            .ToList();
}
