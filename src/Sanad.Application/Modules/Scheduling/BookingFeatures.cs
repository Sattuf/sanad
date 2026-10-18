using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sanad.Application.Common.Access;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Common.Messaging;
using Sanad.Domain.Common;
using Sanad.Domain.Consent;
using Sanad.Domain.Identity;
using Sanad.Domain.Scheduling;

namespace Sanad.Application.Modules.Scheduling;

/// <summary>ملخص حجز — لا ملاحظة المستفيد ولا أي إشارة لوجود توصية هنا؛ تُقرأ فقط عبر Queries محمية منفصلة.</summary>
public sealed record BookingSummaryDto(Guid Id, string Status, DateTimeOffset SlotStartUtc, DateTimeOffset SlotEndUtc, Guid ProviderProfileId,
    string ProviderDisplayName, string ServiceCategory, string? CounterpartDisplayName, string? AdministrativeReasonForRejection, Guid? ConversationId);

public sealed record BookingCreatedDto(Guid Id, string Status, DateTimeOffset SlotStartUtc, DateTimeOffset SlotEndUtc);

// ── إنشاء حجز: Idempotency-Key إلزامي، "ملاحظتي للمختص" اختيارية ومشفّرة ──────────────
public sealed record CreateBookingRequestCommand(Guid ServiceOfferingId, Guid AvailabilitySlotId, string? BeneficiaryNote,
    bool ConsentToSensitiveNoteProcessing) : ICommand<BookingCreatedDto>, IIdempotentCommand, ISensitiveRequest;

public sealed class CreateBookingRequestCommandValidator : AbstractValidator<CreateBookingRequestCommand>
{
    public CreateBookingRequestCommandValidator()
    {
        RuleFor(x => x.ServiceOfferingId).NotEmpty();
        RuleFor(x => x.AvailabilitySlotId).NotEmpty();
        RuleFor(x => x.BeneficiaryNote).MaximumLength(BookingRequest.MaxBeneficiaryNoteLength);
    }
}

public sealed class CreateBookingRequestCommandHandler(
    IApplicationDbContext db, AccessContext access, IDateTime clock, IRequestContext requestContext,
    IFieldEncryptor encryptor, IPolicyVersionProvider policies)
    : IRequestHandler<CreateBookingRequestCommand, BookingCreatedDto>
{
    public async Task<BookingCreatedDto> Handle(CreateBookingRequestCommand request, CancellationToken cancellationToken)
    {
        // أولاً وقبل أي منطق قد يفشل: فحص مؤشر الخطر — الإحالة تصل بصرف النظر عن نجاح إنشاء الحجز

        var userId = access.UserId;
        var now = clock.UtcNow;
        var key = requestContext.IdempotencyKey;

        if (key is not null)
        {
            var existing = await db.BookingRequests.AsNoTracking().FirstOrDefaultAsync(b => b.IdempotencyKey == key, cancellationToken);
            if (existing is not null)
            {
                if (!existing.BelongsToBeneficiary(userId)) throw new ConflictException("مفتاح التكرار مستخدم لطلب آخر.");
                var existingSlot = await db.AvailabilitySlots.AsNoTracking().FirstAsync(s => s.Id == existing.AvailabilitySlotId, cancellationToken);
                return new BookingCreatedDto(existing.Id, existing.Status.ToString(), existingSlot.StartUtc, existingSlot.EndUtc);
            }
        }

        var hasNote = !string.IsNullOrWhiteSpace(request.BeneficiaryNote);
        if (hasNote)
            await EnsureSensitiveConsentAsync(userId, request.ConsentToSensitiveNoteProcessing, now, cancellationToken);

        var offering = await db.ServiceOfferings.FirstOrDefaultAsync(o => o.Id == request.ServiceOfferingId, cancellationToken)
            ?? throw new NotFoundException("الخدمة", request.ServiceOfferingId);
        var provider = await db.ProviderProfiles.FirstOrDefaultAsync(p => p.Id == offering.ProviderProfileId, cancellationToken)
            ?? throw new NotFoundException("مقدّم الخدمة", offering.ProviderProfileId);
        var slot = await db.AvailabilitySlots.FirstOrDefaultAsync(s => s.Id == request.AvailabilitySlotId, cancellationToken)
            ?? throw new NotFoundException("الفترة", request.AvailabilitySlotId);

        var booking = BookingRequest.Create(userId, offering, provider, slot, key, now);
        booking.SetBeneficiaryNote(request.BeneficiaryNote, encryptor);

        db.BookingRequests.Add(booking);
        await db.SaveChangesAsync(cancellationToken); // تعارض ConcurrencyStamp على الفترة ⇒ 409
        return new BookingCreatedDto(booking.Id, booking.Status.ToString(), slot.StartUtc, slot.EndUtc);
    }

    private async Task EnsureSensitiveConsentAsync(Guid userId, bool consentNow, DateTimeOffset now, CancellationToken ct)
    {
        var hasConsent = await db.ConsentRecords.AnyAsync(c => c.UserId == userId && c.Type == ConsentType.SensitiveDataProcessing && c.RevokedAtUtc == null, ct);
        if (hasConsent) return;
        if (!consentNow)
            throw new RequestValidationException("consentToSensitiveNoteProcessing",
                "كتابة ملاحظة للمختص تتطلب موافقتك على معالجة البيانات الحساسة (تُحفظ مشفّرة ولا يراها إلا المختص المُسنَد).");
        db.ConsentRecords.Add(ConsentRecord.Accept(userId, ConsentType.SensitiveDataProcessing, policies.CurrentVersion(ConsentType.SensitiveDataProcessing), now));
    }
}

