using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sanad.Application.Common.Access;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Common.Messaging;
using Sanad.Domain.Companion;

namespace Sanad.Application.Modules.Companion;

// ── خطتي (مزامنة اختيارية بين الأجهزة) ──────────────────────────────────────
// التطبيق يعمل كاملاً دون حساب، والتقدّم محلي أولاً. من سجّل دخوله يزامن خطته: الأيام المكتملة تُدمج (اتحاد)
// فلا يضيع يوم من أي جهاز. لا يُخزَّن شيء عن حال المستخدم — لا حقل لذلك أصلاً.

public sealed record EnrollmentDto(Guid Id, Guid PlanId, string PlanKey, int PlanVersion, int DurationDays, DateTimeOffset StartedAtUtc,
    IReadOnlyList<int> CompletedDays, DateOnly? LastCompletedOn, WirdReminder? Reminder, int CurrentDay, bool IsFinished);

public sealed record MyEnrollmentDto(EnrollmentDto? Enrollment);

internal static class EnrollmentProjection
{
    public static EnrollmentDto ToDto(PlanEnrollment e) => new(e.Id, e.PlanId, e.PlanKey, e.PlanVersion, e.DurationDays, e.StartedAtUtc,
        e.CompletedDays, e.LastCompletedOn, e.Reminder, e.CurrentDay, e.IsFinished);

    public static Task<PlanEnrollment?> ActiveAsync(IApplicationDbContext db, Guid userId, CancellationToken ct) =>
        db.PlanEnrollments.FirstOrDefaultAsync(e => e.UserId == userId && e.IsActive, ct);
}

public sealed record GetMyEnrollmentQuery : IQuery<MyEnrollmentDto>;

public sealed class GetMyEnrollmentQueryHandler(IApplicationDbContext db, AccessContext access) : IRequestHandler<GetMyEnrollmentQuery, MyEnrollmentDto>
{
    public async Task<MyEnrollmentDto> Handle(GetMyEnrollmentQuery request, CancellationToken cancellationToken)
    {
        var e = await EnrollmentProjection.ActiveAsync(db, access.UserId, cancellationToken);
        return new MyEnrollmentDto(e is null ? null : EnrollmentProjection.ToDto(e));
    }
}

/// <summary>
/// بدء خطة (أو ربط خطة بدأها المستخدم على جهازه قبل الدخول: CompletedDays تُحمل معها).
/// خطة واحدة نشطة: السابقة تتوقف. لا يُبدأ إلا في المنشور من معدّ إذنه مسجَّل.
/// </summary>
public sealed record StartMyPlanCommand(Guid PlanId, WirdReminder? Reminder, List<int>? CompletedDays, DateOnly? LastCompletedOn)
    : ICommand<EnrollmentDto>;

public sealed class StartMyPlanCommandValidator : AbstractValidator<StartMyPlanCommand>
{
    public StartMyPlanCommandValidator(IDateTime clock)
    {
        RuleFor(x => x.PlanId).NotEmpty();
        RuleFor(x => x.Reminder).IsInEnum().When(x => x.Reminder is not null);
        RuleFor(x => x.CompletedDays).Must(d => d is null || d.Count <= 40).WithMessage("أيام كثيرة.");
        RuleFor(x => x.LastCompletedOn).Must(d => d is null || d <= DateOnly.FromDateTime(clock.UtcNow.UtcDateTime).AddDays(1))
            .WithMessage("تاريخ آخر ورد غير صحيح.");
    }
}

