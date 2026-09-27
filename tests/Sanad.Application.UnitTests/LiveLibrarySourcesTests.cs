using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Sanad.Infrastructure.Library;
using Sanad.Infrastructure.Storage;

namespace Sanad.Application.UnitTests;

/// <summary>يتصل بالمصادر الحقيقية عبر الإنترنت — فعّله يدوياً بـ SANAD_LIVE_SOURCES=1 للتأكد أن صيغها لم تتغير.</summary>
public sealed class LiveSourcesFactAttribute : FactAttribute
{
    public LiveSourcesFactAttribute()
    {
        if (Environment.GetEnvironmentVariable("SANAD_LIVE_SOURCES") != "1")
            Skip = "اختبار المصادر الحية غير مفعّل (SANAD_LIVE_SOURCES=1 يتطلب اتصالاً بالإنترنت).";
    }
}

public sealed class LiveLibrarySourcesTests : IDisposable
{
    private readonly ServiceProvider _services;
    private readonly TrustedLibraryCatalog _catalog;

    public LiveLibrarySourcesTests()
    {
        var services = new ServiceCollection();
        services.AddHttpClient(TrustedSources.HttpClientName, c => c.DefaultRequestHeaders.UserAgent.ParseAdd("Sanad-Library/1.0"))
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler { AllowAutoRedirect = false });
        _services = services.BuildServiceProvider();
        _catalog = new TrustedLibraryCatalog(_services.GetRequiredService<IHttpClientFactory>(), Options.Create(new StorageOptions()),
            NullLogger<TrustedLibraryCatalog>.Instance);
    }

    public void Dispose()
    {
        _catalog.Dispose();
        _services.Dispose();
    }

    [LiveSourcesFact]
    public async Task All_three_catalogs_load_and_real_audio_imports()
    {
        var catalog = await _catalog.GetCatalogAsync(CancellationToken.None);
        catalog.Unavailable.Should().BeEmpty();
        catalog.Surahs[1].Name.Should().Be("البقرة");
        catalog.SurahReciters.Should().Contain(r => r.Name.Contains("العفاسي"));
        catalog.AyahReciters.Should().Contain(r => r.Id == "Alafasy_128kbps");
        catalog.Adhkar.Should().NotBeEmpty();

        await using (var kursi = await _catalog.FetchAyatAsync("Alafasy_128kbps", 2, 255, 255, CancellationToken.None))
            kursi.DurationSeconds.Should().BeInRange(40, 120);

        await using (var endOfBaqarah = await _catalog.FetchAyatAsync("Alafasy_128kbps", 2, 285, 286, CancellationToken.None))
        {
            endOfBaqarah.SourceUrl.Should().Contain("002285-002286");
            Mp3Frames.Scan(endOfBaqarah.Content).DurationSeconds.Should().BeApproximately(endOfBaqarah.DurationSeconds, 1);
        }

        var alafasy = catalog.SurahReciters.First(r => r.Name.Contains("العفاسي"));
        var hafs = alafasy.Moshafs.First(m => m.Surahs.Contains(1));
        await using (var fatiha = await _catalog.FetchSurahAsync(alafasy.Id, hafs.Id, 1, CancellationToken.None))
            fatiha.DurationSeconds.Should().BeInRange(30, 120);

        await using var dhikr = await _catalog.FetchAdhkarAsync(catalog.Adhkar[0].Id, CancellationToken.None);
        dhikr.DurationSeconds.Should().BePositive();
    }
}
