using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sanad.Application.Common.Access;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Common.Messaging;
using Sanad.Domain.Audit;
using Sanad.Domain.Common;
using Sanad.Domain.Consent;
using Sanad.Domain.Directory;
using Sanad.Domain.Identity;
using Sanad.Domain.Verification;

namespace Sanad.Application.Modules.Accounts;

public sealed record MyProfileDto(Guid Id, string? Email, bool EmailConfirmed, string? PhoneNumber, string DisplayName, IReadOnlyList<string> Roles,
    bool TwoFactorEnabled, Guid? ProviderProfileId, string? ProviderProfileStatus, string? PractitionerType,
    IReadOnlyList<string> ActiveConsents, bool HasPendingUpgradeRequest, bool HideIdentityUntilBookingConfirmed,
    int? QuietHoursStartHourUtc, int? QuietHoursEndHourUtc);

public sealed record GetMyProfileQuery : IQuery<MyProfileDto>;

public sealed class GetMyProfileQueryHandler(IIdentityService identity, IApplicationDbContext db, AccessContext access)
    : IRequestHandler<GetMyProfileQuery, MyProfileDto>
{
    public async Task<MyProfileDto> Handle(GetMyProfileQuery request, CancellationToken cancellationToken)
    {
        var user = await identity.GetUserAsync(access.UserId, cancellationToken) ?? throw new UnauthenticatedException();
        var provider = await db.ProviderProfiles.AsNoTracking().FirstOrDefaultAsync(p => p.UserId == user.Id, cancellationToken);
        var consents = await db.ConsentRecords.AsNoTracking()
            .Where(c => c.UserId == user.Id && c.RevokedAtUtc == null).Select(c => c.Type).Distinct().ToListAsync(cancellationToken);
        var pending = await db.VerificationRecords.AnyAsync(v => v.ApplicantUserId == user.Id &&
            (v.Status == VerificationStatus.PendingReview || v.Status == VerificationStatus.RequiresCompletion), cancellationToken);

        return new MyProfileDto(user.Id, user.Email, user.EmailConfirmed, user.PhoneNumber, user.DisplayName, user.Roles, user.TwoFactorEnabled,
            provider?.Id, provider?.Status.ToString(), provider?.Type.ToString(),
            consents.Select(c => c.ToString()).ToList(), pending, user.HideIdentityUntilBookingConfirmed,
            user.QuietHoursStartHourUtc, user.QuietHoursEndHourUtc);
    }
}

public sealed record UpdateMyProfileCommand(string DisplayName) : ICommand<Unit>;

public sealed class UpdateMyProfileCommandValidator : AbstractValidator<UpdateMyProfileCommand>
{
    public UpdateMyProfileCommandValidator() => RuleFor(x => x.DisplayName).NotEmpty().MaximumLength(100);
}

public sealed class UpdateMyProfileCommandHandler(IIdentityService identity, AccessContext access) : IRequestHandler<UpdateMyProfileCommand, Unit>
{
    public async Task<Unit> Handle(UpdateMyProfileCommand request, CancellationToken cancellationToken)
    {
        await identity.UpdateDisplayNameAsync(access.UserId, request.DisplayName.Trim(), cancellationToken);
        return Unit.Value;
    }
}

// ── تفضيلات الخصوصية والإشعارات ──────────────────────────────────────────────────
public sealed record UpdatePrivacyPreferencesCommand(bool HideIdentityUntilBookingConfirmed,
    int? QuietHoursStartHourUtc, int? QuietHoursEndHourUtc) : ICommand<Unit>;

public sealed class UpdatePrivacyPreferencesCommandValidator : AbstractValidator<UpdatePrivacyPreferencesCommand>
{
    public UpdatePrivacyPreferencesCommandValidator()
    {
        RuleFor(x => x.QuietHoursStartHourUtc).InclusiveBetween(0, 23).When(x => x.QuietHoursStartHourUtc is not null);
        RuleFor(x => x.QuietHoursEndHourUtc).InclusiveBetween(0, 23).When(x => x.QuietHoursEndHourUtc is not null);
        RuleFor(x => x).Must(x => (x.QuietHoursStartHourUtc is null) == (x.QuietHoursEndHourUtc is null))
            .WithMessage("حدّد بداية ونهاية ساعات الهدوء معاً، أو اتركهما فارغتين.");
    }
}

public sealed class UpdatePrivacyPreferencesCommandHandler(IIdentityService identity, AccessContext access) : IRequestHandler<UpdatePrivacyPreferencesCommand, Unit>
{
    public async Task<Unit> Handle(UpdatePrivacyPreferencesCommand request, CancellationToken cancellationToken)
    {
        await identity.UpdatePrivacyPreferencesAsync(access.UserId, request.HideIdentityUntilBookingConfirmed,
            request.QuietHoursStartHourUtc, request.QuietHoursEndHourUtc, cancellationToken);
        return Unit.Value;
    }
}

