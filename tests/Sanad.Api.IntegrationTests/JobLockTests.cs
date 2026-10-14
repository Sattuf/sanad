using FluentAssertions;
using Sanad.Infrastructure.Jobs;

namespace Sanad.Api.IntegrationTests;

/// <summary>المهام الخلفية تعمل على نسخة واحدة في كل مرة (ADR-0020).</summary>
public sealed class JobLockTests
{
    [Fact]
    public async Task In_process_lock_admits_one_runner_and_releases()
    {
        var jobLock = new InProcessJobLock();
        await using (var first = await jobLock.TryAcquireAsync("outbox", default))
        {
            first.Should().NotBeNull();
            (await jobLock.TryAcquireAsync("outbox", default)).Should().BeNull();
            (await jobLock.TryAcquireAsync("other-job", default)).Should().NotBeNull("أقفال المهام مستقلة");
        }
        (await jobLock.TryAcquireAsync("outbox", default)).Should().NotBeNull();
    }

    [PostgresFact]
    public async Task Postgres_advisory_lock_admits_one_instance_across_connections()
    {
        await using var database = await PostgresTestDatabase.CreateAsync();
        // نسختان من الـ API = كائنا قفل مستقلان على القاعدة نفسها
        var instanceA = new PostgresAdvisoryJobLock(database.ConnectionString);
        var instanceB = new PostgresAdvisoryJobLock(database.ConnectionString);

        var ranOnB = false;
        await using (var held = await instanceA.TryAcquireAsync("adhkar-reminders", default))
        {
            held.Should().NotBeNull();
            (await instanceB.RunExclusiveAsync("adhkar-reminders", () => { ranOnB = true; return Task.CompletedTask; }, default)).Should().BeFalse();
            ranOnB.Should().BeFalse("نسخة واحدة فقط تشغّل المهمة في كل دورة");
            (await instanceB.TryAcquireAsync("outbox", default)).Should().NotBeNull();
        }

        (await instanceB.RunExclusiveAsync("adhkar-reminders", () => { ranOnB = true; return Task.CompletedTask; }, default)).Should().BeTrue();
        ranOnB.Should().BeTrue("القفل يُحرَّر عند انتهاء العمل");
    }

    [Fact]
    public void Lock_keys_are_stable_and_distinct()
    {
        PostgresAdvisoryJobLock.KeyFor("outbox").Should().Be(PostgresAdvisoryJobLock.KeyFor("outbox"));
        PostgresAdvisoryJobLock.KeyFor("outbox").Should().NotBe(PostgresAdvisoryJobLock.KeyFor("adhkar-reminders"));
    }
}
