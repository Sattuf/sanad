using System.Security.Cryptography;
using System.Text;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sanad.Application.Common.Access;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Common.Messaging;
using Sanad.Domain.Common;
using Sanad.Domain.Companion;

namespace Sanad.Application.Modules.Companion;

// ── الختمة (فردية أو جماعية برابط دعوة) ─────────────────────────────────────
// الختمة الفردية تعمل محلياً دون حساب؛ هنا للمزامنة. الجماعية تحتاج حساباً لكل عضو.
// لا يُكشف معرّف حساب أي عضو لغيره: يُعرض بمفتاح مشتق خاص بالختمة. النيّة مشفّرة ولا يراها إلا الأعضاء،
// ولا تظهر في معاينة الدعوة ولا في أي إشعار. غير العضو يُعامَل كأن الختمة غير موجودة.

public sealed record KhatmaMemberDto(string MemberKey, string DisplayName, bool IsMe, bool IsOwner, int AssignedJuz, int DoneJuz);

public sealed record KhatmaJuzDto(int Index, string? MemberKey, bool IsMine, bool Done);

public sealed record KhatmaDto(Guid Id, KhatmaMode Mode, string Title, string? Intention, bool IsOwner, int Round, DateOnly? TargetDate,
    DateTimeOffset? CompletedAtUtc, int DoneCount, IReadOnlyList<KhatmaMemberDto> Members, IReadOnlyList<KhatmaJuzDto> Juz, string? InviteCode,
    DateTimeOffset? UpdatedAtUtc);

/// <summary>ما يراه المدعوّ قبل الانضمام: العنوان وعدد الأعضاء فقط — لا النيّة ولا الأسماء.</summary>
public sealed record KhatmaInvitePreviewDto(string Title, int MemberCount, int DoneCount, bool AlreadyMember, Guid? KhatmaId);

internal static class KhatmaCodes
{
    private const string Alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    public const int Length = 10;

    /// <summary>رمز دعوة عشوائي من مولّد تشفيري (~49 بت) — بلا أحرف ملتبسة (0/O، 1/I/L).</summary>
    public static string NewCode() => string.Create(Length, 0, (span, _) =>
    {
        for (var i = 0; i < span.Length; i++) span[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
    });

    public static string Normalize(string code) => new((code ?? string.Empty).Trim().ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());

    public static bool IsWellFormed(string code)
    {
        var n = Normalize(code);
        return n.Length == Length && n.All(c => Alphabet.Contains(c));
    }

    public static string Hash(string code) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes("sanad-khatma:" + Normalize(code))));

    /// <summary>مفتاح العضو داخل ختمة واحدة: ثابت، ولا يُستنتج منه معرّف الحساب ولا يربط العضو بين ختمتين.</summary>
    public static string MemberKey(Guid khatmaId, Guid userId) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{khatmaId:N}:{userId:N}")))[..16].ToLowerInvariant();
}

internal static class KhatmaProjection
{
    public static KhatmaDto ToDto(Khatma k, Guid me, IFieldEncryptor encryptor)
    {
        string Key(Guid uid) => KhatmaCodes.MemberKey(k.Id, uid);
        var members = k.Members.OrderBy(m => m.JoinedAtUtc).Select(m => new KhatmaMemberDto(Key(m.UserId), m.DisplayName, m.UserId == me,
            m.UserId == k.OwnerUserId, k.Juz.Count(j => j.AssigneeUserId == m.UserId), k.Juz.Count(j => j.AssigneeUserId == m.UserId && j.IsDone))).ToList();
        var juz = k.Juz.OrderBy(j => j.Index).Select(j => new KhatmaJuzDto(j.Index, j.AssigneeUserId is { } a ? Key(a) : null,
            j.AssigneeUserId == me, j.IsDone)).ToList();
        var isOwner = k.OwnerUserId == me;
        return new KhatmaDto(k.Id, k.Mode, k.Title, k.IntentionEncrypted is null ? null : encryptor.Decrypt(k.IntentionEncrypted), isOwner,
            k.Round, k.TargetDate, k.CompletedAtUtc, k.DoneCount, members, juz,
            isOwner && k.InviteCodeEncrypted is not null ? encryptor.Decrypt(k.InviteCodeEncrypted) : null, k.UpdatedAtUtc);
    }

    /// <summary>الختمة لعضو فقط؛ غيره يراها غير موجودة.</summary>
    public static async Task<Khatma> LoadAsMemberAsync(IApplicationDbContext db, Guid id, Guid userId, CancellationToken ct)
    {
        var k = await db.Khatmas.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (k is null || !k.IsMember(userId)) throw new NotFoundException("الختمة", id);
        return k;
    }
}