// ── الشفافية: من اطّلع على بياناتي؟ (بلا كشف هوية الفاعل، دور فقط) ─────────────────
public sealed record AccessLogEntryDto(DateTimeOffset OccurredAtUtc, string Action, string ActorRole, Guid? BookingRequestId);

public sealed record GetMyAccessLogQuery : IQuery<IReadOnlyList<AccessLogEntryDto>>;

public sealed class GetMyAccessLogQueryHandler(IApplicationDbContext db, AccessContext access) : IRequestHandler<GetMyAccessLogQuery, IReadOnlyList<AccessLogEntryDto>>
{
    private static readonly string[] TrackedActions = ["Scheduling.BeneficiaryNoteRead", "PatientCare.CaseNoteSupervisoryRead"];

    public async Task<IReadOnlyList<AccessLogEntryDto>> Handle(GetMyAccessLogQuery request, CancellationToken cancellationToken)
    {
        var myBookingIds = await db.BookingRequests.AsNoTracking().Where(b => b.BeneficiaryUserId == access.UserId)
            .Select(b => b.Id).ToListAsync(cancellationToken);
        if (myBookingIds.Count == 0) return [];

        var entries = await db.AuditLogEntries.AsNoTracking()
            .Where(a => a.EntityId != null && myBookingIds.Contains(a.EntityId.Value) && TrackedActions.Contains(a.Action))
            .OrderByDescending(a => a.OccurredAtUtc).Take(200).ToListAsync(cancellationToken);

        return entries.Select(a => new AccessLogEntryDto(a.OccurredAtUtc, a.Action, ExtractActorRole(a.MetadataJson), a.EntityId)).ToList();
    }

    private static string ExtractActorRole(string? metadataJson)
    {
        if (metadataJson is null) return "غير معروف";
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(metadataJson);
            if (doc.RootElement.TryGetProperty("Via", out var via)) return via.GetString() ?? "غير معروف";
        }
        catch (System.Text.Json.JsonException) { /* تجاهل بيانات وصفية غير متوقعة */ }
        return "غير معروف";
    }
}

// ── إدارة الأدوار: SystemAdmin فقط، بجلسة 2FA ───────────────────────────────────
[RequireRoles(SanadRoles.SystemAdmin, RequireMfa = true)]
public sealed record AssignRoleCommand(Guid UserId, SanadRole Role) : ICommand<Unit>;

public sealed class AssignRoleCommandValidator : AbstractValidator<AssignRoleCommand>
{
    public AssignRoleCommandValidator()
    {
        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.Role).IsInEnum()
            .Must(r => SanadRoles.AssignableByAdmin.Contains(r))
            .WithMessage("هذا الدور لا يُمنح من واجهة الإدارة (SystemAdmin عبر Bootstrap فقط، وPractitioner عبر اعتماد الترقية فقط).");
    }
}

public sealed class AssignRoleCommandHandler(IIdentityService identity, AccessContext access) : IRequestHandler<AssignRoleCommand, Unit>
{
    public async Task<Unit> Handle(AssignRoleCommand request, CancellationToken cancellationToken)
    {
        if (request.UserId == access.UserId) throw new ForbiddenAccessException("لا يمكن منح دور لنفسك.");
        await identity.AssignRoleAsync(request.UserId, request.Role, access.UserId, cancellationToken);
        return Unit.Value;
    }
}

[RequireRoles(SanadRoles.SystemAdmin, RequireMfa = true)]
public sealed record RemoveRoleCommand(Guid UserId, SanadRole Role) : ICommand<Unit>;

public sealed class RemoveRoleCommandValidator : AbstractValidator<RemoveRoleCommand>
{
    public RemoveRoleCommandValidator()
    {
        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.Role).IsInEnum().Must(r => SanadRoles.AssignableByAdmin.Contains(r))
            .WithMessage("هذا الدور لا يُسحب من واجهة الإدارة.");
    }
}

public sealed class RemoveRoleCommandHandler(IIdentityService identity, AccessContext access) : IRequestHandler<RemoveRoleCommand, Unit>
{
    public async Task<Unit> Handle(RemoveRoleCommand request, CancellationToken cancellationToken)
    {
        if (request.UserId == access.UserId) throw new ForbiddenAccessException("لا يمكن سحب دور من نفسك.");
        await identity.RemoveRoleAsync(request.UserId, request.Role, access.UserId, cancellationToken);
        return Unit.Value;
    }
}

[RequireRoles(SanadRoles.SystemAdmin, RequireMfa = true)]
public sealed record SearchUsersQuery(string? Search, int? Page, int? PageSize) : IQuery<UserPage>;

