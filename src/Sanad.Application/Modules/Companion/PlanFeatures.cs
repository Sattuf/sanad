using System.Globalization;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sanad.Application.Common.Access;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Common.Messaging;
using Sanad.Domain.Common;
using Sanad.Domain.Companion;
using Sanad.Domain.Identity;

namespace Sanad.Application.Modules.Companion;

// ── خطط الرقية ومعدّوها (تطبيق «سند» للرقية الذاتية) ───────────────────────────
// العام يرى المنشور فقط، ومن معدّ إذنه مسجَّل. الإدارة (مدير محتوى بتحقق ثنائي): معدّ ← إذن مكتوب ← خطة مسودة ←
// مراجعة شرعية من مدير محتوى آخر مع إقرار فحص الأمان ← نشر. المنشور لا يُعدَّل؛ يُنشأ له إصدار جديد.

public static class CompanionCacheKeys
{
    public const string Prefix = "companion:";
    public const string PublishedPlans = Prefix + "plans";
    public static string Plan(Guid id) => Prefix + "plan:" + id.ToString("N");
}

public sealed record PlanAuthorPublicDto(Guid Id, string DisplayName, string Bio, DateOnly? ConsentDate);

public sealed record PlanSummaryDto(Guid Id, string Key, int Version, string Title, string Summary, int DurationDays, int MinutesPerDay,
    PlanAuthorPublicDto Author);

public sealed record PlanDetailDto(Guid Id, string Key, int Version, string Title, string Summary, string Contents, int DurationDays,
    int MinutesPerDay, PlanAuthorPublicDto Author, IReadOnlyList<PlanDay> Days, bool IsCurrent, DateTimeOffset? PublishedAtUtc,
    DateTimeOffset? SafetyCheckedAtUtc);

internal static class PlanProjection
{
    private static readonly StringComparer Arabic = StringComparer.Create(CultureInfo.GetCultureInfo("ar"), CompareOptions.IgnoreNonSpace);

    public static PlanAuthorPublicDto Author(PlanAuthor a) => new(a.Id, a.DisplayName, a.Bio, a.ConsentDate);

    public static PlanSummaryDto Summary(RuqyahPlan p, PlanAuthor a) =>
        new(p.Id, p.Key, p.Version, p.Title, p.Summary, p.DurationDays, p.MinutesPerDay, Author(a));

    public static PlanDetailDto Detail(RuqyahPlan p, PlanAuthor a) => new(p.Id, p.Key, p.Version, p.Title, p.Summary, p.Contents,
        p.DurationDays, p.MinutesPerDay, Author(a), p.Days, p.Status == PlanStatus.Published, p.PublishedAtUtc, p.SafetyCheckedAtUtc);

    /// <summary>بالمدة ثم أبجدياً — لا «الأفضل» ولا عدد المستخدمين (content-guardrails.md §2).</summary>
    public static IEnumerable<RuqyahPlan> Ordered(IEnumerable<RuqyahPlan> plans) =>
        plans.OrderBy(p => p.DurationDays).ThenBy(p => p.Title, Arabic);
}

[AllowAnonymousRequest]
public sealed record GetPublishedPlansQuery : IQuery<IReadOnlyList<PlanSummaryDto>>;

public sealed class GetPublishedPlansQueryHandler(IApplicationDbContext db, IDirectorySearchCache cache)
    : IRequestHandler<GetPublishedPlansQuery, IReadOnlyList<PlanSummaryDto>>
{
    public async Task<IReadOnlyList<PlanSummaryDto>> Handle(GetPublishedPlansQuery request, CancellationToken cancellationToken)
    {
        var cached = await cache.GetAsync<List<PlanSummaryDto>>(CompanionCacheKeys.PublishedPlans, cancellationToken);
        if (cached is not null) return cached;
        var plans = await db.RuqyahPlans.AsNoTracking().Where(p => p.Status == PlanStatus.Published).ToListAsync(cancellationToken);
        var authorIds = plans.Select(p => p.AuthorId).Distinct().ToList();
        var authors = (await db.PlanAuthors.AsNoTracking().Where(a => authorIds.Contains(a.Id)).ToListAsync(cancellationToken))
            .Where(a => a.HasConsent).ToDictionary(a => a.Id);
        var result = PlanProjection.Ordered(plans.Where(p => authors.ContainsKey(p.AuthorId)))
            .Select(p => PlanProjection.Summary(p, authors[p.AuthorId])).ToList();
        await cache.SetAsync(CompanionCacheKeys.PublishedPlans, result, TimeSpan.FromMinutes(10), cancellationToken);
        return result;
    }
}

