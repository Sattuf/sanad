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
    IJobLock jobLock, ILogger<AdhkarReminderJob> logger) : BackgroundService
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
                await jobLock.RunExclusiveAsync("adhkar-reminders", async () =>
                {
                    var sent = await RunOnceAsync(stoppingToken);
                    if (sent > 0) logger.LogInformation("Sent {Count} adhkar reminders", sent);
                }, stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Adhkar reminder run failed");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    /// <summary>صفحة الأجهزة المستحقة في كل استعلام — تبقي الذاكرة وحجم المعاملة ثابتين مهما كبر عدد الأجهزة.</summary>
    public const int PageSize = 500;

    public async Task<int> RunOnceAsync(CancellationToken ct)
    {
        var sent = 0;
        var lastId = Guid.Empty;
        while (!ct.IsCancellationRequested)
        {
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<SanadDbContext>();
            var now = scope.ServiceProvider.GetRequiredService<IDateTime>().UtcNow;

            // المستحقة فقط (فهرس NextDueAtUtc)؛ والأجهزة القديمة قبل إضافة العمود تُحسب مرة واحدة ثم تأخذ قيمتها.
            // ترقيم بالمعرّف: جهاز فشل إرساله مؤقتاً يبقى مستحقاً، فلا يُعاد في الدورة نفسها بل في الدقيقة التالية.
            var page = await db.ReminderDevices
                .Where(d => d.Id.CompareTo(lastId) > 0)
                .Where(d => d.NextDueAtUtc <= now ||
                            (d.NextDueAtUtc == null && (d.MorningAt != null || d.EveningAt != null || d.SleepAt != null)))
                .OrderBy(d => d.Id)
                .Take(PageSize)
                .ToListAsync(ct);
            if (page.Count == 0) break;
            lastId = page[^1].Id;

            var work = page.SelectMany(d => d.DueSlots(now).Select(due => (Device: d, due.Slot, due.Day))).ToList();
            using var gate = new SemaphoreSlim(Math.Clamp(options.Value.MaxParallelSends, 1, 256));
            var results = await Task.WhenAll(work.Select(async w =>
            {
                await gate.WaitAsync(ct);
                try
                {
                    return (w.Device, w.Slot, w.Day, Result: await sender.SendAsync(w.Device, ReminderMessages.For(w.Slot), ct));
                }
                finally
                {
                    gate.Release();
                }
            }));

            // تحديث الحالة على خيط واحد (DbContext لا يقبل التوازي)
            var gone = new HashSet<Guid>();
            foreach (var r in results)
            {
                if (r.Result == PushDelivery.Gone && gone.Add(r.Device.Id)) db.ReminderDevices.Remove(r.Device);
                else if (r.Result == PushDelivery.Delivered)
                {
                    r.Device.MarkSent(r.Slot, r.Day);
                    sent++;
                }
                // الفشل المؤقت يُعاد في الدقيقة التالية ما دامت نافذة الوقت مفتوحة
            }
            foreach (var device in page.Where(d => !gone.Contains(d.Id))) device.RefreshNextDue(now);
            await db.SaveChangesAsync(ct);
            if (page.Count < PageSize) break;
        }
        return sent;
    }
}
