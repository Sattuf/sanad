using System.Net;
using Amazon.Runtime;
using Amazon.S3;
using FluentAssertions;
using Microsoft.Extensions.Options;
using Sanad.Api.IntegrationTests.Infrastructure;
using Sanad.Infrastructure.Storage;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using static Sanad.Api.IntegrationTests.Infrastructure.TestApi;

namespace Sanad.Api.IntegrationTests;

/// <summary>
/// خادم S3 للاختبار: خادم قائم عبر SANAD_TEST_S3_ENDPOINT، أو محاكي moto (واجهة S3 كاملة) عبر Testcontainers
/// حيث يتوفر Docker (SANAD_TEST_POSTGRES=1 في CI). صورة minio/minio لم تعد متاحة على Docker Hub.
/// </summary>
public sealed class S3FactAttribute : FactAttribute
{
    public S3FactAttribute()
    {
        if (S3TestServer.ExistingEndpoint is null && Environment.GetEnvironmentVariable("SANAD_TEST_POSTGRES") != "1")
            Skip = "S3 غير مفعّل (SANAD_TEST_S3_ENDPOINT، أو SANAD_TEST_POSTGRES=1 مع Docker).";
    }
}

public sealed class S3TestServer : IAsyncDisposable
{
    public static string? ExistingEndpoint => Environment.GetEnvironmentVariable("SANAD_TEST_S3_ENDPOINT") is { Length: > 0 } e ? e : null;

    private const string MotoImage = "motoserver/moto:5.2.3";
    private const int MotoPort = 5000;

    private readonly IContainer? _container;

    private S3TestServer(S3StorageOptions options, IContainer? container)
    {
        Options = options;
        _container = container;
    }

    public S3StorageOptions Options { get; }

    public static async Task<S3TestServer> StartAsync(string? publicBaseUrl = null)
    {
        IContainer? container = null;
        string endpoint;
        const string access = "test", secret = "test"; // moto يقبل أي مفاتيح
        if (ExistingEndpoint is { } existing) endpoint = existing;
        else
        {
            container = new ContainerBuilder()
                .WithImage(MotoImage)
                .WithPortBinding(MotoPort, true)
                .WithWaitStrategy(Wait.ForUnixContainer().UntilHttpRequestIsSucceeded(r => r.ForPort(MotoPort).ForPath("/")))
                .Build();
            await container.StartAsync();
            endpoint = $"http://{container.Hostname}:{container.GetMappedPublicPort(MotoPort)}";
        }

        var bucket = $"sanad-test-{Guid.NewGuid():N}"[..30];
        using (var admin = new AmazonS3Client(new BasicAWSCredentials(access, secret), new AmazonS3Config { ServiceURL = endpoint, ForcePathStyle = true, AuthenticationRegion = "us-east-1" }))
            await admin.PutBucketAsync(bucket);

        return new S3TestServer(new S3StorageOptions
        {
            Bucket = bucket,
            ServiceUrl = endpoint,
            ForcePathStyle = true,
            AccessKey = access,
            SecretKey = secret,
            PublicBaseUrl = publicBaseUrl,
        }, container);
    }

    public Dictionary<string, string> Settings() => new()
    {
        ["Storage:Provider"] = "S3",
        ["Storage:S3:Bucket"] = Options.Bucket,
        ["Storage:S3:ServiceUrl"] = Options.ServiceUrl!,
        ["Storage:S3:ForcePathStyle"] = "true",
        ["Storage:S3:AccessKey"] = Options.AccessKey!,
        ["Storage:S3:SecretKey"] = Options.SecretKey!,
        ["Storage:S3:PublicBaseUrl"] = Options.PublicBaseUrl ?? "",
    };

    public async ValueTask DisposeAsync()
    {
        if (_container is not null) await _container.DisposeAsync();
    }
}

public sealed class ObjectStorageTests
{
    private static S3FileStorage Offline(string? publicBaseUrl) => new(Options.Create(new S3StorageOptions
    {
        Bucket = "sanad-media",
        ServiceUrl = "https://example-account.r2.cloudflarestorage.com",
        AccessKey = "AKIAEXAMPLE",
        SecretKey = "secret",
        PublicBaseUrl = publicBaseUrl,
    }));

