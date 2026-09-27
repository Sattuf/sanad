using Microsoft.Extensions.Options;
using Sanad.Application.Common.Interfaces;

namespace Sanad.Infrastructure.Storage;

/// <summary>
/// قائمة سماح صريحة بفحص التوقيع الثنائي (Magic Bytes) لا الامتداد المُدَّعى:
/// مستندات التوثيق: PDF / JPEG / PNG — مقاطع المكتبة: MP3 / M4A فقط.
/// </summary>
public sealed class FileSignatureInspector(IOptions<StorageOptions> options) : IFileSignatureInspector
{
    public long MaxBytes(UploadKind kind) => kind switch
    {
        UploadKind.VerificationDocument => options.Value.MaxDocumentMegabytes * 1024L * 1024L,
        UploadKind.LibraryAudio => options.Value.MaxAudioMegabytes * 1024L * 1024L,
        UploadKind.LibraryAudioImport => options.Value.MaxImportedAudioMegabytes * 1024L * 1024L,
        _ => 0,
    };

    public FileInspectionResult Inspect(UploadKind kind, ReadOnlySpan<byte> header, long length)
    {
        if (length <= 0 || length > MaxBytes(kind)) return Deny("حجم الملف غير مسموح.");
        return kind switch
        {
            UploadKind.VerificationDocument => InspectDocument(header),
            UploadKind.LibraryAudio or UploadKind.LibraryAudioImport => InspectAudio(header),
            _ => Deny("نوع رفع غير معروف."),
        };
    }

    private static FileInspectionResult InspectDocument(ReadOnlySpan<byte> h)
    {
        if (h.StartsWith("%PDF-"u8)) return Allow("application/pdf", ".pdf");
        if (h.Length >= 3 && h[0] == 0xFF && h[1] == 0xD8 && h[2] == 0xFF) return Allow("image/jpeg", ".jpg");
        if (h.StartsWith(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A })) return Allow("image/png", ".png");
        return Deny("مستند التوثيق يجب أن يكون PDF أو JPG أو PNG فعلياً.");
    }

    private static FileInspectionResult InspectAudio(ReadOnlySpan<byte> h)
    {
        if (h.StartsWith("ID3"u8)) return Allow("audio/mpeg", ".mp3");
        // إطار MPEG صوتي: 11 بت تزامن = 1، والطبقة III
        if (h.Length >= 2 && h[0] == 0xFF && (h[1] & 0xE0) == 0xE0 && (h[1] & 0x06) == 0x02) return Allow("audio/mpeg", ".mp3");
        // حاوية MP4/M4A: "ftyp" عند الإزاحة 4 بعلامة صوتية
        if (h.Length >= 12 && h.Slice(4, 4).SequenceEqual("ftyp"u8))
        {
            var brand = h.Slice(8, 4);
            if (brand.SequenceEqual("M4A "u8) || brand.SequenceEqual("mp42"u8) || brand.SequenceEqual("isom"u8) || brand.SequenceEqual("M4B "u8))
                return Allow("audio/mp4", ".m4a");
        }
        return Deny("مقطع المكتبة يجب أن يكون MP3 أو M4A فعلياً.");
    }

    private static FileInspectionResult Allow(string type, string ext) => new(true, type, ext, null);

    private static FileInspectionResult Deny(string error) => new(false, null, null, error);
}
