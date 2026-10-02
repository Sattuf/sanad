using Sanad.Domain.Common;
using Sanad.Domain.Exceptions;

namespace Sanad.Domain.Companion;

/// <summary>
/// معدّ خطط (شيخ معروف). لا تُنشر خطة باسمه قبل تسجيل إذنه المكتوب: مرجع الإذن وتاريخه ومن سجّله.
/// الاسم والنبذة جزء مما أذن به؛ أي تعديل عليهما يُسقط الإذن فتختفي خططه من العرض حتى يُسجَّل إذن جديد.
/// </summary>
public sealed class PlanAuthor : BaseEntity, IAggregateRoot
{
    private PlanAuthor() { }

    public string DisplayName { get; private set; } = null!;
    public string Bio { get; private set; } = null!;
    public string? ConsentRef { get; private set; }
    public DateOnly? ConsentDate { get; private set; }
    public Guid? ConsentRecordedByUserId { get; private set; }
    public Guid CreatedByUserId { get; private set; }

    public bool HasConsent => ConsentRef is not null && ConsentDate is not null;

    public static PlanAuthor Create(string displayName, string bio, Guid createdBy, IContentPolicyChecker policy, DateTimeOffset nowUtc)
    {
        var a = new PlanAuthor { CreatedByUserId = Guard.NotEmpty(createdBy, "المنشئ"), CreatedAtUtc = nowUtc };
        a.Apply(displayName, bio, policy);
        return a;
    }

    public void UpdateProfile(string displayName, string bio, IContentPolicyChecker policy, DateTimeOffset nowUtc)
    {
        var name = DisplayName;
        var oldBio = Bio;
        Apply(displayName, bio, policy);
        if (name != DisplayName || oldBio != Bio) ClearConsent();
        UpdatedAtUtc = nowUtc;
    }

    public void RecordConsent(string consentRef, DateOnly consentDate, Guid recordedBy, DateTimeOffset nowUtc)
    {
        if (consentDate > DateOnly.FromDateTime(nowUtc.UtcDateTime).AddDays(1)) throw new DomainException("تاريخ الإذن في المستقبل.");
        ConsentRef = Guard.Required(consentRef, "مرجع الإذن", 100);
        ConsentDate = consentDate;
        ConsentRecordedByUserId = Guard.NotEmpty(recordedBy, "المسجِّل");
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>سحب الإذن: تُسحب كل خطط المعدّ من العرض فوراً (يتولاه الـ Handler).</summary>
    public void RevokeConsent(DateTimeOffset nowUtc)
    {
        ClearConsent();
        UpdatedAtUtc = nowUtc;
    }

    private void ClearConsent()
    {
        ConsentRef = null;
        ConsentDate = null;
        ConsentRecordedByUserId = null;
    }

    private void Apply(string displayName, string bio, IContentPolicyChecker policy)
    {
        var n = Guard.Required(displayName, "اسم المعدّ", 80);
        var b = Guard.Required(bio, "النبذة", 300);
        ContentPolicy.EnsureAllowed(policy, "تعريف المعدّ", n, b);
        PlanWording.EnsureAllowed("تعريف المعدّ", n, b);
        DisplayName = n;
        Bio = b;
    }
}

public enum PlanStatus { Draft, InReview, Published, Superseded, Withdrawn }

public sealed record PlanPublishedEvent(Guid PlanId, string PlanKey, int Version) : IDomainEvent;

/// <summary>
/// خطة رقية بإصدار. أربع خطوات قبل النشر (content-guardrails.md §2): إذن المعدّ المكتوب، مراجعة شرعية من مدير محتوى
/// غير منشئ الخطة، إقرار فحص الأمان بنداً بنداً، ورقم إصدار. المنشور لا يُعدَّل: التعديل ينشئ إصداراً جديداً مسودة،
/// وعند نشره يصير السابق «مستبدلاً» — يُكمل المسجّلون فيه نسختهم، ولا يبدأ فيه أحد جديد.
/// </summary>
public sealed class RuqyahPlan : BaseEntity, IAggregateRoot
{
    private RuqyahPlan() { }