public sealed record GetMyKhatmasQuery : IQuery<IReadOnlyList<KhatmaDto>>, ISensitiveRequest;

public sealed class GetMyKhatmasQueryHandler(IApplicationDbContext db, AccessContext access, IFieldEncryptor encryptor)
    : IRequestHandler<GetMyKhatmasQuery, IReadOnlyList<KhatmaDto>>
{
    public async Task<IReadOnlyList<KhatmaDto>> Handle(GetMyKhatmasQuery request, CancellationToken cancellationToken)
    {
        var me = access.UserId;
        var list = await db.Khatmas.AsNoTracking().Where(k => k.Members.Any(m => m.UserId == me)).ToListAsync(cancellationToken);
        return list.OrderByDescending(k => k.UpdatedAtUtc ?? k.CreatedAtUtc).Select(k => KhatmaProjection.ToDto(k, me, encryptor)).ToList();
    }
}

public sealed record GetKhatmaQuery(Guid Id) : IQuery<KhatmaDto>, ISensitiveRequest;

public sealed class GetKhatmaQueryHandler(IApplicationDbContext db, AccessContext access, IFieldEncryptor encryptor) : IRequestHandler<GetKhatmaQuery, KhatmaDto>
{
    public async Task<KhatmaDto> Handle(GetKhatmaQuery r, CancellationToken cancellationToken) =>
        KhatmaProjection.ToDto(await KhatmaProjection.LoadAsMemberAsync(db, r.Id, access.UserId, cancellationToken), access.UserId, encryptor);
}

public sealed class KhatmaTextRules
{
    public const int MaxKhatmasPerUser = 20;

    public static void Apply<T>(AbstractValidator<T> v, Func<T, string> title, Func<T, string?> intention, Func<T, DateOnly?> target, IDateTime clock)
    {
        v.RuleFor(x => title(x)).NotEmpty().MaximumLength(80).OverridePropertyName("title");
        v.RuleFor(x => intention(x)).MaximumLength(200).OverridePropertyName("intention");
        v.RuleFor(x => target(x)).Must(d => d is null || d >= DateOnly.FromDateTime(clock.UtcNow.UtcDateTime).AddDays(-1))
            .OverridePropertyName("targetDate").WithMessage("التاريخ المستهدف في الماضي.");
    }
}

/// <summary>Intention اختيارية («على نية شفاء والدتي») — تُشفَّر قبل الحفظ. DisplayName: اسمك كما يراه أعضاء الختمة.</summary>
public sealed record CreateKhatmaCommand(KhatmaMode Mode, string Title, string? Intention, DateOnly? TargetDate, string DisplayName)
    : ICommand<KhatmaDto>, ISensitiveRequest;

public sealed class CreateKhatmaCommandValidator : AbstractValidator<CreateKhatmaCommand>
{
    public CreateKhatmaCommandValidator(IDateTime clock)
    {
        RuleFor(x => x.Mode).IsInEnum();
        RuleFor(x => x.DisplayName).NotEmpty().MaximumLength(40);
        KhatmaTextRules.Apply(this, x => x.Title, x => x.Intention, x => x.TargetDate, clock);
    }
}

public sealed class CreateKhatmaCommandHandler(IApplicationDbContext db, AccessContext access, IFieldEncryptor encryptor, IDateTime clock) : IRequestHandler<CreateKhatmaCommand, KhatmaDto>
{
    public async Task<KhatmaDto> Handle(CreateKhatmaCommand r, CancellationToken cancellationToken)
    {
        // النيّة نص حر: مؤشر خطر فيها يرفع معلومات الطوارئ فوراً، بصرف النظر عن نجاح الإنشاء
        var me = access.UserId;
        var now = clock.UtcNow;
        if (await db.Khatmas.CountAsync(k => k.OwnerUserId == me, cancellationToken) >= KhatmaTextRules.MaxKhatmasPerUser)
            throw new ConflictException($"لديك {KhatmaTextRules.MaxKhatmasPerUser} ختمة؛ احذف إحداها أولاً.");
        var intention = string.IsNullOrWhiteSpace(r.Intention) ? null : encryptor.Encrypt(r.Intention.Trim());
        var k = Khatma.Create(me, r.DisplayName, r.Mode, r.Title, intention, r.TargetDate, now);
        if (r.Mode == KhatmaMode.Group)
        {
            var code = KhatmaCodes.NewCode();
            k.SetInvite(me, KhatmaCodes.Hash(code), encryptor.Encrypt(code), now);
        }
        db.Khatmas.Add(k);
        await db.SaveChangesAsync(cancellationToken);
        return KhatmaProjection.ToDto(k, me, encryptor);
    }
}

