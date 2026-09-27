using Microsoft.Extensions.Logging;
using Microsoft.FeatureManagement;
using Sanad.Application.Common.Interfaces;
using Sanad.Infrastructure.Persistence;

namespace Sanad.Infrastructure.Notifications;

public static class FeatureFlags
{
    public const string PushNotifications = "PushNotifications";
    public const string WhatsAppNotifications = "WhatsAppNotifications";
}

/// <summary>قناة إشعار خارجية (FCM، واتساب...). كل قناة تستقبل نصاً عاماً فقط.</summary>
public interface IExternalNotificationChannel
{
    string FeatureFlag { get; }
    Task SendAsync(NotificationMessage message, CancellationToken ct);
}

/// <summary>
/// الموزّع المركّب: يحفظ الإشعار داخل التطبيق، يبثّه لحظياً، ثم يمرّره للقنوات الخارجية المفعّلة بـ Feature Flag فقط.
/// </summary>
public sealed class CompositeNotificationDispatcher(
    SanadDbContext db, IRealtimePublisher realtime, IDateTime clock, IFeatureManager features,
    IEnumerable<IExternalNotificationChannel> channels, ILogger<CompositeNotificationDispatcher> logger) : INotificationDispatcher
{
    public async Task DispatchAsync(NotificationMessage message, CancellationToken ct)
    {
        var entity = new UserNotification
        {
            UserId = message.RecipientUserId, Kind = message.Kind, Title = message.Title, Body = message.Body, Link = message.Link,
            CreatedAtUtc = clock.UtcNow,
        };
        db.UserNotifications.Add(entity);
        await db.SaveChangesAsync(ct);
        await realtime.PublishToUserAsync(message.RecipientUserId, "notification", new { id = entity.Id, kind = message.Kind, title = message.Title }, ct);

        foreach (var channel in channels)
        {
            if (!await features.IsEnabledAsync(channel.FeatureFlag)) continue;
            try
            {
                await channel.SendAsync(message, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "External notification channel {Channel} failed", channel.GetType().Name);
            }
        }
    }
}

/// <summary>
/// FCM — خلف Feature Flag. يتطلب حساب خدمة Firebase ورموز أجهزة مسجّلة؛ غير مُفعّل في هذا الإصدار (ADR-0009).
/// </summary>
public sealed class FcmNotificationChannel(ILogger<FcmNotificationChannel> logger) : IExternalNotificationChannel
{
    public string FeatureFlag => FeatureFlags.PushNotifications;

    public Task SendAsync(NotificationMessage message, CancellationToken ct)
    {
        logger.LogInformation("FCM channel enabled but no provider credentials configured — skipped ({Kind})", message.Kind);
        return Task.CompletedTask;
    }
}

/// <summary>واتساب — خلف Feature Flag اختياري، يتطلب مزود WhatsApp Business ومراجعة قانونية قبل التفعيل.</summary>
public sealed class WhatsAppNotificationChannel(ILogger<WhatsAppNotificationChannel> logger) : IExternalNotificationChannel
{
    public string FeatureFlag => FeatureFlags.WhatsAppNotifications;

    public Task SendAsync(NotificationMessage message, CancellationToken ct)
    {
        logger.LogInformation("WhatsApp channel enabled but no provider configured — skipped ({Kind})", message.Kind);
        return Task.CompletedTask;
    }
}
