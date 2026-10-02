using System.Collections.Concurrent;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Sanad.Infrastructure.Identity;

namespace Sanad.Api.IntegrationTests.Infrastructure;

/// <summary>
/// مضيف اختبار كامل للـ API الحقيقي: قاعدة SQLite ملف مؤقت لكل Fixture، مفاتيح عشوائية، CAPTCHA معطّل،
/// ومزود SMS يلتقط الرموز. Outbox معطّل كخدمة خلفية ويُشغَّل يدوياً حيث يلزم.
/// (Testcontainers/PostgreSQL متاح عبر SANAD_TEST_POSTGRES — راجع ADR-0002.)
/// </summary>
public sealed class SanadApiFactory(Action<IServiceCollection>? configureServices = null, IReadOnlyDictionary<string, string>? extraSettings = null)
    : WebApplicationFactory<Program>
{
    public const string AdminEmail = "bootstrap-admin@sanad.test";
    public const string AdminTempPassword = "Bootstrap-Temp-Pass1";

    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"sanad_test_{Guid.NewGuid():N}.db");
    private readonly string _storagePath = Path.Combine(Path.GetTempPath(), $"sanad_storage_{Guid.NewGuid():N}");

    public CapturingSmsSender Sms { get; } = new();

    public string ConnectionString => $"Data Source={_dbPath};Pooling=False";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        var settings = new Dictionary<string, string>
        {
            ["Database:Provider"] = "Sqlite",
            ["ConnectionStrings:Sanad"] = $"Data Source={_dbPath};Default Timeout=60",
            ["Auth:Jwt:SigningKeyBase64"] = Key(48),
            ["Encryption:FieldKeyBase64"] = Key(32),
            ["Otp:HmacKeyBase64"] = Key(32),
            ["Otp:ResendCooldownSeconds"] = "0",
            ["Storage:UrlSigningKeyBase64"] = Key(32),
            ["Storage:RootPath"] = _storagePath,
            ["Captcha:Enabled"] = "false",
            ["Outbox:Enabled"] = "false",
            ["WebPush:SchedulerEnabled"] = "false",
            ["Bootstrap:AdminEmail"] = AdminEmail,
            ["Bootstrap:AdminTempPassword"] = AdminTempPassword,
            ["RateLimiting:GlobalPerMinute"] = "100000",
            ["RateLimiting:AuthPerMinute"] = "100000",
            ["RateLimiting:OtpRequestsPerMinute"] = "100000",
            ["RateLimiting:OtpVerifyPerMinute"] = "100000",
            ["RateLimiting:ShareLinksPerHour"] = "100000",
            ["RateLimiting:UploadsPerHour"] = "100000",
            ["RateLimiting:MessagesPerMinute"] = "100000",
            ["RateLimiting:PublicPerMinute"] = "100000",
            ["RateLimiting:KhatmaInvitesPerHour"] = "100000",
            ["Serilog:MinimumLevel:Default"] = "Warning",
        };
        foreach (var (k, v) in extraSettings ?? new Dictionary<string, string>()) settings[k] = v;
        foreach (var (k, v) in settings) builder.UseSetting(k, v);

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<ISmsSender>();
            services.AddSingleton<ISmsSender>(Sms);
            configureServices?.Invoke(services);
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        SqliteConnection.ClearAllPools();
        TryDelete(() => File.Delete(_dbPath));
        TryDelete(() => Directory.Delete(_storagePath, recursive: true));
    }

    private static void TryDelete(Action action)
    {
        try { action(); } catch (IOException) { } catch (UnauthorizedAccessException) { }
    }

    private static string Key(int bytes) => Convert.ToBase64String(RandomNumberGenerator.GetBytes(bytes));
}

public sealed class CapturingSmsSender : ISmsSender
{
    private readonly ConcurrentDictionary<string, string> _last = new();

    public Task SendAsync(string phoneNumberE164, string message, CancellationToken ct)
    {
        _last[phoneNumberE164] = new string(message.Where(char.IsAsciiDigit).Take(6).ToArray());
        return Task.CompletedTask;
    }

    public string LastCodeFor(string phone) => _last[phone];
}

/// <summary>RFC 6238 TOTP — لاجتياز 2FA الحقيقي في الاختبارات كما يفعل تطبيق المصادقة.</summary>
public static class Totp
{
    public static string Compute(string base32Secret)
    {
        var key = Base32Decode(base32Secret);
        var counter = DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 30;
        var counterBytes = BitConverter.GetBytes(counter);
        if (BitConverter.IsLittleEndian) Array.Reverse(counterBytes);
        var hash = HMACSHA1.HashData(key, counterBytes);
        var offset = hash[^1] & 0x0F;
        var binary = ((hash[offset] & 0x7F) << 24) | (hash[offset + 1] << 16) | (hash[offset + 2] << 8) | hash[offset + 3];
        return (binary % 1_000_000).ToString("D6", System.Globalization.CultureInfo.InvariantCulture);
    }

    private static byte[] Base32Decode(string input)
    {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        var clean = input.Trim().Replace(" ", "", StringComparison.Ordinal).TrimEnd('=').ToUpperInvariant();
        var output = new List<byte>();
        int buffer = 0, bits = 0;
        foreach (var c in clean)
        {
            buffer = (buffer << 5) | alphabet.IndexOf(c, StringComparison.Ordinal);
            bits += 5;
            if (bits >= 8)
            {
                output.Add((byte)(buffer >> (bits - 8)));
                bits -= 8;
            }
        }
        return output.ToArray();
    }
}