public sealed class StartMyPlanCommandHandler(IApplicationDbContext db, AccessContext access, IDateTime clock)
    : IRequestHandler<StartMyPlanCommand, EnrollmentDto>
{
    public async Task<EnrollmentDto> Handle(StartMyPlanCommand r, CancellationToken cancellationToken)
    {
        var userId = access.UserId;
        var now = clock.UtcNow;
        var plan = await db.RuqyahPlans.FirstOrDefaultAsync(p => p.Id == r.PlanId, cancellationToken);
        var author = plan is null ? null : await db.PlanAuthors.AsNoTracking().FirstOrDefaultAsync(a => a.Id == plan.AuthorId, cancellationToken);
        if (plan is null || plan.Status != PlanStatus.Published || author is null || !author.HasConsent) throw new NotFoundException("الخطة", r.PlanId);

        var current = await EnrollmentProjection.ActiveAsync(db, userId, cancellationToken);
        if (current is not null && current.PlanId == plan.Id)
        {
            // إعادة الربط من جهاز آخر: دمج لا بدء من جديد
            if (r.CompletedDays is { Count: > 0 }) current.RecordCompletedDays(r.CompletedDays, r.LastCompletedOn, now);
            if (r.Reminder is not null) current.SetReminder(r.Reminder, now);
            await db.SaveChangesAsync(cancellationToken);
            return EnrollmentProjection.ToDto(current);
        }

        current?.Stop(now);
        var e = PlanEnrollment.Start(userId, plan, r.Reminder, now);
        if (r.CompletedDays is { Count: > 0 }) e.RecordCompletedDays(r.CompletedDays, r.LastCompletedOn, now);
        db.PlanEnrollments.Add(e);
        await db.SaveChangesAsync(cancellationToken);
        return EnrollmentProjection.ToDto(e);
    }
}

/// <summary>مزامنة الأيام المكتملة من الجهاز (اتحاد مع الحساب).</summary>
public sealed record SyncMyPlanProgressCommand(Guid EnrollmentId, List<int> CompletedDays, DateOnly? LastCompletedOn) : ICommand<EnrollmentDto>;

public sealed class SyncMyPlanProgressCommandValidator : AbstractValidator<SyncMyPlanProgressCommand>
{
    public SyncMyPlanProgressCommandValidator(IDateTime clock)
    {
        RuleFor(x => x.CompletedDays).NotNull().Must(d => d.Count <= 40).WithMessage("أيام كثيرة.");
        RuleFor(x => x.LastCompletedOn).Must(d => d is null || d <= DateOnly.FromDateTime(clock.UtcNow.UtcDateTime).AddDays(1))
            .WithMessage("تاريخ آخر ورد غير صحيح.");
    }
}

public sealed class SyncMyPlanProgressCommandHandler(IApplicationDbContext db, AccessContext access, IDateTime clock)
    : IRequestHandler<SyncMyPlanProgressCommand, EnrollmentDto>
{
    public async Task<EnrollmentDto> Handle(SyncMyPlanProgressCommand r, CancellationToken cancellationToken)
    {
        var userId = access.UserId;
        // ليس للمستخدم ⇐ غير موجود (لا كشف لوجوده)
        var e = await db.PlanEnrollments.FirstOrDefaultAsync(x => x.Id == r.EnrollmentId && x.UserId == userId, cancellationToken)
                ?? throw new NotFoundException("الخطة", r.EnrollmentId);
        e.RecordCompletedDays(r.CompletedDays, r.LastCompletedOn, clock.UtcNow);
        await db.SaveChangesAsync(cancellationToken);
        return EnrollmentProjection.ToDto(e);
    }
}

public sealed record SetMyWirdReminderCommand(WirdReminder? Reminder) : ICommand<Unit>;

public sealed class SetMyWirdReminderCommandValidator : AbstractValidator<SetMyWirdReminderCommand>
{
    public SetMyWirdReminderCommandValidator() => RuleFor(x => x.Reminder).IsInEnum().When(x => x.Reminder is not null);
}

public sealed class SetMyWirdReminderCommandHandler(IApplicationDbContext db, AccessContext access, IDateTime clock)
    : IRequestHandler<SetMyWirdReminderCommand, Unit>
{
    public async Task<Unit> Handle(SetMyWirdReminderCommand r, CancellationToken cancellationToken)
    {
        var e = await EnrollmentProjection.ActiveAsync(db, access.UserId, cancellationToken) ?? throw new NotFoundException("الخطة", "الحالية");
        e.SetReminder(r.Reminder, clock.UtcNow);
        await db.SaveChangesAsync(cancellationToken);
        return Unit.Value;
    }
}

public sealed record StopMyPlanCommand : ICommand<Unit>;

public sealed class StopMyPlanCommandHandler(IApplicationDbContext db, AccessContext access, IDateTime clock) : IRequestHandler<StopMyPlanCommand, Unit>
{
    public async Task<Unit> Handle(StopMyPlanCommand r, CancellationToken cancellationToken)
    {
        var e = await EnrollmentProjection.ActiveAsync(db, access.UserId, cancellationToken);
        if (e is null) return Unit.Value;
        e.Stop(clock.UtcNow);
        await db.SaveChangesAsync(cancellationToken);
        return Unit.Value;
    }
}
