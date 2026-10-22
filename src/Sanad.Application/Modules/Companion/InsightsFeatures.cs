using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sanad.Application.Common.Access;
using Sanad.Application.Common.Events;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Common.Messaging;
using Sanad.Application.Modules.Ruqyah;
using Sanad.Domain.Companion;
using Sanad.Domain.Identity;
using Sanad.Domain.Ruqyah;

namespace Sanad.Application.Modules.Companion;

// ── المؤشرات المجمّعة (بلا تتبّع أفراد) ───────────────────────────────────────

public sealed record CompanionEventInput(string Name, string Dimension);

/// <summary>
/// عدّادات يومية مجهولة تماماً: اسم الحدث وبُعده من قائمة ثابتة. لا يُخزَّن مع العدد أي معرّف، ولا عنوان IP،
/// ولا وقت دقيق (اليوم فقط). الأحداث غير المعروفة تُهمَل بصمت ولا تُرفض، حتى لا تكشف القائمة لمن يجرّب.
/// </summary>
[AllowAnonymousRequest]
public sealed record RecordCompanionEventsCommand(List<CompanionEventInput> Events) : ICommand<Unit>;

public sealed class RecordCompanionEventsCommandValidator : AbstractValidator<RecordCompanionEventsCommand>
{
    public RecordCompanionEventsCommandValidator()
    {
        // نمط واحد يغطي الغياب: NotNull وحده لا يوقف القاعدة التالية، فكان Count على null يرمي (500)
        RuleFor(x => x.Events).Must(e => e is { Count: >= 1 and <= 20 }).WithMessage("بين حدث و20 حدثاً.");
        // عنصر null داخل القائمة كان يصل إلى المعالج فيرمي عند e.Name (500) — وجدته ضبابية الـ API
        RuleForEach(x => x.Events).NotNull();
    }
}

public sealed class RecordCompanionEventsCommandHandler(IApplicationDbContext db, IDateTime clock) : IRequestHandler<RecordCompanionEventsCommand, Unit>
{
    public async Task<Unit> Handle(RecordCompanionEventsCommand r, CancellationToken cancellationToken)
    {
        var now = clock.UtcNow;
        var day = DateOnly.FromDateTime(now.UtcDateTime);
        var groups = r.Events.Where(e => CompanionEventCounter.IsAllowed(e.Name, e.Dimension))
            .GroupBy(e => (e.Name, e.Dimension)).Select(g => (g.Key.Name, g.Key.Dimension, Count: Math.Min(g.Count(), 50))).ToList();
        if (groups.Count == 0) return Unit.Value;

        var names = groups.Select(g => g.Name).Distinct().ToList();
        var existing = await db.CompanionEventCounters.Where(c => c.Day == day && names.Contains(c.Name)).ToListAsync(cancellationToken);
        foreach (var (name, dimension, count) in groups)
        {
            var row = existing.FirstOrDefault(c => c.Name == name && c.Dimension == dimension);
            if (row is null)
            {
                row = CompanionEventCounter.Start(day, name, dimension, now);
                db.CompanionEventCounters.Add(row);
            }
            row.Add(count);
        }
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // سباق على إنشاء صف اليوم نفسه من نسختين: فقدان عدّ نادر أهون من فشل الطلب — المؤشرات تقريبية بطبيعتها
        }
        return Unit.Value;
    }
}

public sealed record CompanionStatRow(DateOnly Day, string Name, string Dimension, long Count);

public sealed record CompanionStatsDto(DateOnly From, DateOnly To, IReadOnlyList<CompanionStatRow> Rows,
    IReadOnlyDictionary<string, long> Totals, int PublishedPlans, int ActiveEnrollments, int GroupKhatmas);

[RequireRoles(SanadRoles.ContentManager, SanadRoles.Coordinator, RequireMfa = true)]
public sealed record GetCompanionStatsQuery(int Days) : IQuery<CompanionStatsDto>;

