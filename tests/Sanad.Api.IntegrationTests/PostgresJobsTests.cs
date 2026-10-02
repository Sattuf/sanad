using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Sanad.Api.IntegrationTests.Infrastructure;
using Sanad.Application.Modules.Ruqyah;
using Sanad.Domain.Ruqyah;
using Sanad.Infrastructure.Jobs;
using Sanad.Infrastructure.Persistence;
using Sanad.Infrastructure.Persistence.Outbox;

namespace Sanad.Api.IntegrationTests;

/// <summary>المهام الخلفية على PostgreSQL الحقيقي: الهجرات، والقفل الاستشاري، واستعلامات الترقيم والدفعات.</summary>
public sealed class PostgresJobsTests
{
    [PostgresFact]
    public async Task Reminder_job_and_outbox_work_on_postgres_with_the_advisory_lock()
    {
        await using var database = await PostgresTestDatabase.CreateAsync();
        var sender = new ReminderFixture.FakePushSender();
        using var factory = new SanadApiFactory(
            services =>
            {
                services.RemoveAll<IReminderPushSender>();
                services.AddSingleton<IReminderPushSender>(sender);
            },
            new Dictionary<string, string>
            {
                ["Database:Provider"] = "Postgres",
                ["ConnectionStrings:Sanad"] = database.ConnectionString,
                ["Database:ApplyMigrationsOnStartup"] = "true",
            });
        var api = new TestApi(factory);
        var owner = await api.RegisterBeneficiaryAsync();

        factory.Services.GetRequiredService<IJobLock>().Should().BeOfType<PostgresAdvisoryJobLock>();

        var now = DateTimeOffset.UtcNow;
        var dueAt = TimeOnly.FromDateTime(now.AddMinutes(-1).UtcDateTime);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SanadDbContext>();
            for (var i = 0; i < AdhkarReminderJob.PageSize + 20; i++)
            {
                var d = ReminderDevice.Register(owner.UserId, $"https://fcm.googleapis.com/fcm/send/pg-{i}", "BAAA", "aaaa", now);
                d.Schedule("UTC", dueAt, null, null, now);
                db.ReminderDevices.Add(d);
            }
            await db.SaveChangesAsync();
        }

        var job = factory.Services.GetRequiredService<AdhkarReminderJob>();
        (await job.RunOnceAsync(CancellationToken.None)).Should().Be(AdhkarReminderJob.PageSize + 20);
        (await job.RunOnceAsync(CancellationToken.None)).Should().Be(0, "لا تكرار في اليوم نفسه");

        // Outbox: الدفعة تُختار في القاعدة وتُعالَج
        var outbox = factory.Services.GetRequiredService<OutboxProcessor>();
        while (await outbox.ProcessBatchAsync(CancellationToken.None) > 0) { }
        await using var check = factory.Services.CreateAsyncScope();
        var after = check.ServiceProvider.GetRequiredService<SanadDbContext>();
        (await after.OutboxMessages.CountAsync(m => m.ProcessedAtUtc == null)).Should().Be(0);
    }
}
