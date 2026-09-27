using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;
using Sanad.Application.Common.Interfaces;

namespace Sanad.Infrastructure.Storage;

public sealed class StorageOptions
{
    public const string Section = "Storage";

    public string RootPath { get; set; } = "storage";

    /// <summary>مفتاح توقيع روابط التنزيل القصيرة (Base64). إن غاب يُولَّد عشوائياً عند الإقلاع.</summary>
    public string? UrlSigningKeyBase64 { get; set; }

    public int MaxDocumentMegabytes { get; set; } = 10;
    public int MaxAudioMegabytes { get; set; } = 60;

    /// <summary>للصوت المستورد من المصادر المعتمدة فقط (سورة البقرة بجودة 128kbps ≈ 120 ميجابايت).</summary>
    public int MaxImportedAudioMegabytes { get; set; } = 250;
}

/// <summary>
/// تخزين محلي على القرص (تطوير/نشر بسيط) بواجهة IFileStorage نفسها التي يطبّقها مزود Object Storage لاحقاً.
/// الروابط الخاصة موقّعة HMAC بانتهاء صلاحية قصير، وتُخدَم عبر Endpoint واحد يتحقق من التوقيع.
/// </summary>
public sealed class LocalFileStorage : IFileStorage
{
    private static readonly byte[] EphemeralKey = RandomNumberGenerator.GetBytes(32);
    private readonly string _root;
    private readonly byte[] _signingKey;

    public LocalFileStorage(IOptions<StorageOptions> options)
    {
        _root = Path.GetFullPath(options.Value.RootPath);
        Directory.CreateDirectory(_root);
        _signingKey = string.IsNullOrWhiteSpace(options.Value.UrlSigningKeyBase64) ? EphemeralKey : Convert.FromBase64String(options.Value.UrlSigningKeyBase64);
    }

    public string RootPath => _root;

    public async Task SaveAsync(string objectKey, Stream content, string contentType, CancellationToken ct)
    {
        var path = Resolve(objectKey);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await using var file = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, useAsync: true);
        await content.CopyToAsync(file, ct);
    }

    public Task<Stream?> OpenReadAsync(string objectKey, CancellationToken ct)
    {
        var path = Resolve(objectKey);
        return Task.FromResult<Stream?>(File.Exists(path)
            ? new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true)
            : null);
    }

    public Task DeleteAsync(string objectKey, CancellationToken ct)
    {
        var path = Resolve(objectKey);
        if (File.Exists(path)) File.Delete(path);
        return Task.CompletedTask;
    }

    public string GenerateShortLivedDownloadUrl(string objectKey, TimeSpan ttl)
    {
        var exp = DateTimeOffset.UtcNow.Add(ttl).ToUnixTimeSeconds();
        var sig = Sign(objectKey, exp);
        return $"/api/v1/files/signed?key={Uri.EscapeDataString(objectKey)}&exp={exp}&sig={sig}";
    }

    public bool ValidateSignature(string objectKey, long exp, string sig)
    {
        if (DateTimeOffset.UtcNow.ToUnixTimeSeconds() > exp) return false;
        var expected = Encoding.ASCII.GetBytes(Sign(objectKey, exp));
        var actual = Encoding.ASCII.GetBytes(sig ?? string.Empty);
        return expected.Length == actual.Length && CryptographicOperations.FixedTimeEquals(expected, actual);
    }

    private string Sign(string key, long exp) =>
        Convert.ToHexString(HMACSHA256.HashData(_signingKey, Encoding.UTF8.GetBytes($"{key}|{exp}"))).ToLowerInvariant();

    /// <summary>يمنع الخروج من جذر التخزين (Path Traversal).</summary>
    private string Resolve(string objectKey)
    {
        if (string.IsNullOrWhiteSpace(objectKey) || objectKey.Contains("..", StringComparison.Ordinal) || Path.IsPathRooted(objectKey))
            throw new InvalidOperationException("مفتاح تخزين غير صالح.");
        var full = Path.GetFullPath(Path.Combine(_root, objectKey.Replace('/', Path.DirectorySeparatorChar)));
        var rootWithSeparator = _root.EndsWith(Path.DirectorySeparatorChar) ? _root : _root + Path.DirectorySeparatorChar;
        if (!full.StartsWith(rootWithSeparator, StringComparison.Ordinal)) throw new InvalidOperationException("مفتاح تخزين غير صالح.");
        return full;
    }
}

public sealed class ObjectStorageHealthCheck(IFileStorage storage) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        if (storage is LocalFileStorage local)
            return Task.FromResult(Directory.Exists(local.RootPath) ? HealthCheckResult.Healthy() : HealthCheckResult.Unhealthy("storage root missing"));
        return Task.FromResult(HealthCheckResult.Healthy());
    }
}