public sealed class GetCompanionStatsQueryValidator : AbstractValidator<GetCompanionStatsQuery>
{
    public GetCompanionStatsQueryValidator() => RuleFor(x => x.Days).InclusiveBetween(1, 365);
}

public sealed class GetCompanionStatsQueryHandler(IApplicationDbContext db, IDateTime clock) : IRequestHandler<GetCompanionStatsQuery, CompanionStatsDto>
{
    public async Task<CompanionStatsDto> Handle(GetCompanionStatsQuery r, CancellationToken cancellationToken)
    {
        var to = DateOnly.FromDateTime(clock.UtcNow.UtcDateTime);
        var from = to.AddDays(-(r.Days - 1));
        var rows = (await db.CompanionEventCounters.AsNoTracking().Where(c => c.Day >= from && c.Day <= to).ToListAsync(cancellationToken))
            .OrderBy(c => c.Day).ThenBy(c => c.Name, StringComparer.Ordinal).ThenBy(c => c.Dimension, StringComparer.Ordinal)
            .Select(c => new CompanionStatRow(c.Day, c.Name, c.Dimension, c.Count)).ToList();
        var totals = rows.GroupBy(x => x.Name).ToDictionary(g => g.Key, g => g.Sum(x => x.Count));
        // أعداد إجمالية فقط — لا قائمة بالمستخدمين ولا بخططهم
        return new CompanionStatsDto(from, to, rows, totals,
            await db.RuqyahPlans.CountAsync(p => p.Status == PlanStatus.Published, cancellationToken),
            await db.PlanEnrollments.CountAsync(e => e.IsActive, cancellationToken),
            await db.Khatmas.CountAsync(k => k.Mode == KhatmaMode.Group, cancellationToken));
    }
}

// ── إشعار إتمام الختمة الجماعية ───────────────────────────────────────────────

public static class CompanionPushMessages
{
    /// <summary>عام وثابت: لا عنوان الختمة ولا النيّة (product-spec.md §4).</summary>
    public static readonly ReminderPush KhatmaCompleted = new("سند", "تمّت ختمة انضممت إليها، بحمد الله. تقبّل الله منكم.", "./#/khatma", "sanad-khatma");

    public static readonly ReminderPush Wird = new("سند", "وردك اليوم جاهز.", "./#/", "sanad-wird");

    public static readonly ReminderPush Test = new("سند", "وصلت الإشعارات — سيصلك تذكير واحد هادئ في اليوم.", "./#/", "sanad-test");
}

/// <summary>إشعار عند إتمام الختمة الجماعية فقط، لا عند كل جزء — داخل التطبيق ولأجهزة «سند» المسجّلة لكل عضو.</summary>
public sealed class KhatmaCompletedHandler(IApplicationDbContext db, INotificationDispatcher notifications, IReminderPushSender push)
    : MediatR.INotificationHandler<DomainEventNotification<KhatmaCompletedEvent>>
{
    public async Task Handle(DomainEventNotification<KhatmaCompletedEvent> notification, CancellationToken cancellationToken)
    {
        var k = await db.Khatmas.AsNoTracking().FirstOrDefaultAsync(x => x.Id == notification.Event.KhatmaId, cancellationToken);
        if (k is null || k.Mode != KhatmaMode.Group) return;
        var members = k.Members.Select(m => m.UserId).ToList();
        foreach (var uid in members)
            await notifications.DispatchAsync(new NotificationMessage(uid, "khatma.completed", "تمّت الختمة",
                "تمّت ختمة انضممت إليها، بحمد الله.", null), cancellationToken);

        if (!push.IsConfigured) return;
        var devices = await db.ReminderDevices.Where(d => members.Contains(d.UserId) && d.Client == ReminderClient.Companion).ToListAsync(cancellationToken);
        foreach (var d in devices)
            if (await push.SendAsync(d, CompanionPushMessages.KhatmaCompleted, cancellationToken) == PushDelivery.Gone) db.ReminderDevices.Remove(d);
        await db.SaveChangesAsync(cancellationToken);
    }
}
