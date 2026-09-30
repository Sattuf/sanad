using System.Text.RegularExpressions;
using Sanad.Domain.Common;
using Sanad.Domain.Exceptions;

namespace Sanad.Domain.Ruqyah;

public enum WrittenDuaStatus { Draft, InReview, Published }

public sealed record WrittenDuaPublishedEvent(Guid WrittenDuaId) : IDomainEvent;

/// <summary>
/// دعاء أو ذكر مكتوب يضيفه فريق المحتوى إلى مجموعات «الرقية والتحصين» فوق النصوص الثابتة.
/// مراجعة شرعية بعينين: من كتب الدعاء لا ينشره — ينشره مدير محتوى آخر بعد التحقق من النص والتخريج.
/// أي تعديل يعيده مسودة فيحتاج مراجعة جديدة. كل النصوص تمر على فلتر الادعاءات عند الحفظ وقبل النشر.
/// </summary>
public sealed partial class WrittenDua : BaseEntity, IAggregateRoot
{
    private WrittenDua() { }

    public string CollectionId { get; private set; } = null!;
    public string Title { get; private set; } = null!;
    public string Text { get; private set; } = null!;
    public string Source { get; private set; } = null!;
    public string? Note { get; private set; }
    public int Repeat { get; private set; } = 1;
    public int SortOrder { get; private set; }
    public WrittenDuaStatus Status { get; private set; }
    public Guid AuthorUserId { get; private set; }
    public Guid? ReviewerUserId { get; private set; }
    public string? ReviewNote { get; private set; }
    public DateTimeOffset? PublishedAtUtc { get; private set; }

    public static WrittenDua Create(string collectionId, string title, string text, string source, string? note, int repeat, int sortOrder,
        Guid authorUserId, IContentPolicyChecker policy, DateTimeOffset nowUtc)
    {
        var dua = new WrittenDua { AuthorUserId = Guard.NotEmpty(authorUserId, "الكاتب"), Status = WrittenDuaStatus.Draft, CreatedAtUtc = nowUtc };
        dua.Apply(collectionId, title, text, source, note, repeat, sortOrder, policy);
        return dua;
    }

    /// <summary>أي تعديل — حتى على دعاء منشور — يعيده مسودة ويسحبه من العرض حتى يُراجَع من جديد.</summary>
    public void Update(string collectionId, string title, string text, string source, string? note, int repeat, int sortOrder,
        IContentPolicyChecker policy, DateTimeOffset nowUtc)
    {
        Apply(collectionId, title, text, source, note, repeat, sortOrder, policy);
        Status = WrittenDuaStatus.Draft;
        ReviewerUserId = null;
        PublishedAtUtc = null;
        UpdatedAtUtc = nowUtc;
    }

    public void SubmitForReview(DateTimeOffset nowUtc)
    {
        if (Status != WrittenDuaStatus.Draft) throw new DomainException("يُرسل للمراجعة ما كان مسودة فقط.", "invalid_state");
        Status = WrittenDuaStatus.InReview;
        ReviewNote = null;
        UpdatedAtUtc = nowUtc;
    }

    public void Approve(Guid reviewerUserId, IContentPolicyChecker policy, DateTimeOffset nowUtc)
    {
        if (Status != WrittenDuaStatus.InReview) throw new DomainException("لا يُنشر إلا ما أُرسل للمراجعة.", "invalid_state");
        if (Guard.NotEmpty(reviewerUserId, "المراجع") == AuthorUserId)
            throw new DomainException("المراجعة الشرعية تكون من مدير محتوى غير كاتب الدعاء.", "self_review");
        ContentPolicy.EnsureAllowed(policy, "الدعاء", Title, Text, Source, Note);
        Status = WrittenDuaStatus.Published;
        ReviewerUserId = reviewerUserId;
        PublishedAtUtc = nowUtc;
        UpdatedAtUtc = nowUtc;
        Raise(new WrittenDuaPublishedEvent(Id));
    }

    public void ReturnToDraft(Guid reviewerUserId, string reason, DateTimeOffset nowUtc)
    {
        if (Status == WrittenDuaStatus.Draft) throw new DomainException("الدعاء مسودة أصلاً.", "invalid_state");
        ReviewNote = Guard.Required(reason, "سبب الإعادة", 500);
        ReviewerUserId = Guard.NotEmpty(reviewerUserId, "المراجع");
        Status = WrittenDuaStatus.Draft;
        PublishedAtUtc = null;
        UpdatedAtUtc = nowUtc;
    }

    private void Apply(string collectionId, string title, string text, string source, string? note, int repeat, int sortOrder, IContentPolicyChecker policy)
    {
        if (collectionId is null || !CollectionPattern().IsMatch(collectionId)) throw new DomainException("المجموعة غير صالحة.");
        if (repeat is < 1 or > 1000) throw new DomainException("عدد التكرار بين 1 و1000.");
        if (sortOrder is < 0 or > 10_000) throw new DomainException("ترتيب العرض غير صالح.");
        var t = Guard.Required(title, "العنوان", 150);
        var body = Guard.Required(text, "نص الدعاء", 3000);
        var s = Guard.Required(source, "التخريج", 300);
        var n = Guard.Optional(note, "الفائدة", 1000);
        ContentPolicy.EnsureAllowed(policy, "الدعاء", t, body, s, n);
        CollectionId = collectionId;
        Title = t;
        Text = body;
        Source = s;
        Note = n;
        Repeat = repeat;
        SortOrder = sortOrder;
    }

    [GeneratedRegex("^[a-z0-9][a-z0-9-]{0,49}$")]
    private static partial Regex CollectionPattern();
}
