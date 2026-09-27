using Sanad.Domain.Exceptions;

namespace Sanad.Domain.Common;

public enum StoredFilePurpose { VerificationDocument, LibraryAudio }

/// <summary>
/// ملف مرفوع (مستند توثيق خاص، أو مقطع صوتي للمكتبة). لا يُخزَّن اسم الملف الأصلي لأنه قد يحوي بيانات شخصية.
/// </summary>
public sealed class StoredFile : BaseEntity
{
    private StoredFile() { }

    public Guid OwnerUserId { get; private set; }
    public StoredFilePurpose Purpose { get; private set; }
    public string StorageKey { get; private set; } = null!;
    public string ContentType { get; private set; } = null!;
    public long SizeBytes { get; private set; }
    public string Sha256 { get; private set; } = null!;
    public DateTimeOffset UploadedAtUtc { get; private set; }

    public static StoredFile Register(Guid ownerUserId, StoredFilePurpose purpose, string storageKey, string contentType,
        long sizeBytes, string sha256, DateTimeOffset nowUtc)
    {
        if (sizeBytes <= 0) throw new DomainException("الملف فارغ.");
        return new StoredFile
        {
            OwnerUserId = Guard.NotEmpty(ownerUserId, "المالك"),
            Purpose = purpose,
            StorageKey = Guard.Required(storageKey, "مفتاح التخزين", 300),
            ContentType = Guard.Required(contentType, "نوع الملف", 100),
            SizeBytes = sizeBytes,
            Sha256 = Guard.Required(sha256, "البصمة", 64),
            UploadedAtUtc = nowUtc,
        };
    }
}
