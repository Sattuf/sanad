using System.Security.Cryptography;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Modules.Accounts;
using Sanad.Domain.Common;

namespace Sanad.Application.Common.Access;

/// <summary>
/// رفع آمن: حد حجم يُفرض أثناء القراءة (لا بعد اكتمالها)، فحص التوقيع الثنائي الفعلي، بصمة SHA-256،
/// ومفتاح تخزين عشوائي لا يحمل اسم الملف الأصلي. يُجمَّع المحتوى في ملف مؤقت (يُحذف تلقائياً) لا في الذاكرة،
/// لأن مقاطع السور الطويلة المستوردة قد تتجاوز 100 ميجابايت.
/// </summary>
public sealed class FileUploadService(IFileSignatureInspector inspector, IFileStorage storage, IApplicationDbContext db, IDateTime clock)
{
    private const int HeaderLength = 64;

    public async Task<UploadedFileDto> UploadAsync(Guid ownerUserId, UploadKind kind, StoredFilePurpose purpose, string keyPrefix,
        Stream content, long declaredLength, CancellationToken ct)
    {
        var file = await StoreAsync(ownerUserId, kind, purpose, keyPrefix, content, declaredLength, ct);
        return new UploadedFileDto(file.Id, file.ContentType, file.SizeBytes);
    }

    public async Task<StoredFile> StoreAsync(Guid ownerUserId, UploadKind kind, StoredFilePurpose purpose, string keyPrefix,
        Stream content, long declaredLength, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(content);
        var max = inspector.MaxBytes(kind);
        if (declaredLength <= 0) throw new RequestValidationException("file", "الملف فارغ.");
        if (declaredLength > max) throw new RequestValidationException("file", $"حجم الملف يتجاوز الحد المسموح ({max / (1024 * 1024)} ميجابايت).");

        await using var buffer = new FileStream(Path.GetTempFileName(), FileMode.Create, FileAccess.ReadWrite, FileShare.None, 81920,
            FileOptions.DeleteOnClose | FileOptions.Asynchronous);
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        var header = new byte[HeaderLength];
        var headerFilled = 0;
        var chunk = new byte[81920];
        long total = 0;
        int read;
        while ((read = await content.ReadAsync(chunk, ct)) > 0)
        {
            if (total + read > max) throw new RequestValidationException("file", "حجم الملف يتجاوز الحد المسموح.");
            if (headerFilled < HeaderLength)
            {
                var n = Math.Min(read, HeaderLength - headerFilled);
                chunk.AsSpan(0, n).CopyTo(header.AsSpan(headerFilled));
                headerFilled += n;
            }
            hash.AppendData(chunk, 0, read);
            await buffer.WriteAsync(chunk.AsMemory(0, read), ct);
            total += read;
        }
        if (total == 0) throw new RequestValidationException("file", "الملف فارغ.");

        var inspection = inspector.Inspect(kind, header.AsSpan(0, headerFilled), total);
        if (!inspection.IsAllowed) throw new RequestValidationException("file", inspection.Error ?? "نوع الملف غير مسموح.");

        var sha = Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant();
        var key = $"{keyPrefix}/{clock.UtcNow:yyyy/MM}/{Guid.NewGuid():N}{inspection.Extension}";

        buffer.Position = 0;
        await storage.SaveAsync(key, buffer, inspection.NormalizedContentType!, ct);

        var file = StoredFile.Register(ownerUserId, purpose, key, inspection.NormalizedContentType!, total, sha, clock.UtcNow);
        db.StoredFiles.Add(file);
        await db.SaveChangesAsync(ct);
        return file;
    }
}