public sealed record UpdateKhatmaCommand(Guid Id, string Title, string? Intention, DateOnly? TargetDate) : ICommand<KhatmaDto>, ISensitiveRequest;

public sealed class UpdateKhatmaCommandValidator : AbstractValidator<UpdateKhatmaCommand>
{
    public UpdateKhatmaCommandValidator(IDateTime clock) => KhatmaTextRules.Apply(this, x => x.Title, x => x.Intention, x => x.TargetDate, clock);
}

public sealed class UpdateKhatmaCommandHandler(IApplicationDbContext db, AccessContext access, IFieldEncryptor encryptor, IDateTime clock) : IRequestHandler<UpdateKhatmaCommand, KhatmaDto>
{
    public async Task<KhatmaDto> Handle(UpdateKhatmaCommand r, CancellationToken cancellationToken)
    {
        var me = access.UserId;
        var k = await KhatmaProjection.LoadAsMemberAsync(db, r.Id, me, cancellationToken);
        k.UpdateDetails(me, r.Title, string.IsNullOrWhiteSpace(r.Intention) ? null : encryptor.Encrypt(r.Intention.Trim()), r.TargetDate, clock.UtcNow);
        await db.SaveChangesAsync(cancellationToken);
        return KhatmaProjection.ToDto(k, me, encryptor);
    }
}

public enum KhatmaAction { MarkDone, MarkUndone, Claim, Release, Distribute, NewRound, RotateInvite, Leave, RemoveMember }

/// <summary>
/// عمليات الختمة في أمر واحد مدقَّق: Juz للأجزاء (قراءة/اختيار/ترك)، MemberKey لإزالة عضو (للمنشئ).
/// كل عملية تتحقق من العضوية والملكية داخل Domain.
/// </summary>
public sealed record KhatmaActionCommand(Guid Id, KhatmaAction Action, List<int>? Juz, string? MemberKey) : ICommand<KhatmaDto>;

public sealed class KhatmaActionCommandValidator : AbstractValidator<KhatmaActionCommand>
{
    private static readonly KhatmaAction[] NeedJuz = [KhatmaAction.MarkDone, KhatmaAction.MarkUndone, KhatmaAction.Claim, KhatmaAction.Release];

    public KhatmaActionCommandValidator()
    {
        RuleFor(x => x.Action).IsInEnum();
        RuleFor(x => x.Juz).NotEmpty().Must(j => j!.Count <= Khatma.JuzCount && j.All(i => i is >= 1 and <= Khatma.JuzCount))
            .When(x => NeedJuz.Contains(x.Action)).WithMessage("أرقام الأجزاء بين 1 و30.");
        RuleFor(x => x.MemberKey).NotEmpty().Length(16).When(x => x.Action == KhatmaAction.RemoveMember);
    }
}

public sealed class KhatmaActionCommandHandler(IApplicationDbContext db, AccessContext access, IFieldEncryptor encryptor, IDateTime clock)
    : IRequestHandler<KhatmaActionCommand, KhatmaDto>
{
    public async Task<KhatmaDto> Handle(KhatmaActionCommand r, CancellationToken cancellationToken)
    {
        var me = access.UserId;
        var now = clock.UtcNow;
        var k = await KhatmaProjection.LoadAsMemberAsync(db, r.Id, me, cancellationToken);
        var juz = r.Juz ?? [];
        switch (r.Action)
        {
            case KhatmaAction.MarkDone:
            case KhatmaAction.MarkUndone:
                foreach (var i in juz.Distinct()) k.SetDone(me, i, r.Action == KhatmaAction.MarkDone, now);
                break;
            case KhatmaAction.Claim:
                k.Claim(me, juz, now);
                break;
            case KhatmaAction.Release:
                foreach (var i in juz.Distinct()) k.Release(me, i, now);
                break;
            case KhatmaAction.Distribute:
                k.AutoDistribute(me, now);
                break;
            case KhatmaAction.NewRound:
                k.StartNewRound(me, now);
                break;
            case KhatmaAction.RotateInvite:
                var code = KhatmaCodes.NewCode();
                k.SetInvite(me, KhatmaCodes.Hash(code), encryptor.Encrypt(code), now);
                break;
            case KhatmaAction.Leave:
                k.Leave(me, now);
                await db.SaveChangesAsync(cancellationToken);
                // بعد المغادرة لم يعد عضواً: تعاد حالة فارغة لا تكشف شيئاً
                return KhatmaProjection.ToDto(k, me, encryptor) with { Intention = null, Members = [], Juz = [], InviteCode = null };
            default:
                var target = k.Members.FirstOrDefault(m => KhatmaCodes.MemberKey(k.Id, m.UserId) == r.MemberKey)
                             ?? throw new NotFoundException("العضو", r.MemberKey!);
                k.RemoveMember(me, target.UserId, now);
                break;
        }
        await db.SaveChangesAsync(cancellationToken);
        return KhatmaProjection.ToDto(k, me, encryptor);
    }
}

