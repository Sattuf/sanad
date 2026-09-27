using FluentAssertions;
using Sanad.Application.Modules.RuqyahLibrary;
using Sanad.Domain.RuqyahLibrary;
using Sanad.Infrastructure.Library;

namespace Sanad.Application.UnitTests;

internal static class SyntheticMp3
{
    /// <summary>MPEG-1 Layer III، 128kbps، 44.1kHz، بلا حشو: كل إطار 417 بايت و1152 عينة.</summary>
    public const int FrameLength = 417;

    public static byte[] Frames(int count, bool id3 = false, bool xingFrame = false)
    {
        using var ms = new MemoryStream();
        if (id3)
        {
            ms.Write("ID3"u8);
            ms.Write([4, 0, 0, 0, 0, 0, 20]); // الإصدار 4، بلا أعلام، حجم 20 (synchsafe)
            ms.Write(new byte[20]);
        }
        for (var i = 0; i < count + (xingFrame ? 1 : 0); i++)
        {
            var frame = new byte[FrameLength];
            frame[0] = 0xFF; frame[1] = 0xFB; frame[2] = 0x90; frame[3] = 0x00;
            if (xingFrame && i == 0) "Xing"u8.CopyTo(frame.AsSpan(36));
            ms.Write(frame);
        }
        return ms.ToArray();
    }
}

public class Mp3FramesTests
{
    [Fact]
    public void Duration_comes_from_the_frames_themselves()
    {
        var result = Mp3Frames.Scan(new MemoryStream(SyntheticMp3.Frames(383)));
        result.FrameCount.Should().Be(383);
        result.SampleRate.Should().Be(44100);
        result.DurationSeconds.Should().BeApproximately(383 * 1152 / 44100.0, 0.001);
    }

    [Fact]
    public void Copy_keeps_audio_frames_only_so_concatenated_ayat_have_no_stale_tags()
    {
        using var output = new MemoryStream();
        Mp3Frames.Scan(new MemoryStream(SyntheticMp3.Frames(10, id3: true, xingFrame: true)), output);
        Mp3Frames.Scan(new MemoryStream(SyntheticMp3.Frames(5, id3: true, xingFrame: true)), output);

        output.Length.Should().Be(15 * SyntheticMp3.FrameLength);
        output.ToArray().AsSpan(0, 3).SequenceEqual("ID3"u8).Should().BeFalse();
        var merged = Mp3Frames.Scan(new MemoryStream(output.ToArray()));
        merged.FrameCount.Should().Be(15);
    }

    [Fact]
    public void Non_mp3_content_is_rejected()
    {
        var act = () => Mp3Frames.Scan(new MemoryStream("<html>not audio</html>"u8.ToArray()));
        act.Should().Throw<InvalidDataException>();
    }
}

public class TrustedSourcesTests
{
    [Theory]
    [InlineData("https://www.mp3quran.net/api/v3/suwar")]
    [InlineData("https://server8.mp3quran.net/afs/002.mp3")]
    [InlineData("https://everyayah.com/data/Alafasy_128kbps/002255.mp3")]
    [InlineData("https://www.hisnmuslim.com/audio/ar/x.mp3")]
    [InlineData("https://www.youtube.com/oembed?url=x")]
    public void Allows_only_the_fixed_hosts(string url) => TrustedSources.IsAllowed(new Uri(url)).Should().BeTrue();

    [Theory]
    [InlineData("http://everyayah.com/data/x.mp3")]            // ليس HTTPS
    [InlineData("https://everyayah.com:8443/data/x.mp3")]      // منفذ غير افتراضي
    [InlineData("https://user@everyayah.com/data/x.mp3")]      // بيانات اعتماد في الرابط
    [InlineData("https://everyayah.com.evil.example/x.mp3")]   // انتحال بلاحقة
    [InlineData("https://serverx.mp3quran.net/a.mp3")]
    [InlineData("https://server1234.mp3quran.net/a.mp3")]
    [InlineData("https://localhost/a.mp3")]
    [InlineData("https://169.254.169.254/latest/meta-data")]
    public void Rejects_everything_else(string url) => TrustedSources.IsAllowed(new Uri(url)).Should().BeFalse();

    [Fact]
    public void Hisn_muslim_http_links_are_upgraded_not_accepted() =>
        TrustedSources.UpgradeToHttps(new Uri("http://www.hisnmuslim.com/audio/ar/a.mp3")).ToString()
            .Should().Be("https://www.hisnmuslim.com/audio/ar/a.mp3");
}

public class YouTubeLinkTests
{
    [Theory]
    [InlineData("https://www.youtube.com/watch?v=dQw4w9WgXcQ")]
    [InlineData("https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=10")]
    [InlineData("https://youtu.be/dQw4w9WgXcQ?si=abc")]
    [InlineData("youtube.com/shorts/dQw4w9WgXcQ")]
    [InlineData("https://m.youtube.com/live/dQw4w9WgXcQ")]
    [InlineData("dQw4w9WgXcQ")]
    public void Extracts_the_video_id(string url) => YouTubeVideoVerifier.ExtractVideoId(url).Should().Be("dQw4w9WgXcQ");

    [Theory]
    [InlineData("https://vimeo.com/123")]
    [InlineData("https://www.youtube.com/@channel")]
    [InlineData("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ")]
    [InlineData("")]
    public void Rejects_non_video_links(string url) => YouTubeVideoVerifier.ExtractVideoId(url).Should().BeNull();

    [Theory]
    [InlineData("@SanadChannel")]
    [InlineData("https://www.youtube.com/@SanadChannel")]
    [InlineData("youtube.com/@sanadchannel/videos")]
    public void Channel_forms_normalize_to_the_same_handle(string value) =>
        YouTubeVideoVerifier.NormalizeChannel(value).Should().BeEquivalentTo("/@SanadChannel");
}

public class CatalogImportValidationTests
{
    private readonly ImportCatalogTrackCommandValidator _validator = new();

    private static ImportCatalogTrackCommand Ayat(int surah, int from, int to) =>
        new(CatalogImportKind.Ayat, AudioTrackCategory.QuranRecitation, null, null, surah, from, to, "Alafasy_128kbps", null, null, null, null, true);

    [Fact]
    public void Ayah_counts_match_the_mushaf() => QuranAyahCounts.BySurah.Should().HaveCount(114).And.Subject.Sum().Should().Be(6236);

    [Fact]
    public void Ayat_al_kursi_is_valid() => _validator.Validate(Ayat(2, 255, 255)).IsValid.Should().BeTrue();

    [Theory]
    [InlineData(1, 1, 8)]     // الفاتحة 7 آيات
    [InlineData(2, 10, 5)]    // نطاق مقلوب
    [InlineData(2, 1, 100)]   // أكثر من 60 آية
    [InlineData(115, 1, 1)]   // لا سورة 115
    public void Invalid_ranges_are_rejected(int surah, int from, int to) => _validator.Validate(Ayat(surah, from, to)).IsValid.Should().BeFalse();

    [Fact]
    public void Reciter_folder_cannot_carry_a_path() =>
        _validator.Validate(Ayat(1, 1, 7) with { AyahReciterId = "../../etc" }).IsValid.Should().BeFalse();
}
