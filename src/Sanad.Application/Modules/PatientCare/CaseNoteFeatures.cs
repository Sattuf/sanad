using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sanad.Application.Common.Access;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Common.Messaging;
using Sanad.Domain.Common;
using Sanad.Domain.Identity;
using Sanad.Domain.PatientCare;

namespace Sanad.Application.Modules.PatientCare;

// ════════════════════════════════════════════════════════════════════════════════
//  ملاحظة المختص الخاصة (إشرافية) — لا تصل للمستفيد أبداً تحت أي ظرف.
//  منفصلة تماماً عن التوصية (RecommendationFeatures.cs): أوامر مختلفة، Policies مختلفة، Endpoints مختلفة.
// ════════════════════════════════════════════════════════════════════════════════

public sealed record CaseNoteDto(Guid Id, Guid BookingRequestId, Guid AuthoredByProviderProfileId, string Note, DateTimeOffset RecordedAtUtc);

[RequireRoles(SanadRoles.Practitioner)]
public sealed record RecordProviderCaseNoteCommand(Guid BookingRequestId, string Text) : ICommand<Guid>, ISensitiveRequest;

public sealed class RecordProviderCaseNoteCommandValidator : AbstractValidator<RecordProviderCaseNoteCommand>
{
    public RecordProviderCaseNoteCommandValidator()
    {
        RuleFor(x => x.BookingRequestId).NotEmpty();
        RuleFor(x => x.Text).NotEmpty().MaximumLength(ProviderCaseNote.MaxLength);
    }
}

public sealed class RecordProviderCaseNoteCommandHandler(IApplicationDbContext db, AccessContext access, IFieldEncryptor encryptor,
    IContentPolicyChecker policy, IDateTime clock)
    : IRequestHandler<RecordProviderCaseNoteCommand, Guid>
{
    public async Task<Guid> Handle(RecordProviderCaseNoteCommand request, CancellationToken cancellationToken)
    {
        var provider = await access.RequireCurrentProviderAsync(cancellationToken);
        var booking = await access.LoadBookingAsync(request.BookingRequestId, cancellationToken);
        if (!booking.IsAssignedTo(provider.Id)) throw new NotFoundException("الحجز", request.BookingRequestId);

        var note = ProviderCaseNote.Create(booking, provider.Id, request.Text, encryptor, policy, clock.UtcNow);
        db.ProviderCaseNotes.Add(note);
        await db.SaveChangesAsync(cancellationToken);
        return note.Id;
    }
}

/// <summary>
/// قراءة ملاحظات المختص لحجز: كاتبها نفسه، أو ClinicalSupervisor (إشراف)، أو Coordinator عند تصعيد موثّق مفتوح فقط —
/// الأدوار الإدارية بجلسة 2FA. المستفيد لا يصل هنا إطلاقاً (404، لا كشف لوجود الملاحظة).
/// </summary>
public sealed record GetCaseNoteForBookingQuery(Guid BookingRequestId) : IQuery<IReadOnlyList<CaseNoteDto>>, ISensitiveRequest;

public sealed class GetCaseNoteForBookingQueryHandler(IApplicationDbContext db, AccessContext access, IFieldEncryptor encryptor, IAuditLogger audit)
    : IRequestHandler<GetCaseNoteForBookingQuery, IReadOnlyList<CaseNoteDto>>
{
    public async Task<IReadOnlyList<CaseNoteDto>> Handle(GetCaseNoteForBookingQuery request, CancellationToken cancellationToken)
    {
        var booking = await access.LoadBookingAsync(request.BookingRequestId, cancellationToken);
        var provider = await access.GetCurrentProviderAsync(cancellationToken);
        var isAuthorProvider = provider is not null && booking.IsAssignedTo(provider.Id);
        var isSupervisor = access.IsStaff(SanadRoles.ClinicalSupervisor);
        var isCoordinatorOnEscalation = !isAuthorProvider && !isSupervisor && await access.CoordinatorHasEscalationAccessAsync(booking, cancellationToken);

        if (!isAuthorProvider && !isSupervisor && !isCoordinatorOnEscalation)
            throw new NotFoundException("الحجز", request.BookingRequestId);

        var query = db.ProviderCaseNotes.AsNoTracking().Where(n => n.BookingRequestId == booking.Id);
        if (isAuthorProvider && !isSupervisor) query = query.Where(n => n.AuthoredByProviderProfileId == provider!.Id);
        var notes = (await query.ToListAsync(cancellationToken)).OrderBy(n => n.RecordedAtUtc).ToList();

        if (!isAuthorProvider)
            await audit.LogAsync("PatientCare.CaseNoteSupervisoryRead", nameof(ProviderCaseNote), booking.Id,
                new { Via = isSupervisor ? "ClinicalSupervisor" : "CoordinatorEscalation", Count = notes.Count }, ct: cancellationToken);

        return notes.Select(n => new CaseNoteDto(n.Id, n.BookingRequestId, n.AuthoredByProviderProfileId,
            encryptor.Decrypt(n.NoteEncrypted), n.RecordedAtUtc)).ToList();
    }
}