/// <summary>تفاصيل خطة منشورة أو مستبدلة (لمن سجّل في إصدار سابق). المسحوبة والمسودات لا تُخدم.</summary>
[AllowAnonymousRequest]
public sealed record GetPublishedPlanQuery(Guid Id) : IQuery<PlanDetailDto>;

public sealed class GetPublishedPlanQueryHandler(IApplicationDbContext db, IDirectorySearchCache cache)
    : IRequestHandler<GetPublishedPlanQuery, PlanDetailDto>
{
    public async Task<PlanDetailDto> Handle(GetPublishedPlanQuery request, CancellationToken cancellationToken)
    {
        var key = CompanionCacheKeys.Plan(request.Id);
        var cached = await cache.GetAsync<PlanDetailDto>(key, cancellationToken);
        if (cached is not null) return cached;
        var plan = await db.RuqyahPlans.AsNoTracking().FirstOrDefaultAsync(p => p.Id == request.Id, cancellationToken);
        var author = plan is null ? null : await db.PlanAuthors.AsNoTracking().FirstOrDefaultAsync(a => a.Id == plan.AuthorId, cancellationToken);
        if (plan is null || !plan.IsServable || author is null || !author.HasConsent) throw new NotFoundException("الخطة", request.Id);
        var dto = PlanProjection.Detail(plan, author);
        await cache.SetAsync(key, dto, TimeSpan.FromMinutes(10), cancellationToken);
        return dto;
    }
}

// ── المعدّون (إدارة) ─────────────────────────────────────────────────────────

public sealed record PlanAuthorAdminDto(Guid Id, string DisplayName, string Bio, bool HasConsent, string? ConsentRef, DateOnly? ConsentDate,
    int PublishedPlans, DateTimeOffset CreatedAtUtc);

[RequireRoles(SanadRoles.ContentManager, RequireMfa = true)]
public sealed record GetPlanAuthorsQuery : IQuery<IReadOnlyList<PlanAuthorAdminDto>>;

public sealed class GetPlanAuthorsQueryHandler(IApplicationDbContext db) : IRequestHandler<GetPlanAuthorsQuery, IReadOnlyList<PlanAuthorAdminDto>>
{
    public async Task<IReadOnlyList<PlanAuthorAdminDto>> Handle(GetPlanAuthorsQuery request, CancellationToken cancellationToken)
    {
        var authors = await db.PlanAuthors.AsNoTracking().ToListAsync(cancellationToken);
        var counts = (await db.RuqyahPlans.AsNoTracking().Where(p => p.Status == PlanStatus.Published).Select(p => p.AuthorId).ToListAsync(cancellationToken))
            .GroupBy(x => x).ToDictionary(g => g.Key, g => g.Count());
        return authors.OrderBy(a => a.DisplayName, StringComparer.Ordinal)
            .Select(a => AuthorAdmin(a, counts.GetValueOrDefault(a.Id))).ToList();
    }

    internal static PlanAuthorAdminDto AuthorAdmin(PlanAuthor a, int published) =>
        new(a.Id, a.DisplayName, a.Bio, a.HasConsent, a.ConsentRef, a.ConsentDate, published, a.CreatedAtUtc);
}

public sealed class PlanAuthorInputValidator<T> : AbstractValidator<T> where T : IPlanAuthorInput
{
    public PlanAuthorInputValidator()
    {
        RuleFor(x => x.DisplayName).NotEmpty().MaximumLength(80);
        RuleFor(x => x.Bio).NotEmpty().MaximumLength(300);
    }
}

