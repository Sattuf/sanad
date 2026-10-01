using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using Npgsql;

namespace Sanad.Infrastructure.Jobs;

/// <summary>
/// تشغيل مهمة خلفية على نسخة واحدة فقط من الـ API في كل مرة (ADR-0020). كل النسخ تحاول، والقفل يُعطى لواحدة،
/// والباقي يتخطى هذه الدورة بلا انتظار — فلا تكرار لتذكير ولا لرسالة Outbox مع التوسّع الأفقي.
/// </summary>
public interface IJobLock
{
    /// <returns>مقبض يُحرَّر عند Dispose، أو null إن كانت نسخة أخرى تشغّل المهمة الآن.</returns>
    Task<IAsyncDisposable?> TryAcquireAsync(string jobName, CancellationToken ct);
}

public static class JobLockExtensions
{
    /// <summary>ينفّذ العمل إن حصل على القفل، ويعيد false إن كانت نسخة أخرى تتولاه.</summary>
    public static async Task<bool> RunExclusiveAsync(this IJobLock jobLock, string jobName, Func<Task> work, CancellationToken ct)
    {
        await using var held = await jobLock.TryAcquireAsync(jobName, ct);
        if (held is null) return false;
        await work();
        return true;
    }
}

/// <summary>
/// قفل استشاري في PostgreSQL على اتصال مستقل يبقى مفتوحاً طوال العمل. إن سقطت النسخة أو انقطع الاتصال
/// يحرّر PostgreSQL القفل تلقائياً بإغلاق الجلسة — لا أقفال يتيمة ولا جدول أقفال.
/// </summary>
public sealed class PostgresAdvisoryJobLock(string connectionString) : IJobLock
{
    public async Task<IAsyncDisposable?> TryAcquireAsync(string jobName, CancellationToken ct)
    {
        var key = KeyFor(jobName);
        var connection = new NpgsqlConnection(connectionString);
        try
        {
            await connection.OpenAsync(ct);
            await using var cmd = new NpgsqlCommand("SELECT pg_try_advisory_lock(@key)", connection);
            cmd.Parameters.AddWithValue("key", key);
            if (await cmd.ExecuteScalarAsync(ct) is true) return new Handle(connection, key);
        }
        catch
        {
            await connection.DisposeAsync();
            throw;
        }
        await connection.DisposeAsync();
        return null;
    }

    /// <summary>مفتاح 64 بت ثابت لكل اسم مهمة (بادئة تمنع التصادم مع أقفال أي تطبيق آخر على القاعدة نفسها).</summary>
    public static long KeyFor(string jobName) =>
        BitConverter.ToInt64(SHA256.HashData(Encoding.UTF8.GetBytes($"sanad-job:{jobName}")), 0);

    private sealed class Handle(NpgsqlConnection connection, long key) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync()
        {
            try
            {
                await using var cmd = new NpgsqlCommand("SELECT pg_advisory_unlock(@key)", connection);
                cmd.Parameters.AddWithValue("key", key);
                await cmd.ExecuteScalarAsync();
            }
            catch (NpgsqlException)
            {
                // الاتصال انقطع — PostgreSQL حرّر القفل مع الجلسة
            }
            finally
            {
                await connection.DisposeAsync();
            }
        }
    }
}

/// <summary>SQLite (تطوير/اختبار): نسخة واحدة بطبيعتها — يكفي منع التداخل داخل العملية نفسها.</summary>
public sealed class InProcessJobLock : IJobLock
{
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _locks = new();

    public Task<IAsyncDisposable?> TryAcquireAsync(string jobName, CancellationToken ct)
    {
        var gate = _locks.GetOrAdd(jobName, _ => new SemaphoreSlim(1, 1));
        return Task.FromResult<IAsyncDisposable?>(gate.Wait(0, ct) ? new Release(gate) : null);
    }

    private sealed class Release(SemaphoreSlim gate) : IAsyncDisposable
    {
        public ValueTask DisposeAsync()
        {
            gate.Release();
            return ValueTask.CompletedTask;
        }
    }
}