    public string Key { get; private set; } = null!;
    public int Version { get; private set; }
    public Guid? PreviousVersionId { get; private set; }
    public string Title { get; private set; } = null!;
    public string Summary { get; private set; } = null!;
    public string Contents { get; private set; } = null!;
    public Guid AuthorId { get; private set; }
    public int DurationDays { get; private set; }
    public int MinutesPerDay { get; private set; }
    public List<PlanDay> Days { get; private set; } = new();
    public PlanStatus Status { get; private set; }
    public Guid CreatedByUserId { get; private set; }
    public Guid? ReviewerUserId { get; private set; }
    public string? ReviewNote { get; private set; }
    public DateTimeOffset? SafetyCheckedAtUtc { get; private set; }
    public DateTimeOffset? PublishedAtUtc { get; private set; }
    public string? WithdrawReason { get; private set; }

    /// <summary>متاح للعرض: المنشور يُبدأ فيه، والمستبدل يُعرض لمن سجّل فيه فقط.</summary>
    public bool IsServable => Status is PlanStatus.Published or PlanStatus.Superseded;

    public static RuqyahPlan Create(string key, string title, string summary, string contents, Guid authorId, int durationDays, int minutesPerDay,
        IReadOnlyList<PlanDay> days, Guid createdBy, IContentPolicyChecker policy, DateTimeOffset nowUtc)
    {
        var p = new RuqyahPlan
        {
            Key = PlanContentRules.ValidKey(key),
            Version = 1,
            Status = PlanStatus.Draft,
            CreatedByUserId = Guard.NotEmpty(createdBy, "المنشئ"),
            CreatedAtUtc = nowUtc,
        };
        p.Apply(title, summary, contents, authorId, durationDays, minutesPerDay, days, policy);
        return p;
    }

    /// <summary>إصدار جديد مسودة بالمحتوى نفسه، من خطة منشورة. منشئه هو من يعدّله، فلا يراجعه.</summary>
    public RuqyahPlan NewVersion(Guid createdBy, DateTimeOffset nowUtc)
    {
        if (Status != PlanStatus.Published) throw new DomainException("يُنشأ إصدار جديد من الخطة المنشورة فقط.", "invalid_state");
        return new RuqyahPlan
        {
            Key = Key,
            Version = Version + 1,
            PreviousVersionId = Id,
            Title = Title,
            Summary = Summary,
            Contents = Contents,
            AuthorId = AuthorId,
            DurationDays = DurationDays,
            MinutesPerDay = MinutesPerDay,
            Days = Days.Select(d => new PlanDay(d.Day, d.Items.ToList())).ToList(),
            Status = PlanStatus.Draft,
            CreatedByUserId = Guard.NotEmpty(createdBy, "المنشئ"),
            CreatedAtUtc = nowUtc,
        };
    }

    public void Update(string title, string summary, string contents, Guid authorId, int durationDays, int minutesPerDay,
        IReadOnlyList<PlanDay> days, IContentPolicyChecker policy, DateTimeOffset nowUtc)
    {
        if (Status != PlanStatus.Draft) throw new DomainException("تُعدَّل المسودة فقط. للخطة المنشورة أنشئ إصداراً جديداً.", "invalid_state");
        Apply(title, summary, contents, authorId, durationDays, minutesPerDay, days, policy);
        UpdatedAtUtc = nowUtc;
    }

