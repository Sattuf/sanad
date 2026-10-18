using Sanad.Domain.Common;
using Sanad.Domain.Exceptions;
using Sanad.Domain.Safety;
using Sanad.Domain.Scheduling;

namespace Sanad.Domain.Messaging;

public enum ConversationStatus { Active, Restricted, Suspended, Closed }
public enum MessageStatus { Sent, Delivered, Read, Reported }

public sealed record MessagePostedEvent(Guid ConversationId, Guid MessageId, Guid SenderUserId) : IDomainEvent;
public sealed record ConversationStatusChangedEvent(Guid ConversationId, ConversationStatus Status) : IDomainEvent;

public sealed class ConversationMember
{
    private ConversationMember() { }

    public ConversationMember(Guid userId) => UserId = userId;

    public Guid UserId { get; private set; }
}

/// <summary>
/// محادثة إدارية مرتبطة بحجز (تنسيق مواعيد وتفاصيل إدارية). غير مراقَبة لحظياً — الواجهة تعرض تحذيراً بذلك.
/// </summary>
public sealed class Conversation : BaseEntity, IAggregateRoot
{
    public const int MaxMessageLength = 4000;

    private readonly List<ConversationMember> _members = new();

    private Conversation() { }

    public Guid BookingRequestId { get; private set; }
    public ConversationStatus Status { get; private set; } = ConversationStatus.Active;
    public DateTimeOffset? LastMessageAtUtc { get; private set; }
    public IReadOnlyCollection<ConversationMember> Members => _members.AsReadOnly();

    public static Conversation OpenForBooking(BookingRequest booking, Guid providerUserId)
    {
        ArgumentNullException.ThrowIfNull(booking);
        if (booking.Status is not (BookingStatus.UnderReview or BookingStatus.AlternativeProposed or BookingStatus.Accepted or BookingStatus.AdministrativelyCompleted))
            throw new DomainException("لا تُفتح محادثة إلا لحجز قائم.");
        var conversation = new Conversation { BookingRequestId = booking.Id };
        conversation._members.Add(new ConversationMember(booking.BeneficiaryUserId));
        conversation._members.Add(new ConversationMember(Guard.NotEmpty(providerUserId, "المختص")));
        return conversation;
    }

    public bool IsMember(Guid userId) => _members.Any(m => m.UserId == userId);

    public Message PostMessage(Guid senderId, string plainBody, IFieldEncryptor encryptor, DateTimeOffset nowUtc)
    {
        ArgumentNullException.ThrowIfNull(encryptor);
        if (!IsMember(senderId)) throw new DomainException("المرسل ليس عضواً في هذه المحادثة.", "forbidden");
        if (Status != ConversationStatus.Active) throw new DomainException("لا يمكن الإرسال في محادثة غير نشطة.");
        var body = Guard.Required(plainBody, "نص الرسالة", MaxMessageLength);

        var message = Message.Create(Id, senderId, encryptor.Encrypt(body), nowUtc);
        LastMessageAtUtc = nowUtc;
        Raise(new MessagePostedEvent(Id, message.Id, senderId));
        return message;
    }

    public void ChangeStatus(ConversationStatus status)
    {
        if (!Enum.IsDefined(status)) throw new DomainException("حالة غير معروفة.");
        if (Status == status) return;
        Status = status;
        Raise(new ConversationStatusChangedEvent(Id, status));
    }

    public void ReplaceMember(Guid oldUserId, Guid newUserId)
    {
        var member = _members.FirstOrDefault(m => m.UserId == oldUserId);
        if (member is null) return;
        _members.Remove(member);
        _members.Add(new ConversationMember(newUserId));
    }
}

public sealed class Message : BaseEntity
{
    private Message() { }

    public Guid ConversationId { get; private set; }
    public Guid SenderUserId { get; private set; }

    /// <summary>نص الرسالة مشفّر (ADR-0007) — قد يحوي تفاصيل صحية/دينية شخصية.</summary>
    public string BodyEncrypted { get; private set; } = null!;
    public MessageStatus Status { get; private set; } = MessageStatus.Sent;
    public DateTimeOffset SentAtUtc { get; private set; }

    internal static Message Create(Guid conversationId, Guid senderId, string bodyEncrypted, DateTimeOffset nowUtc) =>
        new() { ConversationId = conversationId, SenderUserId = senderId, BodyEncrypted = bodyEncrypted, SentAtUtc = nowUtc };

    public void MarkReported() => Status = MessageStatus.Reported;

    public void MarkRead()
    {
        if (Status is MessageStatus.Sent or MessageStatus.Delivered) Status = MessageStatus.Read;
    }

    /// <summary>عند حذف حساب المرسل: تجريد الهوية واستبدال النص بعلامة حذف مشفّرة.</summary>
    public void AnonymizeSender(Guid anonymousUserId, string encryptedRedactionMarker)
    {
        SenderUserId = anonymousUserId;
        BodyEncrypted = encryptedRedactionMarker;
    }
}
