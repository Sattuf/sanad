using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sanad.Application.Common.Access;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Common.Messaging;
using Sanad.Domain.Consent;

namespace Sanad.Application.Modules.Consent;

public sealed record ConsentStatusItemDto(string Type, bool Accepted, string? AcceptedVersion, string CurrentVersion, bool NeedsReacceptance, DateTimeOffset? AcceptedAtUtc);

public sealed record GetMyConsentStatusQuery : IQuery<IReadOnlyList<ConsentStatusItemDto>>;

public sealed class GetMyConsentStatusQueryHandler(IApplicationDbContext db, AccessContext access, IPolicyVersionProvider versions)
    : IRequestHandler<GetMyConsentStatusQuery, IReadOnlyList<ConsentStatusItemDto>>
{
    public async Task<IReadOnlyList<ConsentStatusItemDto>> Handle(GetMyConsentStatusQuery request, CancellationToken cancellationToken)
    {
        var records = await db.ConsentRecords.AsNoTracking()
            .Where(c => c.UserId == access.UserId && c.RevokedAtUtc == null).ToListAsync(cancellationToken);
        return Enum.GetValues<ConsentType>().Select(type =>
        {
            var latest = records.Where(r => r.Type == type).OrderByDescending(r => r.AcceptedAtUtc).FirstOrDefault();
            var current = versions.CurrentVersion(type);
            return new ConsentStatusItemDto(type.ToString(), latest is not null, latest?.PolicyVersion, current,
                latest is not null && latest.PolicyVersion != current, latest?.AcceptedAtUtc);
        }).ToList();
    }
}

/// <summary>سجل كل الموافقات (بما فيها المسحوبة) بتواريخها ونسخها — للشفافية.</summary>
public sealed record ConsentHistoryItemDto(string Type, string PolicyVersion, DateTimeOffset AcceptedAtUtc, DateTimeOffset? RevokedAtUtc);

public sealed record GetMyConsentHistoryQuery : IQuery<IReadOnlyList<ConsentHistoryItemDto>>;

public sealed class GetMyConsentHistoryQueryHandler(IApplicationDbContext db, AccessContext access)
    : IRequestHandler<GetMyConsentHistoryQuery, IReadOnlyList<ConsentHistoryItemDto>>
{
    public async Task<IReadOnlyList<ConsentHistoryItemDto>> Handle(GetMyConsentHistoryQuery request, CancellationToken cancellationToken)
    {
        var records = await db.ConsentRecords.AsNoTracking().Where(c => c.UserId == access.UserId)
            .OrderByDescending(c => c.AcceptedAtUtc).ToListAsync(cancellationToken);
        return records.Select(c => new ConsentHistoryItemDto(c.Type.ToString(), c.PolicyVersion, c.AcceptedAtUtc, c.RevokedAtUtc)).ToList();
    }
}

/// <summary>تسجيل موافقة على الإصدار الحالي من السياسة (الإصدار يحدده الخادم، لا العميل).</summary>
public sealed record RecordConsentCommand(ConsentType Type) : ICommand<Unit>;

public sealed class RecordConsentCommandValidator : AbstractValidator<RecordConsentCommand>
{
    public RecordConsentCommandValidator() => RuleFor(x => x.Type).IsInEnum();
}

public sealed class RecordConsentCommandHandler(IApplicationDbContext db, AccessContext access, IPolicyVersionProvider versions, IDateTime clock)
    : IRequestHandler<RecordConsentCommand, Unit>
{
    public async Task<Unit> Handle(RecordConsentCommand request, CancellationToken cancellationToken)
    {
        var version = versions.CurrentVersion(request.Type);
        var exists = await db.ConsentRecords.AnyAsync(c => c.UserId == access.UserId && c.Type == request.Type &&
                                                          c.PolicyVersion == version && c.RevokedAtUtc == null, cancellationToken);
        if (exists) return Unit.Value;
        db.ConsentRecords.Add(ConsentRecord.Accept(access.UserId, request.Type, version, clock.UtcNow));
        await db.SaveChangesAsync(cancellationToken);
        return Unit.Value;
    }
}

/// <summary>
/// سحب موافقة اختيارية (التواصل التسويقي، معالجة البيانات الحساسة). سحب شروط الاستخدام أو الخصوصية يعني حذف الحساب.
/// </summary>
public sealed record RevokeConsentCommand(ConsentType Type) : ICommand<Unit>;

public sealed class RevokeConsentCommandValidator : AbstractValidator<RevokeConsentCommand>
{
    public RevokeConsentCommandValidator() =>
        RuleFor(x => x.Type).IsInEnum()
            .Must(t => t is ConsentType.MarketingCommunication or ConsentType.SensitiveDataProcessing)
            .WithMessage("سحب الموافقة على الشروط أو الخصوصية يتم عبر حذف الحساب.");
}

public sealed class RevokeConsentCommandHandler(IApplicationDbContext db, AccessContext access, IDateTime clock)
    : IRequestHandler<RevokeConsentCommand, Unit>
{
    public async Task<Unit> Handle(RevokeConsentCommand request, CancellationToken cancellationToken)
    {
        var active = await db.ConsentRecords.Where(c => c.UserId == access.UserId && c.Type == request.Type && c.RevokedAtUtc == null)
            .ToListAsync(cancellationToken);
        if (active.Count == 0) throw new NotFoundException("الموافقة", request.Type);
        foreach (var record in active) record.Revoke(clock.UtcNow);
        await db.SaveChangesAsync(cancellationToken);
        return Unit.Value;
    }
}