    public void SubmitForReview(Guid byUserId, DateTimeOffset nowUtc)
    {
        if (Status != PlanStatus.Draft) throw new DomainException("يُرسل للمراجعة ما كان مسودة فقط.", "invalid_state");
        if (byUserId != CreatedByUserId) throw new DomainException("يرسل الخطةَ للمراجعة منشئُها.", "forbidden");
        Status = PlanStatus.InReview;
        ReviewNote = null;
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>النشر: مراجع غير المنشئ، معدّ بإذن مسجَّل، إقرار أمان كامل، ونصوص تمر على الفلترين من جديد.</summary>
    public void Approve(Guid reviewerUserId, PlanAuthor author, SafetyAttestation attestation, IContentPolicyChecker policy, DateTimeOffset nowUtc)
    {
        if (Status != PlanStatus.InReview) throw new DomainException("لا يُنشر إلا ما أُرسل للمراجعة.", "invalid_state");
        if (Guard.NotEmpty(reviewerUserId, "المراجع") == CreatedByUserId)
            throw new DomainException("المراجعة الشرعية تكون من مدير محتوى غير منشئ الخطة.", "self_review");
        if (author.Id != AuthorId) throw new DomainException("المعدّ لا يطابق الخطة.");
        if (!author.HasConsent) throw new DomainException("لا تُنشر خطة قبل تسجيل الإذن المكتوب من معدّها.", "publication_gate");
        if (attestation is null || !attestation.IsComplete)
            throw new DomainException("أكمل فحص الأمان بنداً بنداً قبل النشر.", "publication_gate");
        Apply(Title, Summary, Contents, AuthorId, DurationDays, MinutesPerDay, Days, policy);
        Status = PlanStatus.Published;
        ReviewerUserId = reviewerUserId;
        SafetyCheckedAtUtc = nowUtc;
        PublishedAtUtc = nowUtc;
        UpdatedAtUtc = nowUtc;
        Raise(new PlanPublishedEvent(Id, Key, Version));
    }

    public void ReturnToDraft(Guid reviewerUserId, string reason, DateTimeOffset nowUtc)
    {
        if (Status != PlanStatus.InReview) throw new DomainException("تُعاد للمسودة الخطة التي في المراجعة فقط.", "invalid_state");
        ReviewNote = Guard.Required(reason, "سبب الإعادة", 500);
        ReviewerUserId = Guard.NotEmpty(reviewerUserId, "المراجع");
        Status = PlanStatus.Draft;
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>نُشر إصدار أحدث: يبقى هذا لمن سجّل فيه.</summary>
    public void Supersede(DateTimeOffset nowUtc)
    {
        if (Status != PlanStatus.Published) return;
        Status = PlanStatus.Superseded;
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>سحب من العرض كلياً (سبب أمان أو سحب إذن) — لا يبدأ فيها أحد، ولا تُخدم بعد ذلك.</summary>
    public void Withdraw(string reason, DateTimeOffset nowUtc)
    {
        if (Status is not (PlanStatus.Published or PlanStatus.Superseded or PlanStatus.InReview))
            throw new DomainException("لا تُسحب إلا خطة منشورة أو في المراجعة.", "invalid_state");
        WithdrawReason = Guard.Required(reason, "سبب السحب", 300);
        Status = PlanStatus.Withdrawn;
        UpdatedAtUtc = nowUtc;
    }

    private void Apply(string title, string summary, string contents, Guid authorId, int durationDays, int minutesPerDay,
        IReadOnlyList<PlanDay> days, IContentPolicyChecker policy)
    {
        if (!PlanDurations.Allowed.Contains(durationDays)) throw new DomainException("مدة الخطة 7 أو 14 أو 21 أو 40 يوماً.");
        if (minutesPerDay is < 1 or > 120) throw new DomainException("مدة الورد اليومي بين دقيقة و120 دقيقة.");
        var t = Guard.Required(title, "عنوان الخطة", 80);
        var s = Guard.Required(summary, "الملخص", 200);
        var c = Guard.Required(contents, "ما تحتويه الخطة", 600);
        ContentPolicy.EnsureAllowed(policy, "الخطة", t, s, c);
        PlanWording.EnsureAllowed("الخطة", t, s, c);
        Days = PlanContentRules.Validate(days, durationDays, policy);
        Title = t;
        Summary = s;
        Contents = c;
        AuthorId = Guard.NotEmpty(authorId, "المعدّ");
        DurationDays = durationDays;
        MinutesPerDay = minutesPerDay;
    }
}
