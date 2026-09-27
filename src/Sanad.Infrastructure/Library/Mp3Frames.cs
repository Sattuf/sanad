namespace Sanad.Infrastructure.Library;

public sealed record Mp3ScanResult(int FrameCount, double DurationSeconds, int SampleRate);

/// <summary>
/// قارئ إطارات MP3 (MPEG-1/2/2.5 Layer III) بلا مكتبات خارجية: يحسب المدة الفعلية من الإطارات نفسها
/// (لا من ادعاء المصدر)، ويستطيع نسخ الإطارات الصوتية فقط إلى ملف آخر — وهكذا تُدمج آيات متتالية في ملف واحد
/// نظيف: بلا وسوم ID3 وبلا إطار Xing/Info الذي يحمل مدة الملف الأول فيضلّل المشغّلات بعد الدمج.
/// </summary>
public static class Mp3Frames
{
    private const int MaxFrameLength = 4096;
    private const int MaxGarbageBytes = 64 * 1024;

    private static readonly int[] BitratesMpeg1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
    private static readonly int[] BitratesMpeg2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];

    private readonly record struct FrameHeader(int Length, int SampleRate, int Samples, int SideInfoLength);

    /// <summary>يمر على كل الإطارات؛ إن مُرّر <paramref name="copyFramesTo"/> تُكتب إليه الإطارات الصوتية فقط.</summary>
    /// <exception cref="InvalidDataException">لا إطارات صالحة، أو يتغير معدل العينات داخل الملف.</exception>
    public static Mp3ScanResult Scan(Stream input, Stream? copyFramesTo = null)
    {
        if (!input.CanSeek) throw new ArgumentException("يلزم تيار يدعم التنقل.", nameof(input));
        var length = input.Length;
        var frame = new byte[MaxFrameLength];
        var position = SkipId3v2(input);
        long samples = 0, garbage = 0;
        int frames = 0, sampleRate = 0;
        var first = true;

        while (position + 4 <= length)
        {
            input.Position = position;
            if (!ReadFully(input, frame.AsSpan(0, 4))) break;
            if (!TryParseHeader(frame, out var header))
            {
                position++;
                if (++garbage > MaxGarbageBytes) break;
                continue;
            }
            if (position + header.Length > length || !ReadFully(input, frame.AsSpan(4, header.Length - 4))) break; // إطار أخير مبتور
            garbage = 0;
            position += header.Length;

            if (first)
            {
                first = false;
                if (IsVbrInfoFrame(frame, header)) continue;
            }
            if (sampleRate == 0) sampleRate = header.SampleRate;
            else if (header.SampleRate != sampleRate) throw new InvalidDataException("معدل العينات يتغير داخل الملف.");

            samples += header.Samples;
            frames++;
            copyFramesTo?.Write(frame, 0, header.Length);
        }

        if (frames == 0) throw new InvalidDataException("لا توجد إطارات MP3 صالحة.");
        return new Mp3ScanResult(frames, (double)samples / sampleRate, sampleRate);
    }

    private static bool TryParseHeader(ReadOnlySpan<byte> h, out FrameHeader header)
    {
        header = default;
        if (h[0] != 0xFF || (h[1] & 0xE0) != 0xE0) return false;
        var version = (h[1] >> 3) & 3; // 3 = MPEG-1، 2 = MPEG-2، 0 = MPEG-2.5، 1 = محجوز
        var layer = (h[1] >> 1) & 3;   // 1 = Layer III
        var bitrateIndex = (h[2] >> 4) & 0xF;
        var rateIndex = (h[2] >> 2) & 3;
        if (version == 1 || layer != 1 || bitrateIndex is 0 or 15 || rateIndex == 3) return false;

        var mpeg1 = version == 3;
        var bitrate = (mpeg1 ? BitratesMpeg1 : BitratesMpeg2)[bitrateIndex] * 1000;
        var sampleRate = version switch
        {
            3 => new[] { 44100, 48000, 32000 }[rateIndex],
            2 => new[] { 22050, 24000, 16000 }[rateIndex],
            _ => new[] { 11025, 12000, 8000 }[rateIndex],
        };
        var samplesPerFrame = mpeg1 ? 1152 : 576;
        var padding = (h[2] >> 1) & 1;
        var frameLength = samplesPerFrame / 8 * bitrate / sampleRate + padding;
        var mono = ((h[3] >> 6) & 3) == 3;
        var sideInfo = mpeg1 ? (mono ? 17 : 32) : (mono ? 9 : 17);
        if (frameLength <= 4 + sideInfo || frameLength > MaxFrameLength) return false;

        header = new FrameHeader(frameLength, sampleRate, samplesPerFrame, sideInfo);
        return true;
    }

    /// <summary>إطار بيانات وصفية (Xing/Info/VBRI) لا صوت فيه، يحمل عدد إطارات الملف الأصلي.</summary>
    private static bool IsVbrInfoFrame(byte[] frame, FrameHeader header)
    {
        var offset = 4 + header.SideInfoLength;
        return HasTag(frame, offset, "Xing"u8, header.Length) || HasTag(frame, offset, "Info"u8, header.Length) || HasTag(frame, 36, "VBRI"u8, header.Length);
    }

    private static bool HasTag(byte[] frame, int offset, ReadOnlySpan<byte> tag, int frameLength) =>
        offset + tag.Length <= frameLength && frame.AsSpan(offset, tag.Length).SequenceEqual(tag);

    private static long SkipId3v2(Stream input)
    {
        Span<byte> h = stackalloc byte[10];
        input.Position = 0;
        if (!ReadFully(input, h) || h[0] != (byte)'I' || h[1] != (byte)'D' || h[2] != (byte)'3') return 0;
        var size = (h[6] & 0x7F) << 21 | (h[7] & 0x7F) << 14 | (h[8] & 0x7F) << 7 | (h[9] & 0x7F);
        var footer = (h[5] & 0x10) != 0 ? 10 : 0;
        return 10L + size + footer;
    }

    private static bool ReadFully(Stream input, Span<byte> buffer)
    {
        var total = 0;
        while (total < buffer.Length)
        {
            var read = input.Read(buffer[total..]);
            if (read == 0) return false;
            total += read;
        }
        return true;
    }
}
