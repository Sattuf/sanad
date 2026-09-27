using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sanad.Application.Common.Access;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Common.Messaging;
using Sanad.Domain.Directory;
using Sanad.Domain.Identity;
using Sanad.Domain.Scheduling;

namespace Sanad.Application.Modules.Scheduling;

public sealed record AvailabilitySlotDto(Guid Id, DateTimeOffset StartUtc, DateTimeOffset EndUtc, string Status);

[RequireRoles(SanadRoles.Practitioner)]
public sealed record CreateAvailabilitySlotCommand(DateTimeOffset StartUtc, DateTimeOffset EndUtc) : ICommand<AvailabilitySlotDto>;

public sealed class CreateAvailabilitySlotCommandValidator : AbstractValidator<CreateAvailabilitySlotCommand>
{
    public CreateAvailabilitySlotCommandValidator() =>
        RuleFor(x => x.EndUtc).GreaterThan(x => x.StartUtc).WithMessage("نهاية الفترة يجب أن تكون بعد بدايتها.");
}

public sealed class CreateAvailabilitySlotCommandHandler(IApplicationDbContext db, AccessContext access, IDateTime clock)
    : IRequestHandler<CreateAvailabilitySlotCommand, AvailabilitySlotDto>
{
    public async Task<AvailabilitySlotDto> Handle(CreateAvailabilitySlotCommand request, CancellationToken cancellationToken)
    {
        var provider = await access.RequireCurrentProviderAsync(cancellationToken);
        var slot = AvailabilitySlot.Create(provider.Id, request.StartUtc, request.EndUtc, clock.UtcNow);

        var overlaps = await db.AvailabilitySlots.AnyAsync(s => s.ProviderProfileId == provider.Id && s.Status != SlotStatus.Cancelled &&
                                                                s.StartUtc < slot.EndUtc && slot.StartUtc < s.EndUtc, cancellationToken);
        if (overlaps) throw new ConflictException("الفترة تتداخل مع فترة إتاحة قائمة.");

        db.AvailabilitySlots.Add(slot);
        await db.SaveChangesAsync(cancellationToken);
        return new AvailabilitySlotDto(slot.Id, slot.StartUtc, slot.EndUtc, slot.Status.ToString());
    }
}

[RequireRoles(SanadRoles.Practitioner)]
public sealed record CancelAvailabilitySlotCommand(Guid SlotId) : ICommand<Unit>;

public sealed class CancelAvailabilitySlotCommandHandler(IApplicationDbContext db, AccessContext access) : IRequestHandler<CancelAvailabilitySlotCommand, Unit>
{
    public async Task<Unit> Handle(CancelAvailabilitySlotCommand request, CancellationToken cancellationToken)
    {
        var provider = await access.RequireCurrentProviderAsync(cancellationToken);
        var slot = await db.AvailabilitySlots.FirstOrDefaultAsync(s => s.Id == request.SlotId && s.ProviderProfileId == provider.Id, cancellationToken)
            ?? throw new NotFoundException("الفترة", request.SlotId);
        slot.Cancel();
        await db.SaveChangesAsync(cancellationToken);
        return Unit.Value;
    }
}

[RequireRoles(SanadRoles.Practitioner)]
public sealed record GetMySlotsQuery(DateTimeOffset? FromUtc, DateTimeOffset? ToUtc) : IQuery<IReadOnlyList<AvailabilitySlotDto>>;

public sealed class GetMySlotsQueryHandler(IApplicationDbContext db, AccessContext access, IDateTime clock)
    : IRequestHandler<GetMySlotsQuery, IReadOnlyList<AvailabilitySlotDto>>
{
    public async Task<IReadOnlyList<AvailabilitySlotDto>> Handle(GetMySlotsQuery request, CancellationToken cancellationToken)
    {
        var provider = await access.RequireCurrentProviderAsync(cancellationToken);
        var from = request.FromUtc ?? clock.UtcNow.AddDays(-7);
        var to = request.ToUtc ?? clock.UtcNow.AddDays(60);
        return (await db.AvailabilitySlots.AsNoTracking()
                .Where(s => s.ProviderProfileId == provider.Id && s.StartUtc >= from && s.StartUtc <= to && s.Status != SlotStatus.Cancelled)
                .ToListAsync(cancellationToken))
            .OrderBy(s => s.StartUtc).Select(s => new AvailabilitySlotDto(s.Id, s.StartUtc, s.EndUtc, s.Status.ToString())).ToList();
    }
}

/// <summary>الفترات المفتوحة المستقبلية لمختص منشور — لمستخدم مصادَق.</summary>
public sealed record GetProviderAvailabilityQuery(Guid ProviderProfileId, DateTimeOffset? FromUtc, DateTimeOffset? ToUtc) : IQuery<IReadOnlyList<AvailabilitySlotDto>>;

public sealed class GetProviderAvailabilityQueryHandler(IApplicationDbContext db, IDateTime clock)
    : IRequestHandler<GetProviderAvailabilityQuery, IReadOnlyList<AvailabilitySlotDto>>
{
    public async Task<IReadOnlyList<AvailabilitySlotDto>> Handle(GetProviderAvailabilityQuery request, CancellationToken cancellationToken)
    {
        var published = await db.ProviderProfiles.AnyAsync(p => p.Id == request.ProviderProfileId && p.Status == PublicationStatus.Published, cancellationToken);
        if (!published) throw new NotFoundException("مقدّم الخدمة", request.ProviderProfileId);
        var now = clock.UtcNow;
        var from = request.FromUtc is { } f && f > now ? f : now;
        var to = request.ToUtc ?? now.AddDays(30);
        return (await db.AvailabilitySlots.AsNoTracking()
                .Where(s => s.ProviderProfileId == request.ProviderProfileId && s.Status == SlotStatus.Open && s.StartUtc > from && s.StartUtc <= to)
                .ToListAsync(cancellationToken))
            .OrderBy(s => s.StartUtc).Take(200).Select(s => new AvailabilitySlotDto(s.Id, s.StartUtc, s.EndUtc, s.Status.ToString())).ToList();
    }
}
