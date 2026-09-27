using System.Security.Cryptography;
using Sanad.Domain.Common;
using Sanad.Domain.Exceptions;

namespace Sanad.Domain.RuqyahLibrary;

/// <summary>
/// رابط مشاركة عام لمقطع منشور — نمو عضوي بلا أي مقابل مالي. زائر الرابط لا يرى أي بيانات مستخدم،
/// ولا حتى من أنشأ الرابط.
/// </summary>
public sealed class SharedContentLink : BaseEntity, IAggregateRoot
{
    public const int ShortCodeLength = 10;
    private const string ShortCodeAlphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    private SharedContentLink() { }

    public Guid AudioTrackId { get; private set; }

    /// <summary>مولَّد عشوائياً تشفيرياً — لا تسلسل يكشف عدد الروابط.</summary>
    public string ShortCode { get; private set; } = null!;
    public int ViewCount { get; private set; }
    public Guid? CreatedByUserId { get; private set; }

    public static SharedContentLink Create(AudioTrack track, Guid? createdByUserId)
    {
        ArgumentNullException.ThrowIfNull(track);
        if (!track.IsPublished) throw new DomainException("لا يمكن إنشاء رابط مشاركة لمقطع غير منشور.", "track_not_published");
        return new SharedContentLink
        {
            AudioTrackId = track.Id,
            ShortCode = RandomNumberGenerator.GetString(ShortCodeAlphabet, ShortCodeLength),
            CreatedByUserId = createdByUserId,
        };
    }

    public void RegisterView() => ViewCount++;

    public void DetachCreator() => CreatedByUserId = null;
}