public sealed record DeleteKhatmaCommand(Guid Id) : ICommand<Unit>;

public sealed class DeleteKhatmaCommandHandler(IApplicationDbContext db, AccessContext access) : IRequestHandler<DeleteKhatmaCommand, Unit>
{
    public async Task<Unit> Handle(DeleteKhatmaCommand r, CancellationToken cancellationToken)
    {
        var k = await KhatmaProjection.LoadAsMemberAsync(db, r.Id, access.UserId, cancellationToken);
        k.EnsureCanDelete(access.UserId);
        db.Khatmas.Remove(k);
        await db.SaveChangesAsync(cancellationToken);
        return Unit.Value;
    }
}

// ── الدعوة ─────────────────────────────────────────────────────────────────

public sealed record PreviewKhatmaInviteQuery(string Code) : IQuery<KhatmaInvitePreviewDto>;

public sealed class PreviewKhatmaInviteQueryValidator : AbstractValidator<PreviewKhatmaInviteQuery>
{
    public PreviewKhatmaInviteQueryValidator() =>
        RuleFor(x => x.Code).Must(KhatmaCodes.IsWellFormed).WithMessage("رمز الدعوة غير صحيح.");
}

public sealed class PreviewKhatmaInviteQueryHandler(IApplicationDbContext db, AccessContext access)
    : IRequestHandler<PreviewKhatmaInviteQuery, KhatmaInvitePreviewDto>
{
    public async Task<KhatmaInvitePreviewDto> Handle(PreviewKhatmaInviteQuery r, CancellationToken cancellationToken)
    {
        var hash = KhatmaCodes.Hash(r.Code);
        var k = await db.Khatmas.AsNoTracking().FirstOrDefaultAsync(x => x.InviteCodeHash == hash, cancellationToken)
                ?? throw new NotFoundException("الدعوة", "الرمز");
        var member = k.IsMember(access.UserId);
        return new KhatmaInvitePreviewDto(k.Title, k.Members.Count, k.DoneCount, member, member ? k.Id : null);
    }
}

public sealed record JoinKhatmaCommand(string Code, string DisplayName) : ICommand<KhatmaDto>, ISensitiveRequest;

public sealed class JoinKhatmaCommandValidator : AbstractValidator<JoinKhatmaCommand>
{
    public JoinKhatmaCommandValidator()
    {
        RuleFor(x => x.Code).Must(KhatmaCodes.IsWellFormed).WithMessage("رمز الدعوة غير صحيح.");
        RuleFor(x => x.DisplayName).NotEmpty().MaximumLength(40);
    }
}

public sealed class JoinKhatmaCommandHandler(IApplicationDbContext db, AccessContext access, IFieldEncryptor encryptor, IDateTime clock)
    : IRequestHandler<JoinKhatmaCommand, KhatmaDto>
{
    public async Task<KhatmaDto> Handle(JoinKhatmaCommand r, CancellationToken cancellationToken)
    {
        var me = access.UserId;
        var hash = KhatmaCodes.Hash(r.Code);
        var k = await db.Khatmas.FirstOrDefaultAsync(x => x.InviteCodeHash == hash, cancellationToken) ?? throw new NotFoundException("الدعوة", "الرمز");
        if (!k.IsMember(me) && await db.Khatmas.CountAsync(x => x.Members.Any(m => m.UserId == me), cancellationToken) >= 50)
            throw new ConflictException("انضممت إلى ختمات كثيرة؛ غادر إحداها أولاً.");
        k.Join(me, r.DisplayName, clock.UtcNow);
        await db.SaveChangesAsync(cancellationToken);
        return KhatmaProjection.ToDto(k, me, encryptor);
    }
}