public interface IPlanAuthorInput
{
    string DisplayName { get; }
    string Bio { get; }
}

[RequireRoles(SanadRoles.ContentManager, RequireMfa = true)]
public sealed record CreatePlanAuthorCommand(string DisplayName, string Bio) : ICommand<PlanAuthorAdminDto>, IPlanAuthorInput;

public sealed class CreatePlanAuthorCommandValidator : AbstractValidator<CreatePlanAuthorCommand>
{
    public CreatePlanAuthorCommandValidator() => Include(new PlanAuthorInputValidator<CreatePlanAuthorCommand>());
}

public sealed class CreatePlanAuthorCommandHandler(IApplicationDbContext db, AccessContext access, IContentPolicyChecker policy, IDateTime clock)
    : IRequestHandler<CreatePlanAuthorCommand, PlanAuthorAdminDto>
{
    public async Task<PlanAuthorAdminDto> Handle(CreatePlanAuthorCommand r, CancellationToken cancellationToken)
    {
        var a = PlanAuthor.Create(r.DisplayName, r.Bio, access.UserId, policy, clock.UtcNow);
        db.PlanAuthors.Add(a);
        await db.SaveChangesAsync(cancellationToken);
        return GetPlanAuthorsQueryHandler.AuthorAdmin(a, 0);
    }
}

[RequireRoles(SanadRoles.ContentManager, RequireMfa = true)]
public sealed record UpdatePlanAuthorCommand(Guid Id, string DisplayName, string Bio) : ICommand<PlanAuthorAdminDto>, IPlanAuthorInput;

public sealed class UpdatePlanAuthorCommandValidator : AbstractValidator<UpdatePlanAuthorCommand>
{
    public UpdatePlanAuthorCommandValidator() => Include(new PlanAuthorInputValidator<UpdatePlanAuthorCommand>());
}

public sealed class UpdatePlanAuthorCommandHandler(IApplicationDbContext db, IContentPolicyChecker policy, IDateTime clock, IDirectorySearchCache cache)
    : IRequestHandler<UpdatePlanAuthorCommand, PlanAuthorAdminDto>
{
    public async Task<PlanAuthorAdminDto> Handle(UpdatePlanAuthorCommand r, CancellationToken cancellationToken)
    {
        var a = await db.PlanAuthors.FirstOrDefaultAsync(x => x.Id == r.Id, cancellationToken) ?? throw new NotFoundException("المعدّ", r.Id);
        a.UpdateProfile(r.DisplayName, r.Bio, policy, clock.UtcNow);
        await db.SaveChangesAsync(cancellationToken);
        await cache.InvalidateAsync(CompanionCacheKeys.Prefix, cancellationToken);
        var published = await db.RuqyahPlans.CountAsync(p => p.AuthorId == a.Id && p.Status == PlanStatus.Published, cancellationToken);
        return GetPlanAuthorsQueryHandler.AuthorAdmin(a, published);
    }
}

/// <summary>تسجيل الإذن المكتوب: مرجع الوثيقة (رقم أرشيف أو معرّف ملف الإذن) وتاريخها. يسجّله مدير محتوى ويُدقَّق تلقائياً.</summary>
[RequireRoles(SanadRoles.ContentManager, RequireMfa = true)]
public sealed record RecordAuthorConsentCommand(Guid Id, string ConsentRef, DateOnly ConsentDate) : ICommand<PlanAuthorAdminDto>;

public sealed class RecordAuthorConsentCommandValidator : AbstractValidator<RecordAuthorConsentCommand>
{
    public RecordAuthorConsentCommandValidator()
    {
        RuleFor(x => x.ConsentRef).NotEmpty().MaximumLength(100).WithMessage("مرجع الإذن المكتوب مطلوب.");
        RuleFor(x => x.ConsentDate).NotEmpty();
    }
}

