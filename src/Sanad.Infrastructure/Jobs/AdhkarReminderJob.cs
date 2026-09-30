using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Modules.Ruqyah;
using Sanad.Infrastructure.Notifications;
using Sanad.Infrastructure.Persistence;

namespace Sanad.Infrastructure.Jobs;

/// <summary>
/// مهمة كل دقيقة: ترسل تذكير الأذكار لكل جهاز حان وقته بتوقيت صاحبه، مرة واحدة في اليوم لكل وقت.
/// الجهاز الذي أبلغت خدمة الدفع بزواله (404/410) يُحذف. لا تعمل إن لم تُعدّ مفاتيح VAPID.
/// </summary>
public sealed class AdhkarReminderJob(IServiceScopeFactory scopes, IReminderPushSender sender, IOptions<WebPushOptions> options,
    ILogger<AdhkarReminderJob> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!sender.IsConfigured || !options.Value.SchedulerEnabled) return;
        using var timer = new PeriodicTimer(Interval);
        do
        {
            try
            {
                var sent = await RunOnceAsync(stoppingToken);
                if (sent > 0) logger.LogInformation("Sent {Count} adhkar reminders", sent);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Adhkar reminder run failed");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    public async Task<int> RunOnceAsync(CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<SanadDbContext>();
        var now = scope.ServiceProvider.GetRequiredService<IDateTime>().UtcNow;
        var devices = await db.ReminderDevices
            .Where(d => d.MorningAt != null || d.EveningAt != null || d.SleepAt != null)
            .ToListAsync(ct);

        var sent = 0;
        foreach (var device in devices)
        {
            foreach (var (slot, day) in device.DueSlots(now))
            {
                var result = await sender.SendAsync(device, ReminderMessages.For(slot), ct);
                if (result == PushDelivery.Gone)
                {
                    db.ReminderDevices.Remove(device);
                    break;
                }
                // الفشل المؤقت يُعاد في الدقيقة التالية ما دامت نافذة الوقت مفتوحة
                if (result == PushDelivery.Delivered)
                {
                    device.MarkSent(slot, day);
                    sent++;
                }
            }
        }
        await db.SaveChangesAsync(ct);
        return sent;
    }
}
