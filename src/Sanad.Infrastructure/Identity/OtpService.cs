using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Infrastructure.Persistence;

namespace Sanad.Infrastructure.Identity;

public sealed class OtpOptions
{
    public const string Section = "Otp";

    /// <summary>مفتاح HMAC لتجزئة رموز OTP (Base64). إن غاب يُولَّد عشوائياً عند الإقلاع — مقبول لنسخة واحدة فقط.</summary>
    public string? HmacKeyBase64 { get; set; }
    public int CodeLifetimeMinutes { get; set; } = 5;
    public int MaxAttempts { get; set; } = 5;
    public int ResendCooldownSeconds { get; set; } = 60;
    public int MaxRequestsPerPhonePerHour { get; set; } = 5;

    /// <summary>بيئة التطوير فقط: طباعة الرمز في السجل بدل مزود SMS حقيقي.</summary>
    public bool DevelopmentLogCodes { get; set; }
}

public interface IOtpService
{
    Task SendOtpAsync(string phoneNumberE164, CancellationToken ct);
    Task<bool> VerifyOtpAsync(string phoneNumberE164, string code, CancellationToken ct);
}

public interface ISmsSender
{
    Task SendAsync(string phoneNumberE164, string message, CancellationToken ct);
}

/// <summary>الافتراضي خارج التطوير: يرفض الإرسال صراحة حتى يُعدّ مزود فعلي بعد مراجعته قانونياً (08 §8.5).</summary>
public sealed class NotConfiguredSmsSender : ISmsSender
{
    public Task SendAsync(string phoneNumberE164, string message, CancellationToken ct) =>
        throw new InvalidOperationException("مزود رسائل OTP غير مُعدّ. لا يُستخدم مع أرقام حقيقية قبل مراجعة قانونية لمزود الرسائل.");
}

public sealed class DevelopmentLogSmsSender(ILogger<DevelopmentLogSmsSender> logger) : ISmsSender
{
    public Task SendAsync(string phoneNumberE164, string message, CancellationToken ct)
    {
        logger.LogWarning("[DEV ONLY] SMS to ***{Last4}: {Message}", phoneNumberE164[^4..], message);
        return Task.CompletedTask;
    }
}

public sealed class OtpService : IOtpService
{
    private readonly SanadDbContext _db;
    private readonly ISmsSender _sms;
    private readonly IDateTime _clock;
    private readonly OtpOptions _options;
    private readonly byte[] _hmacKey;

    private static readonly byte[] EphemeralKey = RandomNumberGenerator.GetBytes(32);

    public OtpService(SanadDbContext db, ISmsSender sms, IDateTime clock, IOptions<OtpOptions> options)
    {
        _db = db;
        _sms = sms;
        _clock = clock;
        _options = options.Value;
        _hmacKey = string.IsNullOrWhiteSpace(_options.HmacKeyBase64) ? EphemeralKey : Convert.FromBase64String(_options.HmacKeyBase64);
    }

    public async Task SendOtpAsync(string phoneNumberE164, CancellationToken ct)
    {
        var now = _clock.UtcNow;
        var hourAgo = now.AddHours(-1);
        var recent = await _db.OtpChallenges.Where(c => c.PhoneNumberE164 == phoneNumberE164 && c.CreatedAtUtc > hourAgo).ToListAsync(ct);

        // حماية من استنزاف رصيد مزود الرسائل: مهلة بين الطلبات + سقف ساعي لكل رقم (بالإضافة لحد المعدل وCAPTCHA في الـ Endpoint)
        if (recent.Count >= _options.MaxRequestsPerPhonePerHour)
            throw new TooManyRequestsException("تجاوزت عدد طلبات رمز التحقق المسموح لهذا الرقم. حاول لاحقاً.");
        if (recent.Any(c => c.CreatedAtUtc > now.AddSeconds(-_options.ResendCooldownSeconds)))
            throw new TooManyRequestsException("انتظر قليلاً قبل طلب رمز جديد.");

        foreach (var active in recent.Where(c => c.ConsumedAtUtc == null)) active.ConsumedAtUtc = now; // رمز واحد فعّال فقط

        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6", System.Globalization.CultureInfo.InvariantCulture);
        _db.OtpChallenges.Add(new OtpChallenge
        {
            PhoneNumberE164 = phoneNumberE164,
            CodeHash = HashCode(phoneNumberE164, code),
            CreatedAtUtc = now,
            ExpiresAtUtc = now.AddMinutes(_options.CodeLifetimeMinutes),
        });
        await _db.SaveChangesAsync(ct);
        await _sms.SendAsync(phoneNumberE164, $"رمز التحقق في سند: {code} — صالح {_options.CodeLifetimeMinutes} دقائق. لا تشاركه مع أحد.", ct);
    }

    public async Task<bool> VerifyOtpAsync(string phoneNumberE164, string code, CancellationToken ct)
    {
        var now = _clock.UtcNow;
        var challenge = (await _db.OtpChallenges.Where(c => c.PhoneNumberE164 == phoneNumberE164 && c.ConsumedAtUtc == null).ToListAsync(ct))
            .OrderByDescending(c => c.CreatedAtUtc).FirstOrDefault();
        if (challenge is null || challenge.ExpiresAtUtc <= now || challenge.FailedAttempts >= _options.MaxAttempts) return false;

        var expected = Convert.FromHexString(challenge.CodeHash);
        var actual = Convert.FromHexString(HashCode(phoneNumberE164, code));
        if (!CryptographicOperations.FixedTimeEquals(expected, actual))
        {
            challenge.FailedAttempts++;
            if (challenge.FailedAttempts >= _options.MaxAttempts) challenge.ConsumedAtUtc = now;
            await _db.SaveChangesAsync(ct);
            return false;
        }
        challenge.ConsumedAtUtc = now;
        await _db.SaveChangesAsync(ct);
        return true;
    }

    private string HashCode(string phone, string code) =>
        Convert.ToHexString(HMACSHA256.HashData(_hmacKey, Encoding.UTF8.GetBytes($"{phone}|{code}"))).ToLowerInvariant();
}
