using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Sanad.Application.Common.Interfaces;
using Sanad.Domain.Verification;
using Sanad.Infrastructure.Persistence;

namespace Sanad.Infrastructure.Jobs;

/// <summary>
/// مهمة دورية: كل توثيق تجاوز تاريخ انتهائه يصبح Expired، وحدث VerificationExpiredEvent يعلّق النشر عبر Outbox.
/// (الدليل يرفض العرض بلا توثيق ساري حتى قبل مرور المهمة — هذا حزام أمان إضافي لا الضمانة الوحيدة.)
/// </summary>
public sealed class VerificationExpiryCheckJob(IServiceScopeFactory scopes, ILogger<VerificationExpiryCheckJob> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval);
        do
        {
            try
            {
                var expired = await RunOnceAsync(stoppingToken);
                if (expired > 0) logger.LogInformation("Expired {Count} verification records", expired);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Verification expiry check failed");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    public async Task<int> RunOnceAsync(CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<SanadDbContext>();
        var now = scope.ServiceProvider.GetRequiredService<IDateTime>().UtcNow;
        var due = await db.VerificationRecords
            .Where(v => (v.Status == VerificationStatus.Approved || v.Status == VerificationStatus.ConditionallyApproved) &&
                        v.ExpiresAtUtc != null && v.ExpiresAtUtc < now)
            .ToListAsync(ct);
        foreach (var v in due) v.ExpireIfPastDue(now);
        await db.SaveChangesAsync(ct);
        return due.Count;
    }
}