    [Fact]
    public void Published_audio_goes_through_the_cdn_and_private_documents_never_do()
    {
        using var storage = Offline("https://media.sanad.test/");
        storage.DirectReadUrl("library-audio/2026/10/abc.mp3", TimeSpan.FromHours(1)).Should().Be("https://media.sanad.test/library-audio/2026/10/abc.mp3");
        storage.DirectReadUrl("recitation-cache/afasy/001001.mp3", TimeSpan.FromHours(1)).Should().StartWith("https://media.sanad.test/recitation-cache/");

        // مستند توثيق: رابط موقّع مؤقت فقط — لا عنوان CDN دائم
        var doc = storage.DirectReadUrl("verification-docs/2026/10/x.pdf", TimeSpan.FromMinutes(5));
        doc.Should().NotStartWith("https://media.sanad.test").And.Contain("X-Amz-Signature").And.Contain("X-Amz-Expires=300");
        storage.GenerateShortLivedDownloadUrl("verification-docs/2026/10/x.pdf", TimeSpan.FromMinutes(5)).Should().Contain("X-Amz-Signature");
    }

    [Fact]
    public void Without_a_cdn_public_audio_gets_a_signed_link_and_bad_keys_are_rejected()
    {
        using var storage = Offline(null);
        storage.DirectReadUrl("library-audio/a.mp3", TimeSpan.FromHours(6)).Should().Contain("X-Amz-Signature");
        foreach (var bad in new[] { "../etc/passwd", "/abs/key", "a\\b", "" })
            storage.Invoking(s => s.DirectReadUrl(bad, TimeSpan.FromMinutes(1))).Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void Local_storage_keeps_streaming_through_the_api()
    {
        var local = new LocalFileStorage(Options.Create(new StorageOptions { RootPath = Path.Combine(Path.GetTempPath(), $"sanad-local-{Guid.NewGuid():N}") }));
        local.DirectReadUrl("library-audio/a.mp3", TimeSpan.FromHours(1)).Should().BeNull();
    }

    [S3Fact]
    public async Task S3_round_trip_save_read_delete()
    {
        await using var server = await S3TestServer.StartAsync();
        using var storage = new S3FileStorage(Options.Create(server.Options));
        var key = $"library-audio/test/{Guid.NewGuid():N}.mp3";

        await using (var content = new MemoryStream("ID3-sanad"u8.ToArray())) await storage.SaveAsync(key, content, "audio/mpeg", default);
        await using (var read = await storage.OpenReadAsync(key, default))
        {
            read.Should().NotBeNull();
            using var reader = new StreamReader(read!);
            (await reader.ReadToEndAsync()).Should().Be("ID3-sanad");
        }
        (await storage.CanReachBucketAsync(default)).Should().BeTrue();

        await storage.DeleteAsync(key, default);
        (await storage.OpenReadAsync(key, default)).Should().BeNull();
    }

    [S3Fact]
    public async Task Published_track_redirects_to_the_cdn_while_preview_streams_from_s3_through_the_api()
    {
        await using var server = await S3TestServer.StartAsync(publicBaseUrl: "https://media.sanad.test");
        using var factory = new SanadApiFactory(extraSettings: server.Settings());
        var api = new TestApi(factory);

        var published = await api.TrackAsync();
        var res = await api.Client().GetAsync($"/api/v1/media/tracks/{published}");
        res.StatusCode.Should().Be(HttpStatusCode.Redirect);
        res.Headers.Location!.ToString().Should().StartWith("https://media.sanad.test/library-audio/");

        var draft = await api.TrackAsync(publish: false);
        var preview = await api.Client(await api.ContentManagerAsync()).GetAsync($"/api/v1/media/tracks/{draft}?preview=true");
        preview.StatusCode.Should().Be(HttpStatusCode.OK, "غير المنشور لا يُعرض عبر CDN أبداً");
        (await preview.Content.ReadAsByteArrayAsync())[..3].Should().Equal("ID3"u8.ToArray());

        (await api.Client().GetAsync($"/api/v1/media/tracks/{draft}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