public sealed class SearchUsersQueryHandler(IIdentityService identity) : IRequestHandler<SearchUsersQuery, UserPage>
{
    public Task<UserPage> Handle(SearchUsersQuery request, CancellationToken cancellationToken)
    {
        var (page, size) = Common.Models.Paging.Normalize(request.Page, request.PageSize);
        return identity.SearchUsersAsync(request.Search?.Trim(), page, size, cancellationToken);
    }
}

// ── حذف الحساب: تجريد لا حذف للسجلات المرتبطة (ADR-0005) ─────────────────────────
public sealed record DeleteMyAccountCommand(string Confirmation) : ICommand<Unit>;

public sealed class DeleteMyAccountCommandValidator : AbstractValidator<DeleteMyAccountCommand>
{
    public const string ConfirmationPhrase = "احذف حسابي";

    public DeleteMyAccountCommandValidator() =>
        RuleFor(x => x.Confirmation).Equal(ConfirmationPhrase).WithMessage($"اكتب «{ConfirmationPhrase}» للتأكيد.");
}

public sealed class DeleteMyAccountCommandHandler(IApplicationDbContext db, IIdentityService identity, AccessContext access,
    IFieldEncryptor encryptor, IDirectorySearchCache cache)
    : IRequestHandler<DeleteMyAccountCommand, Unit>
{
    public async Task<Unit> Handle(DeleteMyAccountCommand request, CancellationToken cancellationToken)
    {
        var userId = access.UserId;
        var anon = AuditLogEntry.AnonymizedActorId;
        var redacted = encryptor.Encrypt("[حُذف هذا المحتوى بطلب صاحبه]");

        if (access.IsInRole(SanadRoles.SystemAdmin))
            throw new ForbiddenAccessException("لا يُحذف حساب مدير النظام من التطبيق — يلزم إجراء إداري موثَّق.");

        foreach (var b in await db.BookingRequests.Where(b => b.BeneficiaryUserId == userId).ToListAsync(cancellationToken))
            b.AnonymizeBeneficiary(anon);
        foreach (var r in await db.ProviderRecommendations.Where(r => r.RecipientBeneficiaryUserId == userId).ToListAsync(cancellationToken))
            r.AnonymizeRecipient(anon, redacted);
        foreach (var m in await db.Messages.Where(m => m.SenderUserId == userId).ToListAsync(cancellationToken))
            m.AnonymizeSender(anon, redacted);
        foreach (var c in await db.Conversations.Where(c => c.Members.Any(m => m.UserId == userId)).ToListAsync(cancellationToken))
            c.ReplaceMember(userId, anon);
        foreach (var rep in await db.Reports.Where(r => r.ReporterUserId == userId).ToListAsync(cancellationToken))
            rep.AnonymizeReporter(anon);
        foreach (var consent in await db.ConsentRecords.Where(c => c.UserId == userId).ToListAsync(cancellationToken))
            consent.AnonymizeUser(anon);
        foreach (var link in await db.SharedContentLinks.Where(l => l.CreatedByUserId == userId).ToListAsync(cancellationToken))
            link.DetachCreator();
        foreach (var entry in await db.AuditLogEntries.Where(a => a.ActorUserId == userId).ToListAsync(cancellationToken))
            entry.AnonymizeActor();
        db.UserFavoriteTracks.RemoveRange(await db.UserFavoriteTracks.Where(f => f.UserId == userId).ToListAsync(cancellationToken));
        db.DailyWirdProgress.RemoveRange(await db.DailyWirdProgress.Where(p => p.UserId == userId).ToListAsync(cancellationToken));
        db.ReminderDevices.RemoveRange(await db.ReminderDevices.Where(d => d.UserId == userId).ToListAsync(cancellationToken));

        var provider = await db.ProviderProfiles.FirstOrDefaultAsync(p => p.UserId == userId, cancellationToken);
        if (provider is not null && provider.Status != PublicationStatus.Suspended)
        {
            provider.Suspend("account_deleted");
            await cache.InvalidateAsync(CacheKeys.DirectoryPrefix, cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);
        await identity.DeletePersonalDataAsync(userId, cancellationToken);
        return Unit.Value;
    }
}

// ── تصدير بياناتي ──────────────────────────────────────────────────────────────
public sealed record MyDataExportDto(object Account, IReadOnlyList<object> Consents, IReadOnlyList<object> Bookings,
    IReadOnlyList<object> RecommendationsReceived, IReadOnlyList<object> MessagesSent, IReadOnlyList<object> Favorites,
    IReadOnlyList<object> ReportsSubmitted, IReadOnlyList<object> WirdProgress,
    IReadOnlyList<object> ReminderDevices, DateTimeOffset GeneratedAtUtc);

public sealed record ExportMyDataQuery : IQuery<MyDataExportDto>, ISensitiveRequest;

public sealed class ExportMyDataQueryHandler(IApplicationDbContext db, IIdentityService identity, AccessContext access,
    IFieldEncryptor encryptor, IDateTime clock, IAuditLogger audit)
    : IRequestHandler<ExportMyDataQuery, MyDataExportDto>
{
    public async Task<MyDataExportDto> Handle(ExportMyDataQuery request, CancellationToken cancellationToken)
    {
        var userId = access.UserId;
        var user = await identity.GetUserAsync(userId, cancellationToken) ?? throw new UnauthenticatedException();

        var consents = await db.ConsentRecords.AsNoTracking().Where(c => c.UserId == userId).ToListAsync(cancellationToken);
        var bookings = await db.BookingRequests.AsNoTracking().Where(b => b.BeneficiaryUserId == userId).ToListAsync(cancellationToken);
        var recs = await db.ProviderRecommendations.AsNoTracking().Where(r => r.RecipientBeneficiaryUserId == userId).ToListAsync(cancellationToken);
        var messages = await db.Messages.AsNoTracking().Where(m => m.SenderUserId == userId).ToListAsync(cancellationToken);
        var favorites = await db.UserFavoriteTracks.AsNoTracking().Where(f => f.UserId == userId).ToListAsync(cancellationToken);
        var reports = await db.Reports.AsNoTracking().Where(r => r.ReporterUserId == userId).ToListAsync(cancellationToken);
        var wird = await db.DailyWirdProgress.AsNoTracking().Where(p => p.UserId == userId).ToListAsync(cancellationToken);
        var reminders = await db.ReminderDevices.AsNoTracking().Where(d => d.UserId == userId).ToListAsync(cancellationToken);

        await audit.LogAsync("Accounts.DataExported", "Account", userId, ct: cancellationToken);

        return new MyDataExportDto(
            new { user.Id, user.Email, user.PhoneNumber, user.DisplayName, user.Roles, user.CreatedAtUtc },
            consents.Select(c => (object)new { Type = c.Type.ToString(), c.PolicyVersion, c.AcceptedAtUtc, c.RevokedAtUtc }).ToList(),
            bookings.Select(b => (object)new
            {
                b.Id,
                Status = b.Status.ToString(),
                b.ServiceOfferingId,
                b.CreatedAtUtc,
                MyNoteToProvider = b.BeneficiaryNoteEncrypted is null ? null : encryptor.Decrypt(b.BeneficiaryNoteEncrypted),
            }).ToList(),
            recs.Select(r => (object)new { r.Id, r.BookingRequestId, GuidanceText = encryptor.Decrypt(r.GuidanceTextEncrypted), r.RecommendedAudioTrackIds, r.RecordedAtUtc }).ToList(),
            messages.Select(m => (object)new { m.Id, m.ConversationId, Body = encryptor.Decrypt(m.BodyEncrypted), m.SentAtUtc }).ToList(),
            favorites.Select(f => (object)new { f.AudioTrackId, f.AddedAtUtc }).ToList(),
            reports.Select(r => (object)new
            {
                r.Id,
                Category = r.Category.ToString(),
                Status = r.Status.ToString(),
                r.SubmittedAtUtc,
                Description = r.DescriptionEncrypted is null ? null : encryptor.Decrypt(r.DescriptionEncrypted),
            }).ToList(),
            wird.OrderBy(p => p.Day).Select(p => (object)new { p.Day, p.CollectionId, p.Counts, p.CompletedItems, p.TotalItems }).ToList(),
            reminders.OrderBy(d => d.CreatedAtUtc).Select(d => (object)new { d.Endpoint, d.TimeZone, d.MorningAt, d.EveningAt, d.SleepAt, d.CreatedAtUtc }).ToList(),
            clock.UtcNow);
    }
}

// ── رفع مستند توثيق (خاص) ──────────────────────────────────────────────────────
public sealed record UploadedFileDto(Guid Id, string ContentType, long SizeBytes);

public sealed record UploadVerificationDocumentCommand(Stream Content, long Length) : ICommand<UploadedFileDto>;

public sealed class UploadVerificationDocumentCommandHandler(FileUploadService uploads, AccessContext access)
    : IRequestHandler<UploadVerificationDocumentCommand, UploadedFileDto>
{
    public Task<UploadedFileDto> Handle(UploadVerificationDocumentCommand request, CancellationToken cancellationToken) =>
        uploads.UploadAsync(access.UserId, UploadKind.VerificationDocument, StoredFilePurpose.VerificationDocument,
            "verification-docs", request.Content, request.Length, cancellationToken);
}
