using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging;
using Sanad.Application.Common.Interfaces;

namespace Sanad.Infrastructure.Caching;

/// <summary>
/// Cache فوق IDistributedCache (Redis في الإنتاج، ذاكرة محلياً). الإبطال بالبادئة يتم برفع "إصدار" البادئة —
/// المفاتيح القديمة تصبح غير قابلة للوصول وتنتهي بانتهاء صلاحيتها، بلا حاجة لمسح أنماط في Redis.
/// فشل الـ Cache لا يُسقط الطلب أبداً — يُقرأ من قاعدة البيانات مباشرة.
/// </summary>
public sealed class DistributedDirectorySearchCache(IDistributedCache cache, ILogger<DistributedDirectorySearchCache> logger) : IDirectorySearchCache
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<T?> GetAsync<T>(string key, CancellationToken ct)
    {
        try
        {
            var json = await cache.GetStringAsync(await VersionedKeyAsync(key, ct), ct);
            return json is null ? default : JsonSerializer.Deserialize<T>(json, Json);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Cache read failed");
            return default;
        }
    }

    public async Task SetAsync<T>(string key, T value, TimeSpan ttl, CancellationToken ct)
    {
        try
        {
            await cache.SetStringAsync(await VersionedKeyAsync(key, ct), JsonSerializer.Serialize(value, Json),
                new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = ttl }, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Cache write failed");
        }
    }

    public async Task InvalidateAsync(string keyPrefix, CancellationToken ct)
    {
        try
        {
            await cache.SetStringAsync(VersionKey(keyPrefix), Guid.NewGuid().ToString("N"),
                new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromDays(7) }, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Cache invalidation failed");
        }
    }

    private async Task<string> VersionedKeyAsync(string key, CancellationToken ct)
    {
        var prefix = key.Contains(':', StringComparison.Ordinal) ? key[..(key.IndexOf(':', StringComparison.Ordinal) + 1)] : key;
        var version = await cache.GetStringAsync(VersionKey(prefix), ct) ?? "0";
        return $"sanad:cache:{version}:{key}";
    }

    private static string VersionKey(string prefix) => $"sanad:cache-version:{prefix}";
}
