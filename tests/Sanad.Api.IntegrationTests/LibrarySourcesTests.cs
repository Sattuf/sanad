using System.Net;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Sanad.Api.IntegrationTests.Infrastructure;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Modules.RuqyahLibrary;
using static Sanad.Api.IntegrationTests.Infrastructure.TestApi;

namespace Sanad.Api.IntegrationTests;

/// <summary>مصادر خارجية مزيّفة: الاختبار لا يتصل بالإنترنت، ويختبر كل ما يليها في سند فعلياً (الرفع، الفحص، النشر، الإتاحة).</summary>
public sealed class LibrarySourcesFixture : IDisposable
{
    public LibrarySourcesFixture()
    {
        Factory = new SanadApiFactory(services =>
        {
            services.RemoveAll<ILibraryCatalog>();
            services.AddSingleton<ILibraryCatalog, FakeCatalog>();
            services.RemoveAll<IYouTubeVideoVerifier>();
            services.AddSingleton<IYouTubeVideoVerifier, FakeYouTube>();
        });
        Api = new TestApi(Factory);
    }

    public SanadApiFactory Factory { get; }
    public TestApi Api { get; }

    public void Dispose() => Factory.Dispose();

    internal sealed class FakeCatalog : ILibraryCatalog
    {
        public Task<LibraryCatalogDto> GetCatalogAsync(CancellationToken ct) => Task.FromResult(new LibraryCatalogDto(
            [new CatalogSurahDto(1, "الفاتحة", 7)], [new CatalogReciterDto(7, "قارئ تجريبي", [new CatalogMoshafDto(70, "حفص عن عاصم", [1])])],
            [], [], [], []));

        public Task<CatalogAudio> FetchSurahAsync(int reciterId, int moshafId, int surah, CancellationToken ct) =>
            Task.FromResult(new CatalogAudio(new MemoryStream(Mp3(200)), 5, "سورة الفاتحة", "قارئ تجريبي — حفص عن عاصم",
                $"https://server8.mp3quran.net/test/{surah:000}.mp3"));

        public Task<CatalogAudio> FetchAyatAsync(string ayahReciterId, int surah, int fromAyah, int toAyah, CancellationToken ct) =>
            throw new ExternalSourceException("تعذّر الوصول إلى المصدر الآن. حاول بعد قليل.");

        public int AyahFetches;

        public Task<CatalogAudio> FetchAyahAsync(string reciterFolder, int surah, int ayah, CancellationToken ct)
        {
            Interlocked.Increment(ref AyahFetches);
            return Task.FromResult(new CatalogAudio(new MemoryStream(Mp3(20)), 1, $"{surah}:{ayah}", reciterFolder, "https://everyayah.com/data/x.mp3"));
        }

        public Task<CatalogAudio> FetchAdhkarAsync(int adhkarId, CancellationToken ct) =>
            Task.FromResult(new CatalogAudio(new MemoryStream("<html>not audio</html>"u8.ToArray()), 5, "ذكر", "حصن المسلم", "https://www.hisnmuslim.com/audio/ar/x.mp3"));

        private static byte[] Mp3(int frames)
        {
            var bytes = new byte[frames * 417];
            for (var i = 0; i < frames; i++) { bytes[i * 417] = 0xFF; bytes[i * 417 + 1] = 0xFB; bytes[i * 417 + 2] = 0x90; }
            return bytes;
        }
    }

    private sealed class FakeYouTube : IYouTubeVideoVerifier
    {
        public IReadOnlyList<string> AllowedChannels => ["https://www.youtube.com/@SanadChannel"];

        public Task<YouTubeVideoInfo> VerifyAsync(string url, CancellationToken ct) => url.Contains("other-channel", StringComparison.Ordinal)
            ? throw new RequestValidationException("url", "الفيديو ليس من قناة معتمدة (قناته: قناة أخرى).")
            : Task.FromResult(new YouTubeVideoInfo("dQw4w9WgXcQ", "تلاوة من قناة سند", "قناة سند"));
    }
}

public sealed class LibrarySourcesTests(LibrarySourcesFixture fixture) : IClassFixture<LibrarySourcesFixture>
{
    private readonly TestApi _api = fixture.Api;