// ── أفعال الحجز ────────────────────────────────────────────────────────────────
/// <summary>قبول: المختص يقبل طلباً قيد المراجعة، أو المستفيد يقبل موعداً بديلاً مقترحاً.</summary>
public sealed record AcceptBookingCommand(Guid BookingId) : ICommand<Unit>;

public sealed class AcceptBookingCommandHandler(IApplicationDbContext db, AccessContext access) : IRequestHandler<AcceptBookingCommand, Unit>
{
    public async Task<Unit> Handle(AcceptBookingCommand request, CancellationToken cancellationToken)
    {
        var (booking, isBeneficiary, provider) = await access.LoadBookingAsPartyAsync(request.BookingId, cancellationToken);
        var slot = await db.AvailabilitySlots.FirstAsync(s => s.Id == booking.AvailabilitySlotId, cancellationToken);
        if (provider is not null && booking.Status == BookingStatus.UnderReview) booking.AcceptByProvider(provider.Id, slot);
        else if (isBeneficiary && booking.Status == BookingStatus.AlternativeProposed) booking.AcceptAlternativeByBeneficiary(access.UserId, slot);
        else throw new Sanad.Domain.Exceptions.DomainException("لا يمكن قبول الحجز في حالته الحالية من طرفك.", "invalid_state");
        await db.SaveChangesAsync(cancellationToken);
        return Unit.Value;
    }
}

[RequireRoles(SanadRoles.Practitioner)]
public sealed record ProposeAlternativeTimeCommand(Guid BookingId, Guid AlternativeSlotId) : ICommand<Unit>;

public sealed class ProposeAlternativeTimeCommandHandler(IApplicationDbContext db, AccessContext access, IDateTime clock)
    : IRequestHandler<ProposeAlternativeTimeCommand, Unit>
{
    public async Task<Unit> Handle(ProposeAlternativeTimeCommand request, CancellationToken cancellationToken)
    {
        var (booking, _, provider) = await access.LoadBookingAsPartyAsync(request.BookingId, cancellationToken);
        if (provider is null) throw new ForbiddenAccessException();
        var current = await db.AvailabilitySlots.FirstAsync(s => s.Id == booking.AvailabilitySlotId, cancellationToken);
        var alternative = await db.AvailabilitySlots.FirstOrDefaultAsync(s => s.Id == request.AlternativeSlotId, cancellationToken)
            ?? throw new NotFoundException("الفترة", request.AlternativeSlotId);
        booking.ProposeAlternative(provider.Id, current, alternative, clock.UtcNow);
        await db.SaveChangesAsync(cancellationToken);
        return Unit.Value;
    }
}

