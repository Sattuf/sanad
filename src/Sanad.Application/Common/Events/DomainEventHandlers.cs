using MediatR;
using Microsoft.EntityFrameworkCore;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Modules.Safety;
using Sanad.Domain.Common;
using Sanad.Domain.Directory;
using Sanad.Domain.Identity;
using Sanad.Domain.Messaging;
using Sanad.Domain.PatientCare;
using Sanad.Domain.Safety;
using Sanad.Domain.Scheduling;
using Sanad.Domain.Verification;

namespace Sanad.Application.Common.Events;

/// <summary>غلاف يحوّل حدث Domain (بلا اعتماد على MediatR) إلى إشعار داخلي يُنشَر من معالج Outbox.</summary>
public sealed record DomainEventNotification<TEvent>(TEvent Event) : INotification where TEvent : IDomainEvent;

// كل نصوص الإشعارات هنا عامة — لا نص ملاحظة ولا توصية ولا رسالة، ولا أي وصف لحالة المستخدم.

public sealed class RecommendationSentHandler(INotificationDispatcher notifications)
    : INotificationHandler<DomainEventNotification<ProviderRecommendationSentEvent>>
{
    public Task Handle(DomainEventNotification<ProviderRecommendationSentEvent> notification, CancellationToken cancellationToken) =>
        notifications.DispatchAsync(new NotificationMessage(notification.Event.RecipientBeneficiaryUserId, "recommendation.new",
            "توصية جديدة", "لديك توصية جديدة من مختصك.", "/recommendations"), cancellationToken);
}

public sealed class BookingSubmittedHandler(IApplicationDbContext db, INotificationDispatcher notifications)
    : INotificationHandler<DomainEventNotification<BookingSubmittedEvent>>
{
    public async Task Handle(DomainEventNotification<BookingSubmittedEvent> notification, CancellationToken cancellationToken)
    {
        var providerUserId = await db.ProviderProfiles.Where(p => p.Id == notification.Event.ProviderProfileId)
            .Select(p => (Guid?)p.UserId).FirstOrDefaultAsync(cancellationToken);
        if (providerUserId is { } uid)
            await notifications.DispatchAsync(new NotificationMessage(uid, "booking.submitted", "طلب حجز جديد",
                "وصلك طلب حجز جديد بانتظار مراجعتك.", "/provider/bookings"), cancellationToken);
    }
}

public sealed class BookingStatusChangedHandler(IApplicationDbContext db, INotificationDispatcher notifications, IRealtimePublisher realtime)
    : INotificationHandler<DomainEventNotification<BookingStatusChangedEvent>>
{
    private static readonly Dictionary<BookingStatus, string> BeneficiaryMessages = new()
    {
        [BookingStatus.Accepted] = "تم تأكيد موعدك.",
        [BookingStatus.AlternativeProposed] = "اقترح المختص موعداً بديلاً — راجع حجزك.",
        [BookingStatus.Rejected] = "تعذّر قبول طلب الحجز — راجع التفاصيل.",
        [BookingStatus.Cancelled] = "أُلغي أحد حجوزاتك.",
    };

    public async Task Handle(DomainEventNotification<BookingStatusChangedEvent> notification, CancellationToken cancellationToken)
    {
        var e = notification.Event;
        var booking = await db.BookingRequests.AsNoTracking().FirstOrDefaultAsync(b => b.Id == e.BookingId, cancellationToken);
        if (booking is null) return;
        var providerUserId = await db.ProviderProfiles.Where(p => p.Id == booking.ProviderProfileIdOfAssignedService)
            .Select(p => (Guid?)p.UserId).FirstOrDefaultAsync(cancellationToken);

        var payload = new { bookingId = e.BookingId, status = e.Status.ToString() };
        await realtime.PublishToUserAsync(booking.BeneficiaryUserId, "bookingUpdated", payload, cancellationToken);
        if (providerUserId is { } pid) await realtime.PublishToUserAsync(pid, "bookingUpdated", payload, cancellationToken);

        if (BeneficiaryMessages.TryGetValue(e.Status, out var text))
            await notifications.DispatchAsync(new NotificationMessage(booking.BeneficiaryUserId, "booking.status", "تحديث على حجزك", text,
                $"/bookings/{e.BookingId}"), cancellationToken);
    }
}