public sealed class RecordAuthorConsentCommandHandler(IApplicationDbContext db, AccessContext access, IDateTime clock, IDirectorySearchCache cache)
    : IRequestHandler<RecordAuthorConsentCommand, PlanAuthorAdminDto>
{
    public async Task<PlanAuthorAdminDto> Handle(RecordAuthorConsentCommand r, CancellationToken cancellationToken)
    {
        var a = await db.PlanAuthors.FirstOrDefaultAsync(x => x.Id == r.Id, cancellationToken) ?? throw new NotFoundException("المعدّ", r.Id);
        a.RecordConsent(r.ConsentRef, r.ConsentDate, access.UserId, clock.UtcNow);
        await db.SaveChangesAsync(cancellationToken);
        await cache.InvalidateAsync(CompanionCacheKeys.Prefix, cancellationToken);
        var published = await db.RuqyahPlans.CountAsync(p => p.AuthorId == a.Id && p.Status == PlanStatus.Published, cancellationToken);
        return GetPlanAuthorsQueryHandler.AuthorAdmin(a, published);
    }
}

/// <summary>سحب الإذن: تختفي خطط المعدّ من العرض فوراً (العرض العام يشترط الإذن).</summary>
[RequireRoles(SanadRoles.ContentManager, RequireMfa = true)]
public sealed record RevokeAuthorConsentCommand(Guid Id) : ICommand<PlanAuthorAdminDto>;

public sealed class RevokeAuthorConsentCommandHandler(IApplicationDbContext db, IDateTime clock, IDirectorySearchCache cache)
    : IRequestHandler<RevokeAuthorConsentCommand, PlanAuthorAdminDto>
{
    public async Task<PlanAuthorAdminDto> Handle(RevokeAuthorConsentCommand r, CancellationToken cancellationToken)
    {
        var a = await db.PlanAuthors.FirstOrDefaultAsync(x => x.Id == r.Id, cancellationToken) ?? throw new NotFoundException("المعدّ", r.Id);
        a.RevokeConsent(clock.UtcNow);
        await db.SaveChangesAsync(cancellationToken);
        await cache.InvalidateAsync(CompanionCacheKeys.Prefix, cancellationToken);
        return GetPlanAuthorsQueryHandler.AuthorAdmin(a, 0);
    }
}

// ── الخطط (إدارة) ────────────────────────────────────────────────────────────

public sealed record PlanAdminDto(Guid Id, string Key, int Version, string Title, string Summary, string Contents, Guid AuthorId,
    string AuthorName, bool AuthorHasConsent, int DurationDays, int MinutesPerDay, IReadOnlyList<PlanDay> Days, string Status,
    bool IsMine, bool CanReview, string? ReviewNote, string? WithdrawReason, DateTimeOffset? PublishedAtUtc, DateTimeOffset? SafetyCheckedAtUtc,
    DateTimeOffset CreatedAtUtc);

internal static class PlanAdminProjection
{
    public static PlanAdminDto ToAdmin(RuqyahPlan p, PlanAuthor? a, Guid me) => new(p.Id, p.Key, p.Version, p.Title, p.Summary, p.Contents,
        p.AuthorId, a?.DisplayName ?? "—", a?.HasConsent ?? false, p.DurationDays, p.MinutesPerDay, p.Days, p.Status.ToString(),
        p.CreatedByUserId == me, p.Status == PlanStatus.InReview && p.CreatedByUserId != me, p.ReviewNote, p.WithdrawReason,
        p.PublishedAtUtc, p.SafetyCheckedAtUtc, p.CreatedAtUtc);

    public static async Task<PlanAdminDto> LoadAsync(IApplicationDbContext db, RuqyahPlan p, Guid me, CancellationToken ct) =>
        ToAdmin(p, await db.PlanAuthors.AsNoTracking().FirstOrDefaultAsync(a => a.Id == p.AuthorId, ct), me);
}

[RequireRoles(SanadRoles.ContentManager, RequireMfa = true)]
public sealed record GetAdminPlansQuery : IQuery<IReadOnlyList<PlanAdminDto>>;

