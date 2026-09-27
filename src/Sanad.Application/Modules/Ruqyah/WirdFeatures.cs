using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sanad.Application.Common.Access;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Common.Messaging;
using Sanad.Domain.Ruqyah;

namespace Sanad.Application.Modules.Ruqyah;

// ── الورد اليومي في الحساب ──────────────────────────────────────────────────
// يُحفظ تقدّم المستخدم في الأذكار ليتابع من أي جهاز. التاريخ يرسله المتصفح بتوقيت المستخدم المحلي،
// ويُقبل في نافذة يوم حول تاريخ الخادم لتغطية فروق المناطق الزمنية فقط.

public sealed record WirdCollectionProgressDto(string CollectionId, IReadOnlyDictionary<string, int> Counts, int CompletedItems, int TotalItems);

/// <summary>Streak: أيام متتالية حتى اليوم (أو أمس) أُتمّت فيها مجموعة واحدة على الأقل. CompletedDays: آخر 30 يوماً.</summary>
public sealed record MyWirdDto(DateOnly Day, IReadOnlyList<WirdCollectionProgressDto> Collections, int Streak, IReadOnlyList<DateOnly> CompletedDays);

internal static class WirdDays
{
    public static bool IsAcceptable(DateOnly day, DateTimeOffset nowUtc)
    {
        var today = DateOnly.FromDateTime(nowUtc.UtcDateTime);
        return day >= today.AddDays(-1) && day <= today.AddDays(1);
    }
}

public sealed record GetMyWirdQuery(DateOnly Day) : IQuery<MyWirdDto>;

public sealed class GetMyWirdQueryValidator : AbstractValidator<GetMyWirdQuery>
{
    public GetMyWirdQueryValidator(IDateTime clock) =>
        RuleFor(x => x.Day).Must(d => WirdDays.IsAcceptable(d, clock.UtcNow)).WithMessage("تاريخ اليوم غير صحيح.");
}

public sealed class GetMyWirdQueryHandler(IApplicationDbContext db, AccessContext access) : IRequestHandler<GetMyWirdQuery, MyWirdDto>
{
    public async Task<MyWirdDto> Handle(GetMyWirdQuery request, CancellationToken cancellationToken)
    {
        var userId = access.UserId;
        var from = request.Day.AddDays(-60);
        var rows = await db.DailyWirdProgress.AsNoTracking()
            .Where(p => p.UserId == userId && p.Day >= from && p.Day <= request.Day)
            .ToListAsync(cancellationToken);

        var today = rows.Where(p => p.Day == request.Day)
            .Select(p => new WirdCollectionProgressDto(p.CollectionId, p.Counts, p.CompletedItems, p.TotalItems)).ToList();
        var completed = rows.Where(p => p.IsComplete).Select(p => p.Day).ToHashSet();

        // اليوم الجاري لا يقطع السلسلة قبل انتهائه: نبدأ من أمس إن لم يكتمل اليوم بعد
        var cursor = completed.Contains(request.Day) ? request.Day : request.Day.AddDays(-1);
        var streak = 0;
        while (completed.Contains(cursor))
        {
            streak++;
            cursor = cursor.AddDays(-1);
        }

        var recent = completed.Where(d => d > request.Day.AddDays(-30)).OrderBy(d => d).ToList();
        return new MyWirdDto(request.Day, today, streak, recent);
    }
}

public sealed record SaveMyWirdCommand(string CollectionId, DateOnly Day, Dictionary<string, int> Counts, int CompletedItems, int TotalItems)
    : ICommand<Unit>;

public sealed class SaveMyWirdCommandValidator : AbstractValidator<SaveMyWirdCommand>
{
    public SaveMyWirdCommandValidator(IDateTime clock)
    {
        RuleFor(x => x.CollectionId).NotEmpty().MaximumLength(60).Matches("^[a-z0-9][a-z0-9-]*$");
        RuleFor(x => x.Day).Must(d => WirdDays.IsAcceptable(d, clock.UtcNow)).WithMessage("تاريخ اليوم غير صحيح.");
        RuleFor(x => x.Counts).NotNull().Must(c => c.Count <= DailyWirdProgress.MaxItems).WithMessage("عناصر كثيرة.");
        RuleFor(x => x.TotalItems).InclusiveBetween(1, DailyWirdProgress.MaxItems);
        RuleFor(x => x.CompletedItems).GreaterThanOrEqualTo(0).LessThanOrEqualTo(x => x.TotalItems);
    }
}

public sealed class SaveMyWirdCommandHandler(IApplicationDbContext db, AccessContext access, IDateTime clock) : IRequestHandler<SaveMyWirdCommand, Unit>
{
    public async Task<Unit> Handle(SaveMyWirdCommand request, CancellationToken cancellationToken)
    {
        var userId = access.UserId;
        var row = await db.DailyWirdProgress.FirstOrDefaultAsync(
            p => p.UserId == userId && p.CollectionId == request.CollectionId && p.Day == request.Day, cancellationToken);
        if (row is null)
        {
            row = DailyWirdProgress.Start(userId, request.CollectionId, request.Day, clock.UtcNow);
            db.DailyWirdProgress.Add(row);
        }
        row.Record(request.Counts, request.CompletedItems, request.TotalItems, clock.UtcNow);
        await db.SaveChangesAsync(cancellationToken);
        return Unit.Value;
    }
}
