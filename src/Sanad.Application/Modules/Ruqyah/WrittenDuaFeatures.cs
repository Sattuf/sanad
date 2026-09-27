using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sanad.Application.Common.Access;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Common.Messaging;
using Sanad.Domain.Common;
using Sanad.Domain.Identity;
using Sanad.Domain.Ruqyah;

namespace Sanad.Application.Modules.Ruqyah;

// ── الأدعية المكتوبة المُدارة ────────────────────────────────────────────────
// النصوص الأساسية ثابتة في الواجهة (مراجَعة مع الكود). هذه الأدعية يضيفها فريق المحتوى لاحقاً عبر مسار:
// مسودة ← مراجعة ← نشر بيد مدير محتوى آخر. العام يرى المنشور فقط.

public static class RuqyahCacheKeys
{
    public const string Prefix = "ruqyah:";
    public const string PublishedDuas = Prefix + "duas";
}

public sealed record PublicWrittenDuaDto(Guid Id, string CollectionId, string Title, string Text, string Source, string? Note, int Repeat, int SortOrder);

public sealed record WrittenDuaAdminDto(Guid Id, string CollectionId, string Title, string Text, string Source, string? Note, int Repeat, int SortOrder,
    string Status, bool IsMine, bool CanReview, string? ReviewNote, DateTimeOffset? PublishedAtUtc, DateTimeOffset CreatedAtUtc);

[AllowAnonymousRequest]
public sealed record GetPublishedDuasQuery : IQuery<IReadOnlyList<PublicWrittenDuaDto>>;

public sealed class GetPublishedDuasQueryHandler(IApplicationDbContext db, IDirectorySearchCache cache)
    : IRequestHandler<GetPublishedDuasQuery, IReadOnlyList<PublicWrittenDuaDto>>
{
    public async Task<IReadOnlyList<PublicWrittenDuaDto>> Handle(GetPublishedDuasQuery request, CancellationToken cancellationToken)
    {
        var cached = await cache.GetAsync<List<PublicWrittenDuaDto>>(RuqyahCacheKeys.PublishedDuas, cancellationToken);
        if (cached is not null) return cached;
        var result = (await db.WrittenDuas.AsNoTracking().Where(d => d.Status == WrittenDuaStatus.Published).ToListAsync(cancellationToken))
            .OrderBy(d => d.CollectionId, StringComparer.Ordinal).ThenBy(d => d.SortOrder).ThenBy(d => d.CreatedAtUtc)
            .Select(d => new PublicWrittenDuaDto(d.Id, d.CollectionId, d.Title, d.Text, d.Source, d.Note, d.Repeat, d.SortOrder))
            .ToList();
        await cache.SetAsync(RuqyahCacheKeys.PublishedDuas, result, TimeSpan.FromMinutes(10), cancellationToken);
        return result;
    }
}

[RequireRoles(SanadRoles.ContentManager, RequireMfa = true)]
public sealed record GetAdminDuasQuery : IQuery<IReadOnlyList<WrittenDuaAdminDto>>;

public sealed class GetAdminDuasQueryHandler(IApplicationDbContext db, AccessContext access) : IRequestHandler<GetAdminDuasQuery, IReadOnlyList<WrittenDuaAdminDto>>
{
    public async Task<IReadOnlyList<WrittenDuaAdminDto>> Handle(GetAdminDuasQuery request, CancellationToken cancellationToken)
    {
        var me = access.UserId;
        return (await db.WrittenDuas.AsNoTracking().ToListAsync(cancellationToken))
            .OrderBy(d => d.Status).ThenBy(d => d.CollectionId, StringComparer.Ordinal).ThenBy(d => d.SortOrder)
            .Select(d => WrittenDuaProjection.ToAdmin(d, me)).ToList();
    }
}

internal static class WrittenDuaProjection
{
    public static WrittenDuaAdminDto ToAdmin(WrittenDua d, Guid me) => new(d.Id, d.CollectionId, d.Title, d.Text, d.Source, d.Note, d.Repeat,
        d.SortOrder, d.Status.ToString(), d.AuthorUserId == me, d.Status == WrittenDuaStatus.InReview && d.AuthorUserId != me, d.ReviewNote,
        d.PublishedAtUtc, d.CreatedAtUtc);
}

public abstract class WrittenDuaInputValidator<T> : AbstractValidator<T> where T : IWrittenDuaInput
{
    protected WrittenDuaInputValidator()
    {
        RuleFor(x => x.CollectionId).NotEmpty().MaximumLength(50).Matches("^[a-z0-9][a-z0-9-]*$").WithMessage("اختر المجموعة.");
        RuleFor(x => x.Title).NotEmpty().MaximumLength(150);
        RuleFor(x => x.Text).NotEmpty().MaximumLength(3000);
        RuleFor(x => x.Source).NotEmpty().MaximumLength(300).WithMessage("التخريج مطلوب.");
        RuleFor(x => x.Note).MaximumLength(1000);
        RuleFor(x => x.Repeat).InclusiveBetween(1, 1000);
        RuleFor(x => x.SortOrder).InclusiveBetween(0, 10_000);
    }
}

public interface IWrittenDuaInput
{
    string CollectionId { get; }
    string Title { get; }
    string Text { get; }
    string Source { get; }
    string? Note { get; }
    int Repeat { get; }
    int SortOrder { get; }
}

[RequireRoles(SanadRoles.ContentManager, RequireMfa = true)]
public sealed record CreateWrittenDuaCommand(string CollectionId, string Title, string Text, string Source, string? Note, int Repeat, int SortOrder)
    : ICommand<WrittenDuaAdminDto>, IWrittenDuaInput;

