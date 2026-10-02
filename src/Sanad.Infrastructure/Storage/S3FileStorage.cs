using System.Net;
using Amazon;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Options;
using Sanad.Application.Common.Interfaces;

namespace Sanad.Infrastructure.Storage;

/// <summary>
/// إعداد تخزين الكائنات المتوافق مع S3 (Amazon S3، Cloudflare R2، MinIO...). الحاوية خاصة دائماً؛
/// الوصول العام للمحتوى المنشور فقط عبر CDN (PublicBaseUrl) أو روابط موقّعة قصيرة.
/// </summary>
public sealed class S3StorageOptions
{
    public const string Section = "Storage:S3";

    public string Bucket { get; set; } = "";

    /// <summary>عنوان الخدمة لغير Amazon (R2/MinIO). فارغ = Amazon S3 بالمنطقة المحددة.</summary>
    public string? ServiceUrl { get; set; }

    public string Region { get; set; } = "us-east-1";
    public bool ForcePathStyle { get; set; }

    /// <summary>فارغان = سلسلة اعتماد AWS الافتراضية (دور IAM للخادم) — الأفضل في الإنتاج.</summary>
    public string? AccessKey { get; set; }
    public string? SecretKey { get; set; }

    /// <summary>نطاق CDN أمام الحاوية (مثل https://media.sanad.app). إن غاب يُوجَّه المستمع لرابط موقّع مؤقت.</summary>
    public string? PublicBaseUrl { get; set; }

    /// <summary>البادئات التي يجوز عرضها عبر CDN — المحتوى العام فقط. مستندات التوثيق لا تُعرض هكذا أبداً.</summary>
    public string[] PublicPrefixes { get; set; } = ["library-audio/", "recitation-cache/"];
}

public sealed class S3FileStorage : IFileStorage, IDisposable
{
    private readonly IAmazonS3 _s3;
    private readonly S3StorageOptions _options;

    public S3FileStorage(IOptions<S3StorageOptions> options)
    {
        _options = options.Value;
        if (string.IsNullOrWhiteSpace(_options.Bucket)) throw new InvalidOperationException("Storage:S3:Bucket غير مُعدّ.");
        var config = new AmazonS3Config
        {
            ForcePathStyle = _options.ForcePathStyle,
            // بعض الخدمات المتوافقة (R2/MinIO القديمة) لا تدعم تحقق المجاميع الافتراضي الأحدث في SDK
            RequestChecksumCalculation = RequestChecksumCalculation.WHEN_REQUIRED,
            ResponseChecksumValidation = ResponseChecksumValidation.WHEN_REQUIRED,
        };
        if (string.IsNullOrWhiteSpace(_options.ServiceUrl)) config.RegionEndpoint = RegionEndpoint.GetBySystemName(_options.Region);
        else
        {
            config.ServiceURL = _options.ServiceUrl;
            config.AuthenticationRegion = _options.Region;
        }
        _s3 = string.IsNullOrWhiteSpace(_options.AccessKey)
            ? new AmazonS3Client(config)
            : new AmazonS3Client(new BasicAWSCredentials(_options.AccessKey, _options.SecretKey), config);
    }

    public async Task SaveAsync(string objectKey, Stream content, string contentType, CancellationToken ct)
    {
        await _s3.PutObjectAsync(new PutObjectRequest
        {
            BucketName = _options.Bucket,
            Key = Validate(objectKey),
            InputStream = content,
            ContentType = contentType,
            AutoCloseStream = false,
        }, ct);
    }

    public async Task<Stream?> OpenReadAsync(string objectKey, CancellationToken ct)
    {
        try
        {
            var response = await _s3.GetObjectAsync(_options.Bucket, Validate(objectKey), ct);
            return new ResponseStream(response);
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task DeleteAsync(string objectKey, CancellationToken ct) =>
        await _s3.DeleteObjectAsync(_options.Bucket, Validate(objectKey), ct);

    /// <summary>مستند خاص (للمنسق فقط): رابط موقّع من خدمة التخزين نفسها، صالح لدقائق.</summary>
    public string GenerateShortLivedDownloadUrl(string objectKey, TimeSpan ttl) => Presign(objectKey, ttl);

    /// <summary>
    /// المحتوى العام المنشور يُقرأ مباشرة من CDN (أو رابط موقّع) لا عبر الـ API — الصوت أكبر استهلاك للشبكة.
    /// أي بادئة خارج PublicPrefixes لا تُعرض عبر CDN أبداً.
    /// </summary>
    public string? DirectReadUrl(string objectKey, TimeSpan ttl)
    {
        Validate(objectKey);
        var isPublic = _options.PublicPrefixes.Any(p => objectKey.StartsWith(p, StringComparison.Ordinal));
        if (isPublic && !string.IsNullOrWhiteSpace(_options.PublicBaseUrl))
            return $"{_options.PublicBaseUrl.TrimEnd('/')}/{string.Join('/', objectKey.Split('/').Select(Uri.EscapeDataString))}";
        return Presign(objectKey, ttl);
    }

    public async Task<bool> CanReachBucketAsync(CancellationToken ct)
    {
        try
        {
            await _s3.ListObjectsV2Async(new ListObjectsV2Request { BucketName = _options.Bucket, MaxKeys = 1 }, ct);
            return true;
        }
        catch (AmazonServiceException)
        {
            return false;
        }
    }

    private string Presign(string objectKey, TimeSpan ttl) => _s3.GetPreSignedURL(new GetPreSignedUrlRequest
    {
        BucketName = _options.Bucket,
        Key = Validate(objectKey),
        Verb = HttpVerb.GET,
        Expires = DateTime.UtcNow.Add(ttl),
        Protocol = _options.ServiceUrl?.StartsWith("http://", StringComparison.OrdinalIgnoreCase) == true ? Protocol.HTTP : Protocol.HTTPS,
    });

    /// <summary>نفس قواعد التخزين المحلي: لا مسارات نسبية ولا مطلقة.</summary>
    private static string Validate(string objectKey)
    {
        if (string.IsNullOrWhiteSpace(objectKey) || objectKey.Contains("..", StringComparison.Ordinal) || objectKey.StartsWith('/') ||
            objectKey.Contains('\\', StringComparison.Ordinal))
            throw new InvalidOperationException("مفتاح تخزين غير صالح.");
        return objectKey;
    }

    public void Dispose() => _s3.Dispose();

    /// <summary>يغلق استجابة S3 مع الدفق.</summary>
    private sealed class ResponseStream(GetObjectResponse response) : Stream
    {
        private readonly Stream _inner = response.ResponseStream;
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => response.ContentLength;
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() { }
        public override int Read(byte[] buffer, int offset, int count) => _inner.Read(buffer, offset, count);
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) => _inner.ReadAsync(buffer, cancellationToken);
        public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) => _inner.ReadAsync(buffer, offset, count, cancellationToken);
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

        protected override void Dispose(bool disposing)
        {
            if (disposing) response.Dispose();
            base.Dispose(disposing);
        }
    }
}