[RequireRoles(SanadRoles.Practitioner)]
public sealed record RejectBookingCommand(Guid BookingId, string AdministrativeReason) : ICommand<Unit>;

public sealed class RejectBookingCommandValidator : AbstractValidator<RejectBookingCommand>
{
    public RejectBookingCommandValidator() => RuleFor(x => x.AdministrativeReason).NotEmpty().MaximumLength(300);
}

public sealed class RejectBookingCommandHandler(IApplicationDbContext db, AccessContext access, IContentPolicyChecker policy)
    : IRequestHandler<RejectBookingCommand, Unit>
{
    public async Task<Unit> Handle(RejectBookingCommand request, CancellationToken cancellationToken)
    {
        var (booking, _, provider) = await access.LoadBookingAsPartyAsync(request.BookingId, cancellationToken);
        if (provider is null) throw new ForbiddenAccessException();
        ContentPolicy.EnsureAllowed(policy, "سبب الرفض", request.AdministrativeReason);
        var slot = await db.AvailabilitySlots.FirstAsync(s => s.Id == booking.AvailabilitySlotId, cancellationToken);
        booking.RejectByProvider(provider.Id, request.AdministrativeReason, slot);
        await db.SaveChangesAsync(cancellationToken);
        return Unit.Value;
    }
}

public sealed record CancelBookingCommand(Guid BookingId) : ICommand<Unit>;

public sealed class CancelBookingCommandHandler(IApplicationDbContext db, AccessContext access) : IRequestHandler<CancelBookingCommand, Unit>
{
    public async Task<Unit> Handle(CancelBookingCommand request, CancellationToken cancellationToken)
    {
        var (booking, _, provider) = await access.LoadBookingAsPartyAsync(request.BookingId, cancellationToken);
        var slot = await db.AvailabilitySlots.FirstAsync(s => s.Id == booking.AvailabilitySlotId, cancellationToken);
        booking.Cancel(access.UserId, provider?.Id, slot);
        await db.SaveChangesAsync(cancellationToken);
        return Unit.Value;
    }
}

[RequireRoles(SanadRoles.Practitioner)]
public sealed record CompleteBookingCommand(Guid BookingId) : ICommand<Unit>;

public sealed class CompleteBookingCommandHandler(IApplicationDbContext db, AccessContext access, IDateTime clock) : IRequestHandler<CompleteBookingCommand, Unit>
{
    public async Task<Unit> Handle(CompleteBookingCommand request, CancellationToken cancellationToken)
    {
        var (booking, _, provider) = await access.LoadBookingAsPartyAsync(request.BookingId, cancellationToken);
        if (provider is null) throw new ForbiddenAccessException();
        var slot = await db.AvailabilitySlots.FirstAsync(s => s.Id == booking.AvailabilitySlotId, cancellationToken);
        booking.CompleteAdministratively(provider.Id, slot, clock.UtcNow);
        await db.SaveChangesAsync(cancellationToken);
        return Unit.Value;
    }
}

public sealed record OpenBookingDisputeCommand(Guid BookingId) : ICommand<Unit>;

public sealed class OpenBookingDisputeCommandHandler(IApplicationDbContext db, AccessContext access) : IRequestHandler<OpenBookingDisputeCommand, Unit>
{
    public async Task<Unit> Handle(OpenBookingDisputeCommand request, CancellationToken cancellationToken)
    {
        var (booking, _, provider) = await access.LoadBookingAsPartyAsync(request.BookingId, cancellationToken);
        booking.OpenDispute(access.UserId, provider?.Id);
        await db.SaveChangesAsync(cancellationToken);
        return Unit.Value;
    }
}

// ── القراءة ────────────────────────────────────────────────────────────────────
public sealed record GetMyBookingsQuery : IQuery<IReadOnlyList<BookingSummaryDto>>;

