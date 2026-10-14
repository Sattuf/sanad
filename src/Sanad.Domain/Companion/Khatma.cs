using System.Text.RegularExpressions;
using Sanad.Domain.Common;
using Sanad.Domain.Exceptions;

namespace Sanad.Domain.Companion;

public enum KhatmaMode { Solo, Group }

/// <summary>اكتملت الختمة — يحمل المعرّفات فقط (لا العنوان ولا النيّة)، ويُرسَل منه إشعار عام لأعضائها.</summary>
public sealed record KhatmaCompletedEvent(Guid KhatmaId, int Round) : IDomainEvent;

public sealed class KhatmaMember
{
    private KhatmaMember() { }

    internal KhatmaMember(Guid userId, string displayName, DateTimeOffset joinedAtUtc)
    {
        UserId = userId;
        DisplayName = displayName;
        JoinedAtUtc = joinedAtUtc;
    }

    public Guid UserId { get; internal set; }
    /// <summary>الاسم الذي يختاره العضو ليراه أعضاء الختمة — قد يكون كنية، لا الاسم في الحساب.</summary>
    public string DisplayName { get; internal set; } = null!;
    public DateTimeOffset JoinedAtUtc { get; private set; }
}

public sealed class KhatmaJuz
{
    private KhatmaJuz() { }

    internal KhatmaJuz(int index) => Index = index;

    public int Index { get; private set; }
    public Guid? AssigneeUserId { get; internal set; }
    public DateTimeOffset? DoneAtUtc { get; internal set; }
    public bool IsDone => DoneAtUtc is not null;
}

/// <summary>
/// ختمة قرآن بثلاثين جزءاً — فردية أو جماعية (أسرة/أصدقاء) برابط دعوة.
/// النيّة اختيارية ومشفّرة، ولا يراها إلا أعضاء الختمة، ولا تظهر في أي إشعار ولا في معاينة الدعوة.
/// رمز الدعوة يُخزَّن مُجزّأً (Hash) للبحث، ومشفّراً ليعيد المالك عرضه؛ والمالك يجدّده متى شاء فيُبطل القديم.
/// </summary>
public sealed partial class Khatma : BaseEntity, IAggregateRoot
{
    public const int JuzCount = 30;
    public const int MaxMembers = 30;

    private readonly List<KhatmaMember> _members = new();
    private readonly List<KhatmaJuz> _juz = new();

    private Khatma() { }

    public KhatmaMode Mode { get; private set; }
    public string Title { get; private set; } = null!;
    public string? IntentionEncrypted { get; private set; }
    public Guid OwnerUserId { get; private set; }
    public DateOnly? TargetDate { get; private set; }
    public int Round { get; private set; } = 1;
    public DateTimeOffset? CompletedAtUtc { get; private set; }
    public string? InviteCodeHash { get; private set; }
    public string? InviteCodeEncrypted { get; private set; }

    public IReadOnlyList<KhatmaMember> Members => _members;
    public IReadOnlyList<KhatmaJuz> Juz => _juz;
    public int DoneCount => _juz.Count(j => j.IsDone);
    public bool IsComplete => DoneCount == JuzCount;

    public static Khatma Create(Guid ownerUserId, string ownerDisplayName, KhatmaMode mode, string title, string? intentionEncrypted,
        DateOnly? targetDate, DateTimeOffset nowUtc)
    {
        var k = new Khatma
        {
            OwnerUserId = Guard.NotEmpty(ownerUserId, "المالك"),
            Mode = mode,
            Title = Guard.Required(title, "عنوان الختمة", 80),
            IntentionEncrypted = intentionEncrypted,
            CreatedAtUtc = nowUtc,
        };
        k.SetTarget(targetDate, nowUtc);
        k._members.Add(new KhatmaMember(ownerUserId, ValidName(ownerDisplayName), nowUtc));
        for (var i = 1; i <= JuzCount; i++) k._juz.Add(new KhatmaJuz(i) { AssigneeUserId = mode == KhatmaMode.Solo ? ownerUserId : null });
        return k;
    }

    public bool IsMember(Guid userId) => _members.Any(m => m.UserId == userId);

    public void EnsureMember(Guid userId)
    {
        if (!IsMember(userId)) throw new DomainException("لست عضواً في هذه الختمة.", "forbidden");
    }

