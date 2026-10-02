using System.Security.Cryptography;
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using StackExchange.Redis;

namespace Sanad.Infrastructure.RateLimiting;

/// <summary>
/// يختار مخزن العدّادات: Redis المشترك إن أُعدّ (الإنتاج — حراسة إقلاع)، وإلا ذاكرة النسخة (تطوير/نسخة واحدة).
/// </summary>
public static class RateLimitPartitions
{
    public static RateLimitPartition<string> FixedWindow(HttpContext ctx, string policy, string subject, int permitLimit, TimeSpan window)
    {
        // لا يُخزَّن عنوان IP ولا معرّف المستخدم في Redis كما هو — بصمة مختصرة تكفي للتمييز
        var partitionKey = $"{policy}:{Fingerprint(subject)}";
        var redis = ctx.RequestServices.GetService<IConnectionMultiplexer>();
        if (redis is null)
            return RateLimitPartition.GetFixedWindowLimiter(partitionKey, _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = permitLimit,
                Window = window,
                QueueLimit = 0,
            });

        var logger = ctx.RequestServices.GetService<ILoggerFactory>()?.CreateLogger<RedisFixedWindowRateLimiter>();
        return RateLimitPartition.Get(partitionKey, key => new RedisFixedWindowRateLimiter(redis, key, permitLimit, window, logger));
    }

    public static string Fingerprint(string subject) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(subject)).AsSpan(0, 12));
}