public sealed class GetMyBookingsQueryHandler(IApplicationDbContext db, AccessContext access) : IRequestHandler<GetMyBookingsQuery, IReadOnlyList<BookingSummaryDto>>
{
    public async Task<IReadOnlyList<BookingSummaryDto>> Handle(GetMyBookingsQuery request, CancellationToken cancellationToken)
    {
        var bookings = await db.BookingRequests.AsNoTracking().Where(b => b.BeneficiaryUserId == access.UserId).ToListAsync(cancellationToken);
        return await BookingProjection.ToSummariesAsync(db, bookings, null, null, cancellationToken);
    }
}

[RequireRoles(SanadRoles.Practitioner)]
public sealed record GetProviderBookingsQuery(BookingStatus? Status) : IQuery<IReadOnlyList<BookingSummaryDto>>;

public sealed class GetProviderBookingsQueryHandler(IApplicationDbContext db, AccessContext access, IIdentityService identity)
    : IRequestHandler<GetProviderBookingsQuery, IReadOnlyList<BookingSummaryDto>>
{
    public async Task<IReadOnlyList<BookingSummaryDto>> Handle(GetProviderBookingsQuery request, CancellationToken cancellationToken)
    {
        var provider = await access.RequireCurrentProviderAsync(cancellationToken);
        var query = db.BookingRequests.AsNoTracking().Where(b => b.ProviderProfileIdOfAssignedService == provider.Id);
        if (request.Status is { } s) query = query.Where(b => b.Status == s);
        var bookings = await query.ToListAsync(cancellationToken);
        var beneficiaryIds = bookings.Select(b => b.BeneficiaryUserId).Distinct().ToList();
        var names = await identity.GetDisplayNamesAsync(beneficiaryIds, cancellationToken);
        var hidePrefs = await identity.GetHideIdentityPreferencesAsync(beneficiaryIds, cancellationToken);
        return await BookingProjection.ToSummariesAsync(db, bookings, names, hidePrefs, cancellationToken);
    }
}

public sealed record GetBookingStatusQuery(Guid BookingId) : IQuery<BookingSummaryDto>;

public sealed class GetBookingStatusQueryHandler(IApplicationDbContext db, AccessContext access, IIdentityService identity)
    : IRequestHandler<GetBookingStatusQuery, BookingSummaryDto>
{
    public async Task<BookingSummaryDto> Handle(GetBookingStatusQuery request, CancellationToken cancellationToken)
    {
        var (booking, _, provider) = await access.LoadBookingAsPartyAsync(request.BookingId, cancellationToken);
        IReadOnlyDictionary<Guid, string>? names = null;
        IReadOnlyDictionary<Guid, bool>? hidePrefs = null;
        if (provider is not null)
        {
            names = await identity.GetDisplayNamesAsync([booking.BeneficiaryUserId], cancellationToken);
            hidePrefs = await identity.GetHideIdentityPreferencesAsync([booking.BeneficiaryUserId], cancellationToken);
        }
        return (await BookingProjection.ToSummariesAsync(db, [booking], names, hidePrefs, cancellationToken))[0];
    }
}

internal static class BookingProjection
{
    /// <summary>حالات لا تُبلَغ إلا بعد قبول الحجز فعلاً — قبلها يبقى اسم المستفيد مخفياً إن اختار ذلك.</summary>
    private static readonly HashSet<BookingStatus> IdentityRevealedStatuses =
        [BookingStatus.Accepted, BookingStatus.AdministrativelyCompleted, BookingStatus.UnderDispute];