public sealed class GetAdminPlansQueryHandler(IApplicationDbContext db, AccessContext access) : IRequestHandler<GetAdminPlansQuery, IReadOnlyList<PlanAdminDto>>
{
    public async Task<IReadOnlyList<PlanAdminDto>> Handle(GetAdminPlansQuery request, CancellationToken cancellationToken)
    {
        var me = access.UserId;
        var authors = await db.PlanAuthors.AsNoTracking().ToDictionaryAsync(a => a.Id, cancellationToken);
        return (await db.RuqyahPlans.AsNoTracking().ToListAsync(cancellationToken))
            .OrderBy(p => p.Key, StringComparer.Ordinal).ThenByDescending(p => p.Version)
            .Select(p => PlanAdminProjection.ToAdmin(p, authors.GetValueOrDefault(p.AuthorId), me)).ToList();
    }
}

public interface IPlanInput
{
    string Title { get; }
    string Summary { get; }
    string Contents { get; }
    Guid AuthorId { get; }
    int DurationDays { get; }
    int MinutesPerDay { get; }
    List<PlanDay> Days { get; }
}

public sealed class PlanInputValidator<T> : AbstractValidator<T> where T : IPlanInput
{
    public PlanInputValidator()
    {
        RuleFor(x => x.Title).NotEmpty().MaximumLength(80);
        RuleFor(x => x.Summary).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Contents).NotEmpty().MaximumLength(600);
        RuleFor(x => x.AuthorId).NotEmpty().WithMessage("اختر المعدّ.");
        RuleFor(x => x.DurationDays).Must(d => PlanDurations.Allowed.Contains(d)).WithMessage("المدة 7 أو 14 أو 21 أو 40 يوماً.");
        RuleFor(x => x.MinutesPerDay).InclusiveBetween(1, 120);
        RuleFor(x => x.Days).NotNull().Must((x, d) => d.Count == x.DurationDays).WithMessage("عدد أيام الورد يساوي المدة.");
    }
}

[RequireRoles(SanadRoles.ContentManager, RequireMfa = true)]
public sealed record CreatePlanCommand(string Key, string Title, string Summary, string Contents, Guid AuthorId, int DurationDays,
    int MinutesPerDay, List<PlanDay> Days) : ICommand<PlanAdminDto>, IPlanInput;

public sealed class CreatePlanCommandValidator : AbstractValidator<CreatePlanCommand>
{
    public CreatePlanCommandValidator()
    {
        Include(new PlanInputValidator<CreatePlanCommand>());
        RuleFor(x => x.Key).NotEmpty().MaximumLength(60).Matches("^[a-z0-9][a-z0-9-]{2,59}$")
            .WithMessage("المعرّف: حروف لاتينية صغيرة وأرقام وشرطات.");
    }
}

public sealed class CreatePlanCommandHandler(IApplicationDbContext db, AccessContext access, IContentPolicyChecker policy, IDateTime clock)
    : IRequestHandler<CreatePlanCommand, PlanAdminDto>
{
    public async Task<PlanAdminDto> Handle(CreatePlanCommand r, CancellationToken cancellationToken)
    {
        if (await db.RuqyahPlans.AnyAsync(p => p.Key == r.Key, cancellationToken))
            throw new ConflictException("يوجد خطة بهذا المعرّف؛ أنشئ لها إصداراً جديداً بدلاً من ذلك.");
        if (!await db.PlanAuthors.AnyAsync(a => a.Id == r.AuthorId, cancellationToken)) throw new NotFoundException("المعدّ", r.AuthorId);
        var plan = RuqyahPlan.Create(r.Key, r.Title, r.Summary, r.Contents, r.AuthorId, r.DurationDays, r.MinutesPerDay, r.Days,
            access.UserId, policy, clock.UtcNow);
        db.RuqyahPlans.Add(plan);
        await db.SaveChangesAsync(cancellationToken);
        return await PlanAdminProjection.LoadAsync(db, plan, access.UserId, cancellationToken);
    }
}

[RequireRoles(SanadRoles.ContentManager, RequireMfa = true)]
public sealed record UpdatePlanCommand(Guid Id, string Title, string Summary, string Contents, Guid AuthorId, int DurationDays,
    int MinutesPerDay, List<PlanDay> Days) : ICommand<PlanAdminDto>, IPlanInput;