    [Fact]
    public async Task Imported_surah_is_published_streamed_by_sanad_and_cannot_be_imported_twice()
    {
        var cm = _api.Client(await _api.ContentManagerAsync());
        var catalog = await Ok(await cm.GetAsync("/api/v1/admin/library/catalog"));
        catalog["allowedYouTubeChannels"]!.AsArray().Should().HaveCount(1);

        var request = new { kind = "Surah", category = "QuranRecitation", reciterId = 7, moshafId = 70, surah = 1, publish = true };
        var track = await Ok(await cm.PostAsync("/api/v1/admin/library/catalog/import", Body(request)));
        track["title"]!.GetValue<string>().Should().Be("سورة الفاتحة");
        track["sourceLabel"]!.GetValue<string>().Should().Be("قارئ تجريبي — حفص عن عاصم");
        track["isPublished"]!.GetValue<bool>().Should().BeTrue();

        var beneficiary = _api.Client(await _api.RegisterBeneficiaryAsync());
        var library = await Ok(await beneficiary.GetAsync("/api/v1/library?category=QuranRecitation"));
        var item = library.AsArray().Single(t => t!["id"]!.GetValue<string>() == track["id"]!.GetValue<string>())!;
        item["mediaKind"]!.GetValue<string>().Should().Be("StoredAudio");

        var media = await beneficiary.GetAsync(item["audioUrl"]!.GetValue<string>());
        media.StatusCode.Should().Be(HttpStatusCode.OK);
        media.Content.Headers.ContentType!.MediaType.Should().Be("audio/mpeg");

        var again = await cm.PostAsync("/api/v1/admin/library/catalog/import", Body(request));
        again.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Source_that_returns_non_audio_or_fails_is_rejected_with_a_clear_message()
    {
        var cm = _api.Client(await _api.ContentManagerAsync());
        var notAudio = await cm.PostAsync("/api/v1/admin/library/catalog/import", Body(new { kind = "Adhkar", category = "Adhkar", adhkarId = 1, publish = true }));
        notAudio.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var down = await cm.PostAsync("/api/v1/admin/library/catalog/import", Body(new
        {
            kind = "Ayat", category = "QuranRecitation", ayahReciterId = "Alafasy_128kbps", surah = 2, fromAyah = 255, toAyah = 255, publish = true,
        }));
        down.StatusCode.Should().Be(HttpStatusCode.BadGateway);
        (await ReadJson(down))["code"]!.GetValue<string>().Should().Be("source_unavailable");
    }

    [Fact]
    public async Task YouTube_video_is_embedded_not_streamed_and_only_from_an_approved_channel()
    {
        var cm = _api.Client(await _api.ContentManagerAsync());
        var foreign = await cm.PostAsync("/api/v1/admin/library/youtube", Body(new { url = "https://youtu.be/other-channel", category = "Dua", publish = true }));
        foreign.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var track = await Ok(await cm.PostAsync("/api/v1/admin/library/youtube", Body(new { url = "https://youtu.be/dQw4w9WgXcQ", category = "Dua", publish = true })));
        track["mediaKind"]!.GetValue<string>().Should().Be("YouTube");
        track["youTubeVideoId"]!.GetValue<string>().Should().Be("dQw4w9WgXcQ");
        track["audioUrl"].Should().BeNull();
        track["sourceLabel"]!.GetValue<string>().Should().Be("قناة سند — YouTube");

        var id = track["id"]!.GetValue<string>();
        var beneficiary = _api.Client(await _api.RegisterBeneficiaryAsync());
        (await beneficiary.GetAsync($"/api/v1/media/tracks/{id}")).StatusCode.Should().Be(HttpStatusCode.NotFound);

        var again = await cm.PostAsync("/api/v1/admin/library/youtube", Body(new { url = "https://youtu.be/dQw4w9WgXcQ", category = "Dua", publish = true }));
        again.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Only_content_managers_reach_the_import_endpoints()
    {
        var beneficiary = _api.Client(await _api.RegisterBeneficiaryAsync());
        (await beneficiary.GetAsync("/api/v1/admin/library/catalog")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await beneficiary.PostAsync("/api/v1/admin/library/youtube", Body(new { url = "https://youtu.be/dQw4w9WgXcQ", category = "Dua" })))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Ayah_recitation_is_public_fetched_once_then_served_from_sanad_storage()
    {
        var catalog = (LibrarySourcesFixture.FakeCatalog)_api.Factory.Services.GetRequiredService<ILibraryCatalog>();
        var anonymous = _api.Client();
        var reciters = await Ok(await anonymous.GetAsync("/api/v1/public/recitation/reciters"));
        reciters.AsArray().Select(r => r!["id"]!.GetValue<string>()).Should().Contain("Alafasy_128kbps");

        var before = catalog.AyahFetches;
        for (var i = 0; i < 2; i++)
        {
            var res = await anonymous.GetAsync("/api/v1/public/recitation/Husary_128kbps/113/1");
            res.StatusCode.Should().Be(HttpStatusCode.OK);
            res.Content.Headers.ContentType!.MediaType.Should().Be("audio/mpeg");
        }
        catalog.AyahFetches.Should().Be(before + 1);

        (await anonymous.GetAsync("/api/v1/public/recitation/unknown_reciter/1/1")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await anonymous.GetAsync("/api/v1/public/recitation/Husary_128kbps/1/8")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await anonymous.GetAsync("/api/v1/public/recitation/Husary_128kbps/115/1")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
}
