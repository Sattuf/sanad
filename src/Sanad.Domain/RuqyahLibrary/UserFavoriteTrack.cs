using Sanad.Domain.Common;
using Sanad.Domain.Exceptions;

namespace Sanad.Domain.RuqyahLibrary;

/// <summary>مفضلة شخصية — لا تُعرض لأي طرف آخر.</summary>
public sealed class UserFavoriteTrack : BaseEntity
{
    private UserFavoriteTrack() { }

    public Guid UserId { get; private set; }
    public Guid AudioTrackId { get; private set; }
    public DateTimeOffset AddedAtUtc { get; private set; }

    public static UserFavoriteTrack Create(Guid userId, AudioTrack track, DateTimeOffset nowUtc)
    {
        ArgumentNullException.ThrowIfNull(track);
        if (!track.IsPublished) throw new DomainException("لا يمكن إضافة مقطع غير منشور للمفضلة.", "track_not_published");
        return new UserFavoriteTrack { UserId = Guard.NotEmpty(userId, "المستخدم"), AudioTrackId = track.Id, AddedAtUtc = nowUtc };
    }
}