public sealed class UpdatePlanCommandValidator : AbstractValidator<UpdatePlanCommand>
{
    public UpdatePlanCommandValidator() => Include(new PlanInputValidator<UpdatePlanCommand>());
}

public sealed class UpdatePlanCommandHandler(IApplicationDbContext db, AccessContext access, IContentPolicyChecker policy, IDateTime clock)
    : IRequestHandler<UpdatePlanCommand, PlanAdminDto>
{
    public async Task<PlanAdminDto> Handle(UpdatePlanCommand r, CancellationToken cancellationToken)
    {
        var plan = await db.RuqyahPlans.FirstOrDefaultAsync(p => p.Id == r.Id, cancellationToken) ?? throw new NotFoundException("الخطة", r.Id);
        if (plan.CreatedByUserId != access.UserId) throw new ForbiddenAccessException("يعدّل المسودةَ منشئُها؛ والمراجع يعيدها بملاحظة.");
        if (!await db.PlanAuthors.AnyAsync(a => a.Id == r.AuthorId, cancellationToken)) throw new NotFoundException("المعدّ", r.AuthorId);
        plan.Update(r.Title, r.Summary, r.Contents, r.AuthorId, r.DurationDays, r.MinutesPerDay, r.Days, policy, clock.UtcNow);
        await db.SaveChangesAsync(cancellationToken);
        return await PlanAdminProjection.LoadAsync(db, plan, access.UserId, cancellationToken);
    }
}

/// <summary>إصدار جديد من خطة منشورة — مسودة يعدّلها من أنشأها، والمنشور يبقى معروضاً حتى يُنشر الجديد.</summary>
[RequireRoles(SanadRoles.ContentManager, RequireMfa = true)]
public sealed record CreatePlanVersionCommand(Guid Id) : ICommand<PlanAdminDto>;

public sealed class CreatePlanVersionCommandHandler(IApplicationDbContext db, AccessContext access, IDateTime clock)
    : IRequestHandler<CreatePlanVersionCommand, PlanAdminDto>
{
    public async Task<PlanAdminDto> Handle(CreatePlanVersionCommand r, CancellationToken cancellationToken)
    {
        var plan = await db.RuqyahPlans.FirstOrDefaultAsync(p => p.Id == r.Id, cancellationToken) ?? throw new NotFoundException("الخطة", r.Id);
        if (await db.RuqyahPlans.AnyAsync(p => p.Key == plan.Key && (p.Status == PlanStatus.Draft || p.Status == PlanStatus.InReview), cancellationToken))
            throw new ConflictException("يوجد إصدار قيد الإعداد لهذه الخطة.");
        var next = plan.NewVersion(access.UserId, clock.UtcNow);
        db.RuqyahPlans.Add(next);
        await db.SaveChangesAsync(cancellationToken);
        return await PlanAdminProjection.LoadAsync(db, next, access.UserId, cancellationToken);
    }
}

public enum PlanReviewAction { Submit, Approve, Return }

[RequireRoles(SanadRoles.ContentManager, RequireMfa = true)]
public sealed record ReviewPlanCommand(Guid Id, PlanReviewAction Action, string? Reason, SafetyAttestation? Safety) : ICommand<PlanAdminDto>;

public sealed class ReviewPlanCommandValidator : AbstractValidator<ReviewPlanCommand>
{
    public ReviewPlanCommandValidator()
    {
        RuleFor(x => x.Action).IsInEnum();
        RuleFor(x => x.Reason).NotEmpty().MaximumLength(500).When(x => x.Action == PlanReviewAction.Return).WithMessage("اكتب سبب الإعادة.");
        RuleFor(x => x.Safety).NotNull().When(x => x.Action == PlanReviewAction.Approve).WithMessage("أكمل فحص الأمان قبل النشر.");
    }
}