    public static async Task<IReadOnlyList<BookingSummaryDto>> ToSummariesAsync(IApplicationDbContext db, IReadOnlyList<BookingRequest> bookings,
        IReadOnlyDictionary<Guid, string>? beneficiaryNames, IReadOnlyDictionary<Guid, bool>? hideIdentityPreferences, CancellationToken ct)
    {
        var slotIds = bookings.Select(b => b.AvailabilitySlotId).Distinct().ToList();
        var offeringIds = bookings.Select(b => b.ServiceOfferingId).Distinct().ToList();
        var providerIds = bookings.Select(b => b.ProviderProfileIdOfAssignedService).Distinct().ToList();
        var bookingIds = bookings.Select(b => b.Id).ToList();

        var slots = await db.AvailabilitySlots.AsNoTracking().Where(s => slotIds.Contains(s.Id)).ToDictionaryAsync(s => s.Id, ct);
        var offerings = await db.ServiceOfferings.AsNoTracking().Where(o => offeringIds.Contains(o.Id)).ToDictionaryAsync(o => o.Id, o => o.Category, ct);
        var providers = await db.ProviderProfiles.AsNoTracking().Where(p => providerIds.Contains(p.Id)).ToDictionaryAsync(p => p.Id, p => p.DisplayName, ct);
        var conversations = await db.Conversations.AsNoTracking().Where(c => bookingIds.Contains(c.BookingRequestId))
            .ToDictionaryAsync(c => c.BookingRequestId, c => c.Id, ct);

        return bookings.Select(b =>
        {
            var slot = slots[b.AvailabilitySlotId];
            var beneficiaryName = beneficiaryNames?.GetValueOrDefault(b.BeneficiaryUserId);
            if (beneficiaryName is not null && (hideIdentityPreferences?.GetValueOrDefault(b.BeneficiaryUserId) ?? false)
                && !IdentityRevealedStatuses.Contains(b.Status))
                beneficiaryName = "مستفيد (يظهر الاسم بعد تأكيد الحجز)";
            return new BookingSummaryDto(b.Id, b.Status.ToString(), slot.StartUtc, slot.EndUtc, b.ProviderProfileIdOfAssignedService,
                providers.GetValueOrDefault(b.ProviderProfileIdOfAssignedService, "—"), offerings.GetValueOrDefault(b.ServiceOfferingId, "—"),
                beneficiaryName, b.AdministrativeReasonForRejection,
                conversations.TryGetValue(b.Id, out var cid) ? cid : null);
        }).OrderByDescending(b => b.SlotStartUtc).ToList();
    }
}

// ── "ملاحظتي للمختص": صاحب الحجز، أو المختص المُسنَد، أو المنسق عند تصعيد مرتبط فقط ──────
public sealed record BookingNoteDto(Guid BookingId, string? Note);

public sealed record GetBookingNoteQuery(Guid BookingId) : IQuery<BookingNoteDto>, ISensitiveRequest;

public sealed class GetBookingNoteQueryHandler(AccessContext access, IFieldEncryptor encryptor, IAuditLogger audit)
    : IRequestHandler<GetBookingNoteQuery, BookingNoteDto>
{
    public async Task<BookingNoteDto> Handle(GetBookingNoteQuery request, CancellationToken cancellationToken)
    {
        var booking = await access.LoadBookingAsync(request.BookingId, cancellationToken);
        var isOwner = booking.BelongsToBeneficiary(access.UserId);
        var provider = await access.GetCurrentProviderAsync(cancellationToken);
        var isAssigned = provider is not null && booking.IsAssignedTo(provider.Id);
        var isEscalation = !isOwner && !isAssigned && await access.CoordinatorHasEscalationAccessAsync(booking, cancellationToken);
        if (!isOwner && !isAssigned && !isEscalation) throw new NotFoundException("الحجز", request.BookingId);

        if (!isOwner)
            await audit.LogAsync("Scheduling.BeneficiaryNoteRead", nameof(BookingRequest), booking.Id,
                new { Via = isAssigned ? "AssignedProvider" : "CoordinatorEscalation" }, ct: cancellationToken);

        // فك التشفير هنا فقط — نقطة القراءة المصرَّح بها الوحيدة لهذا الحقل
        return new BookingNoteDto(booking.Id, booking.BeneficiaryNoteEncrypted is null ? null : encryptor.Decrypt(booking.BeneficiaryNoteEncrypted));
    }
}