public sealed class MessagePostedHandler(IApplicationDbContext db, IRealtimePublisher realtime, INotificationDispatcher notifications)
    : INotificationHandler<DomainEventNotification<MessagePostedEvent>>
{
    public async Task Handle(DomainEventNotification<MessagePostedEvent> notification, CancellationToken cancellationToken)
    {
        var e = notification.Event;
        var conversation = await db.Conversations.AsNoTracking().FirstOrDefaultAsync(c => c.Id == e.ConversationId, cancellationToken);
        if (conversation is null) return;
        foreach (var member in conversation.Members.Where(m => m.UserId != e.SenderUserId))
        {
            // معرّفات فقط عبر SignalR — العميل يجلب النص عبر Query محمي
            await realtime.PublishToUserAsync(member.UserId, "messageReceived", new { conversationId = e.ConversationId, messageId = e.MessageId }, cancellationToken);
            await notifications.DispatchAsync(new NotificationMessage(member.UserId, "message.new", "رسالة جديدة",
                "وصلتك رسالة جديدة في محادثة حجزك.", $"/conversations/{e.ConversationId}"), cancellationToken);
        }
    }
}

public sealed class VerificationDecidedHandler(INotificationDispatcher notifications)
    : INotificationHandler<DomainEventNotification<VerificationDecidedEvent>>
{
    public Task Handle(DomainEventNotification<VerificationDecidedEvent> notification, CancellationToken cancellationToken)
    {
        var e = notification.Event;
        if (e.ApplicantUserId is not { } uid) return Task.CompletedTask;
        var text = e.Status switch
        {
            VerificationStatus.Approved or VerificationStatus.ConditionallyApproved => "اعتُمد طلب الترقية — أكمل ملفك المهني ثم انشره.",
            VerificationStatus.Rejected => "صدر قرار بشأن طلب الترقية — راجع التفاصيل.",
            VerificationStatus.RequiresCompletion => "طلب الترقية يحتاج استكمال مستندات.",
            _ => "تحديث على حالة التوثيق.",
        };
        return notifications.DispatchAsync(new NotificationMessage(uid, "verification.decided", "تحديث طلب الترقية", text, "/provider-upgrade"), cancellationToken);
    }
}

public sealed class EscalationLevelChangedHandler(IIdentityService identity, INotificationDispatcher notifications)
    : INotificationHandler<DomainEventNotification<EscalationLevelChangedEvent>>
{
    public async Task Handle(DomainEventNotification<EscalationLevelChangedEvent> notification, CancellationToken cancellationToken)
    {
        if (notification.Event.Level != EscalationLevel.RegulatoryReferral) return;
        foreach (var uid in await identity.GetUserIdsInRoleAsync(SanadRole.PrivacySecurityOfficer, cancellationToken))
            await notifications.DispatchAsync(new NotificationMessage(uid, "safety.regulatory", "إحالة تنظيمية",
                "ملف تصعيد وصل مستوى الإحالة التنظيمية ويحتاج إجراءً موثّقاً.", "/coordinator/escalations"), cancellationToken);
    }
}

/// <summary>انتهاء التوثيق يعلّق النشر فوراً — لا ظهور في الدليل بلا توثيق ساري.</summary>
public sealed class VerificationExpiredHandler(IApplicationDbContext db, IDirectorySearchCache cache)
    : INotificationHandler<DomainEventNotification<VerificationExpiredEvent>>
{
    public async Task Handle(DomainEventNotification<VerificationExpiredEvent> notification, CancellationToken cancellationToken)
    {
        var e = notification.Event;
        if (e.SubjectType == VerificationSubjectType.ProviderProfile)
        {
            var p = await db.ProviderProfiles.FirstOrDefaultAsync(x => x.Id == e.SubjectId && x.Status == PublicationStatus.Published, cancellationToken);
            p?.Suspend("verification_expired");
        }
        else
        {
            var o = await db.Organizations.FirstOrDefaultAsync(x => x.Id == e.SubjectId && x.Status == PublicationStatus.Published, cancellationToken);
            o?.Suspend("verification_expired");
        }
        await db.SaveChangesAsync(cancellationToken);
        await cache.InvalidateAsync(CacheKeys.DirectoryPrefix, cancellationToken);
    }
}