public sealed class ReviewPlanCommandHandler(IApplicationDbContext db, AccessContext access, IContentPolicyChecker policy, IDateTime clock,
    IDirectorySearchCache cache) : IRequestHandler<ReviewPlanCommand, PlanAdminDto>
{
    public async Task<PlanAdminDto> Handle(ReviewPlanCommand r, CancellationToken cancellationToken)
    {
        var plan = await db.RuqyahPlans.FirstOrDefaultAsync(p => p.Id == r.Id, cancellationToken) ?? throw new NotFoundException("الخطة", r.Id);
        var me = access.UserId;
        var now = clock.UtcNow;
        switch (r.Action)
        {
            case PlanReviewAction.Submit:
                plan.SubmitForReview(me, now);
                break;
            case PlanReviewAction.Approve:
                var author = await db.PlanAuthors.FirstOrDefaultAsync(a => a.Id == plan.AuthorId, cancellationToken)
                             ?? throw new NotFoundException("المعدّ", plan.AuthorId);
                plan.Approve(me, author, r.Safety!, policy, now);
                foreach (var old in await db.RuqyahPlans.Where(p => p.Key == plan.Key && p.Id != plan.Id && p.Status == PlanStatus.Published)
                             .ToListAsync(cancellationToken))
                    old.Supersede(now);
                break;
            default:
                plan.ReturnToDraft(me, r.Reason!, now);
                break;
        }
        await db.SaveChangesAsync(cancellationToken);
        await cache.InvalidateAsync(CompanionCacheKeys.Prefix, cancellationToken);
        return await PlanAdminProjection.LoadAsync(db, plan, me, cancellationToken);
    }
}

/// <summary>سحب خطة من العرض (منشورة أو مستبدلة) لسبب أمان أو غيره. يُسجَّل في التدقيق.</summary>
[RequireRoles(SanadRoles.ContentManager, RequireMfa = true)]
public sealed record WithdrawPlanCommand(Guid Id, string Reason) : ICommand<PlanAdminDto>;

public sealed class WithdrawPlanCommandValidator : AbstractValidator<WithdrawPlanCommand>
{
    public WithdrawPlanCommandValidator() => RuleFor(x => x.Reason).NotEmpty().MaximumLength(300);
}

public sealed class WithdrawPlanCommandHandler(IApplicationDbContext db, AccessContext access, IDateTime clock, IDirectorySearchCache cache)
    : IRequestHandler<WithdrawPlanCommand, PlanAdminDto>
{
    public async Task<PlanAdminDto> Handle(WithdrawPlanCommand r, CancellationToken cancellationToken)
    {
        var plan = await db.RuqyahPlans.FirstOrDefaultAsync(p => p.Id == r.Id, cancellationToken) ?? throw new NotFoundException("الخطة", r.Id);
        plan.Withdraw(r.Reason, clock.UtcNow);
        await db.SaveChangesAsync(cancellationToken);
        await cache.InvalidateAsync(CompanionCacheKeys.Prefix, cancellationToken);
        return await PlanAdminProjection.LoadAsync(db, plan, access.UserId, cancellationToken);
    }
}

[RequireRoles(SanadRoles.ContentManager, RequireMfa = true)]
public sealed record DeletePlanDraftCommand(Guid Id) : ICommand<Unit>;

public sealed class DeletePlanDraftCommandHandler(IApplicationDbContext db, AccessContext access) : IRequestHandler<DeletePlanDraftCommand, Unit>
{
    public async Task<Unit> Handle(DeletePlanDraftCommand r, CancellationToken cancellationToken)
    {
        var plan = await db.RuqyahPlans.FirstOrDefaultAsync(p => p.Id == r.Id, cancellationToken) ?? throw new NotFoundException("الخطة", r.Id);
        if (plan.Status != PlanStatus.Draft) throw new ConflictException("تُحذف المسودات فقط؛ المنشور يُسحب ولا يُحذف.");
        if (plan.CreatedByUserId != access.UserId) throw new ForbiddenAccessException("يحذف المسودةَ منشئُها.");
        db.RuqyahPlans.Remove(plan);
        await db.SaveChangesAsync(cancellationToken);
        return Unit.Value;
    }
}