    private void EnsureOwner(Guid userId)
    {
        if (userId != OwnerUserId) throw new DomainException("هذه العملية لمنشئ الختمة.", "forbidden");
    }

    public void SetInvite(Guid byUserId, string codeHash, string codeEncrypted, DateTimeOffset nowUtc)
    {
        EnsureOwner(byUserId);
        if (Mode != KhatmaMode.Group) throw new DomainException("الدعوة للختمة الجماعية فقط.", "invalid_state");
        InviteCodeHash = Guard.Required(codeHash, "رمز الدعوة", 128);
        InviteCodeEncrypted = Guard.Required(codeEncrypted, "رمز الدعوة", 1000);
        UpdatedAtUtc = nowUtc;
    }

    public void UpdateDetails(Guid byUserId, string title, string? intentionEncrypted, DateOnly? targetDate, DateTimeOffset nowUtc)
    {
        EnsureOwner(byUserId);
        Title = Guard.Required(title, "عنوان الختمة", 80);
        IntentionEncrypted = intentionEncrypted;
        SetTarget(targetDate, nowUtc);
        UpdatedAtUtc = nowUtc;
    }

    public void Join(Guid userId, string displayName, DateTimeOffset nowUtc)
    {
        if (Mode != KhatmaMode.Group) throw new DomainException("هذه ختمة فردية.", "invalid_state");
        Guard.NotEmpty(userId, "المستخدم");
        var name = ValidName(displayName);
        var existing = _members.FirstOrDefault(m => m.UserId == userId);
        if (existing is not null)
        {
            existing.DisplayName = name;
            return;
        }
        if (_members.Count >= MaxMembers) throw new DomainException($"اكتمل عدد أعضاء الختمة ({MaxMembers}).", "invalid_state");
        _members.Add(new KhatmaMember(userId, name, nowUtc));
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>يغادر العضو: أجزاؤه غير المقروءة تعود متاحة، والمقروءة تبقى محسوبة للختمة.</summary>
    public void Leave(Guid userId, DateTimeOffset nowUtc)
    {
        if (userId == OwnerUserId) throw new DomainException("منشئ الختمة لا يغادرها؛ يمكنه حذفها.", "invalid_state");
        RemoveMemberInternal(userId, nowUtc);
    }

    public void RemoveMember(Guid byUserId, Guid memberUserId, DateTimeOffset nowUtc)
    {
        EnsureOwner(byUserId);
        if (memberUserId == OwnerUserId) throw new DomainException("لا يُزال منشئ الختمة.", "invalid_state");
        RemoveMemberInternal(memberUserId, nowUtc);
    }

    private void RemoveMemberInternal(Guid userId, DateTimeOffset nowUtc)
    {
        var m = _members.FirstOrDefault(x => x.UserId == userId) ?? throw new DomainException("ليس عضواً في الختمة.", "invalid_state");
        _members.Remove(m);
        foreach (var j in _juz.Where(j => j.AssigneeUserId == userId))
            j.AssigneeUserId = null;
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>حذف الحساب: تنتقل الملكية لأقدم عضو، أو تُحذف الختمة إن لم يبق أحد (يعيد false حينها).</summary>
    public bool HandOverFrom(Guid userId, DateTimeOffset nowUtc)
    {
        if (userId != OwnerUserId)
        {
            if (IsMember(userId)) RemoveMemberInternal(userId, nowUtc);
            return true;
        }
        var heir = _members.Where(m => m.UserId != userId).OrderBy(m => m.JoinedAtUtc).FirstOrDefault();
        if (heir is null) return false;
        RemoveMemberInternal(userId, nowUtc);
        OwnerUserId = heir.UserId;
        return true;
    }

    /// <summary>يختار العضو أجزاءه: المتاحة أو التي له أصلاً.</summary>
    public void Claim(Guid userId, IReadOnlyCollection<int> indexes, DateTimeOffset nowUtc)
    {
        EnsureMember(userId);
        foreach (var index in indexes.Distinct())
        {
            var j = JuzAt(index);
            if (j.AssigneeUserId is { } a && a != userId) throw new DomainConflictException($"الجزء {index} اختاره عضو آخر.");
            j.AssigneeUserId = userId;
        }
        UpdatedAtUtc = nowUtc;
    }

    public void Release(Guid userId, int index, DateTimeOffset nowUtc)
    {
        var j = JuzAt(index);
        if (j.AssigneeUserId != userId) throw new DomainException("ليس هذا الجزء لك.", "forbidden");
        if (j.IsDone) throw new DomainException("الجزء مقروء؛ ألغِ قراءته أولاً.", "invalid_state");
        if (Mode == KhatmaMode.Solo) throw new DomainException("أجزاء الختمة الفردية كلها لك.", "invalid_state");
        j.AssigneeUserId = null;
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>توزيع الأجزاء المتاحة على الأعضاء بالتساوي، متجاورةً، بترتيب الانضمام. للمنشئ فقط.</summary>
    public void AutoDistribute(Guid byUserId, DateTimeOffset nowUtc)
    {
        EnsureOwner(byUserId);
        var free = _juz.Where(j => j.AssigneeUserId is null && !j.IsDone).OrderBy(j => j.Index).ToList();
        if (free.Count == 0) return;
        var members = _members.OrderBy(m => m.JoinedAtUtc).ToList();
        var per = free.Count / members.Count;
        var extra = free.Count % members.Count;
        var cursor = 0;
        for (var i = 0; i < members.Count; i++)
        {
            var take = per + (i < extra ? 1 : 0);
            foreach (var j in free.Skip(cursor).Take(take)) j.AssigneeUserId = members[i].UserId;
            cursor += take;
        }
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>يسجّل قراءة الجزء أو يلغيها. في الجماعية: الجزء المتاح يصير لمن قرأه.</summary>
    public void SetDone(Guid userId, int index, bool done, DateTimeOffset nowUtc)
    {
        EnsureMember(userId);
        var j = JuzAt(index);
        if (j.AssigneeUserId is null && done) j.AssigneeUserId = userId;
        if (j.AssigneeUserId != userId) throw new DomainException("هذا الجزء لعضو آخر.", "forbidden");
        var wasComplete = IsComplete;
        j.DoneAtUtc = done ? (j.DoneAtUtc ?? nowUtc) : null;
        if (IsComplete && !wasComplete)
        {
            CompletedAtUtc = nowUtc;
            Raise(new KhatmaCompletedEvent(Id, Round));
        }
        else if (!IsComplete)
        {
            CompletedAtUtc = null;
        }
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>ختمة جديدة بالأعضاء أنفسهم. الأجزاء تُفرَّغ؛ في الفردية تبقى كلها للمالك.</summary>
    public void StartNewRound(Guid byUserId, DateTimeOffset nowUtc)
    {
        EnsureOwner(byUserId);
        if (!IsComplete) throw new DomainException("تبدأ الختمة الجديدة بعد إتمام هذه.", "invalid_state");
        Round++;
        CompletedAtUtc = null;
        TargetDate = null;
        foreach (var j in _juz)
        {
            j.DoneAtUtc = null;
            j.AssigneeUserId = Mode == KhatmaMode.Solo ? OwnerUserId : null;
        }
        UpdatedAtUtc = nowUtc;
    }

    public void EnsureCanDelete(Guid byUserId) => EnsureOwner(byUserId);

    private KhatmaJuz JuzAt(int index) =>
        index is >= 1 and <= JuzCount ? _juz.Single(j => j.Index == index) : throw new DomainException("رقم الجزء بين 1 و30.");

    private void SetTarget(DateOnly? targetDate, DateTimeOffset nowUtc)
    {
        if (targetDate is { } t && t < DateOnly.FromDateTime(nowUtc.UtcDateTime).AddDays(-1))
            throw new DomainException("التاريخ المستهدف في الماضي.");
        TargetDate = targetDate;
    }

    private static string ValidName(string? name)
    {
        // علامات الاتجاه وما يشبهها تُحذف (تُستعمل لتزييف العرض)، والتحكّم والوسوم تُرفض
        var n = Guard.Required(FormatChars().Replace(name ?? string.Empty, string.Empty), "الاسم في الختمة", 40);
        if (ControlChars().IsMatch(n)) throw new DomainException("الاسم يحتوي رموزاً غير مسموحة.");
        return n;
    }

    [GeneratedRegex(@"[\p{Cc}<>]")]
    private static partial Regex ControlChars();

    [GeneratedRegex(@"\p{Cf}")]
    private static partial Regex FormatChars();
}