public sealed class CreateWrittenDuaCommandValidator : WrittenDuaInputValidator<CreateWrittenDuaCommand>;

public sealed class CreateWrittenDuaCommandHandler(IApplicationDbContext db, AccessContext access, IContentPolicyChecker policy, IDateTime clock)
    : IRequestHandler<CreateWrittenDuaCommand, WrittenDuaAdminDto>
{
    public async Task<WrittenDuaAdminDto> Handle(CreateWrittenDuaCommand r, CancellationToken cancellationToken)
    {
        var dua = WrittenDua.Create(r.CollectionId, r.Title, r.Text, r.Source, r.Note, r.Repeat, r.SortOrder, access.UserId, policy, clock.UtcNow);
        db.WrittenDuas.Add(dua);
        await db.SaveChangesAsync(cancellationToken);
        return WrittenDuaProjection.ToAdmin(dua, access.UserId);
    }
}

[RequireRoles(SanadRoles.ContentManager, RequireMfa = true)]
public sealed record UpdateWrittenDuaCommand(Guid Id, string CollectionId, string Title, string Text, string Source, string? Note, int Repeat, int SortOrder)
    : ICommand<WrittenDuaAdminDto>, IWrittenDuaInput;

public sealed class UpdateWrittenDuaCommandValidator : WrittenDuaInputValidator<UpdateWrittenDuaCommand>;

public sealed class UpdateWrittenDuaCommandHandler(IApplicationDbContext db, AccessContext access, IContentPolicyChecker policy, IDateTime clock,
    IDirectorySearchCache cache) : IRequestHandler<UpdateWrittenDuaCommand, WrittenDuaAdminDto>
{
    public async Task<WrittenDuaAdminDto> Handle(UpdateWrittenDuaCommand r, CancellationToken cancellationToken)
    {
        var dua = await db.WrittenDuas.FirstOrDefaultAsync(d => d.Id == r.Id, cancellationToken) ?? throw new NotFoundException("الدعاء", r.Id);
        var wasPublished = dua.Status == WrittenDuaStatus.Published;
        dua.Update(r.CollectionId, r.Title, r.Text, r.Source, r.Note, r.Repeat, r.SortOrder, policy, clock.UtcNow);
        await db.SaveChangesAsync(cancellationToken);
        if (wasPublished) await cache.InvalidateAsync(RuqyahCacheKeys.Prefix, cancellationToken);
        return WrittenDuaProjection.ToAdmin(dua, access.UserId);
    }
}

public enum WrittenDuaAction { Submit, Approve, Return }

/// <summary>Reason مطلوب عند الإعادة (Return) فقط: يراه الكاتب ليصحّح النص أو التخريج.</summary>
[RequireRoles(SanadRoles.ContentManager, RequireMfa = true)]
public sealed record ReviewWrittenDuaCommand(Guid Id, WrittenDuaAction Action, string? Reason) : ICommand<WrittenDuaAdminDto>;

public sealed class ReviewWrittenDuaCommandValidator : AbstractValidator<ReviewWrittenDuaCommand>
{
    public ReviewWrittenDuaCommandValidator()
    {
        RuleFor(x => x.Action).IsInEnum();
        RuleFor(x => x.Reason).NotEmpty().MaximumLength(500).When(x => x.Action == WrittenDuaAction.Return).WithMessage("اكتب سبب الإعادة.");
    }
}

public sealed class ReviewWrittenDuaCommandHandler(IApplicationDbContext db, AccessContext access, IContentPolicyChecker policy, IDateTime clock,
    IDirectorySearchCache cache) : IRequestHandler<ReviewWrittenDuaCommand, WrittenDuaAdminDto>
{
    public async Task<WrittenDuaAdminDto> Handle(ReviewWrittenDuaCommand r, CancellationToken cancellationToken)
    {
        var dua = await db.WrittenDuas.FirstOrDefaultAsync(d => d.Id == r.Id, cancellationToken) ?? throw new NotFoundException("الدعاء", r.Id);
        var me = access.UserId;
        switch (r.Action)
        {
            case WrittenDuaAction.Submit:
                if (dua.AuthorUserId != me) throw new ForbiddenAccessException("يرسل الدعاءَ للمراجعة كاتبُه.");
                dua.SubmitForReview(clock.UtcNow);
                break;
            case WrittenDuaAction.Approve:
                dua.Approve(me, policy, clock.UtcNow);
                break;
            default:
                dua.ReturnToDraft(me, r.Reason!, clock.UtcNow);
                break;
        }
        await db.SaveChangesAsync(cancellationToken);
        await cache.InvalidateAsync(RuqyahCacheKeys.Prefix, cancellationToken);
        return WrittenDuaProjection.ToAdmin(dua, me);
    }
}

[RequireRoles(SanadRoles.ContentManager, RequireMfa = true)]
public sealed record DeleteWrittenDuaCommand(Guid Id) : ICommand<Unit>;

public sealed class DeleteWrittenDuaCommandHandler(IApplicationDbContext db) : IRequestHandler<DeleteWrittenDuaCommand, Unit>
{
    public async Task<Unit> Handle(DeleteWrittenDuaCommand r, CancellationToken cancellationToken)
    {
        var dua = await db.WrittenDuas.FirstOrDefaultAsync(d => d.Id == r.Id, cancellationToken) ?? throw new NotFoundException("الدعاء", r.Id);
        if (dua.Status == WrittenDuaStatus.Published) throw new ConflictException("أعد الدعاء المنشور إلى المسودة أولاً ثم احذفه.");
        db.WrittenDuas.Remove(dua);
        await db.SaveChangesAsync(cancellationToken);
        return Unit.Value;
    }
}
