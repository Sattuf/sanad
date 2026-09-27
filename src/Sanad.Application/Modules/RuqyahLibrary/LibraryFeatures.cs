using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sanad.Application.Common.Access;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Common.Messaging;
using Sanad.Application.Modules.Accounts;
using Sanad.Domain.Common;
using Sanad.Domain.Identity;
using Sanad.Domain.RuqyahLibrary;

namespace Sanad.Application.Modules.RuqyahLibrary;

/// <summary>AudioUrl للملفات المخزّنة فقط؛ مقاطع YouTube تُعرض بمشغّل مضمَّن عبر YouTubeVideoId.</summary>
public sealed record AudioTrackSummaryDto(Guid Id, string Title, string SourceLabel, string? Description, string Category, int DurationSeconds,
    string? AudioUrl, string MediaKind, string? YouTubeVideoId, string? SourceUrl)
{
    public static string MediaPath(Guid trackId) => $"/api/v1/media/tracks/{trackId}";

    public static string? MediaUrlFor(AudioTrack t) => t.MediaKind == AudioTrackMediaKind.StoredAudio ? MediaPath(t.Id) : null;

    public static AudioTrackSummaryDto From(AudioTrack t) =>
        new(t.Id, t.Title, t.SourceLabel, t.Description, t.Category.ToString(), t.DurationSeconds, MediaUrlFor(t),
            t.MediaKind.ToString(), t.YouTubeVideoId, t.SourceUrl);
}

public sealed record AudioTrackAdminDto(Guid Id, string Title, string SourceLabel, string? Description, string Category, int DurationSeconds,
    bool IsPublished, DateTimeOffset? PublishedAtUtc, string? AudioUrl, string MediaKind, string? YouTubeVideoId, string? SourceUrl);

// ── تصفّح المكتبة (منشور فقط، مستخدم مصادَق) ────────────────────────────────────
public sealed record GetLibraryQuery(AudioTrackCategory? Category, string? Q) : IQuery<IReadOnlyList<AudioTrackSummaryDto>>;

public sealed class GetLibraryQueryValidator : AbstractValidator<GetLibraryQuery>
{
    public GetLibraryQueryValidator()
    {
        RuleFor(x => x.Category).IsInEnum();
        RuleFor(x => x.Q).MaximumLength(100);
    }
}

public sealed class GetLibraryQueryHandler(IApplicationDbContext db, IDirectorySearchCache cache) : IRequestHandler<GetLibraryQuery, IReadOnlyList<AudioTrackSummaryDto>>
{
    public async Task<IReadOnlyList<AudioTrackSummaryDto>> Handle(GetLibraryQuery request, CancellationToken cancellationToken)
    {
        var key = $"{CacheKeys.LibraryPrefix}{request.Category}|{request.Q?.Trim()}";
        var cached = await cache.GetAsync<List<AudioTrackSummaryDto>>(key, cancellationToken);
        if (cached is not null) return cached;

        var query = db.AudioTracks.AsNoTracking().Where(t => t.IsPublished);
        if (request.Category is { } c) query = query.Where(t => t.Category == c);
        var tracks = await query.ToListAsync(cancellationToken);
        if (!string.IsNullOrWhiteSpace(request.Q))
        {
            var q = request.Q.Trim();
            tracks = tracks.Where(t => t.Title.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                                       t.SourceLabel.Contains(q, StringComparison.OrdinalIgnoreCase)).ToList();
        }
        var result = tracks.OrderBy(t => t.Category).ThenBy(t => t.Title, StringComparer.Ordinal).Select(AudioTrackSummaryDto.From).ToList();
        await cache.SetAsync(key, result, TimeSpan.FromMinutes(5), cancellationToken);
        return result;
    }
}

// ── المفضلة (شخصية بالكامل) ────────────────────────────────────────────────────
public sealed record GetMyFavoritesQuery : IQuery<IReadOnlyList<AudioTrackSummaryDto>>;

public sealed class GetMyFavoritesQueryHandler(IApplicationDbContext db, AccessContext access) : IRequestHandler<GetMyFavoritesQuery, IReadOnlyList<AudioTrackSummaryDto>>
{
    public async Task<IReadOnlyList<AudioTrackSummaryDto>> Handle(GetMyFavoritesQuery request, CancellationToken cancellationToken)
    {
        var favs = await db.UserFavoriteTracks.AsNoTracking().Where(f => f.UserId == access.UserId).ToListAsync(cancellationToken);
        var ids = favs.Select(f => f.AudioTrackId).ToList();
        var tracks = await db.AudioTracks.AsNoTracking().Where(t => ids.Contains(t.Id) && t.IsPublished).ToDictionaryAsync(t => t.Id, cancellationToken);
        return favs.OrderByDescending(f => f.AddedAtUtc).Where(f => tracks.ContainsKey(f.AudioTrackId))
            .Select(f => AudioTrackSummaryDto.From(tracks[f.AudioTrackId])).ToList();
    }
}

public sealed record AddFavoriteTrackCommand(Guid AudioTrackId) : ICommand<Unit>;

public sealed class AddFavoriteTrackCommandHandler(IApplicationDbContext db, AccessContext access, IDateTime clock) : IRequestHandler<AddFavoriteTrackCommand, Unit>
{
    public async Task<Unit> Handle(AddFavoriteTrackCommand request, CancellationToken cancellationToken)
    {
        var userId = access.UserId;
        if (await db.UserFavoriteTracks.AnyAsync(f => f.UserId == userId && f.AudioTrackId == request.AudioTrackId, cancellationToken)) return Unit.Value;
        var track = await db.AudioTracks.FirstOrDefaultAsync(t => t.Id == request.AudioTrackId && t.IsPublished, cancellationToken)
            ?? throw new NotFoundException("المقطع", request.AudioTrackId);
        if (await db.UserFavoriteTracks.CountAsync(f => f.UserId == userId, cancellationToken) >= 500)
            throw new ConflictException("وصلت للحد الأقصى للمفضلة (500 مقطع).");
        db.UserFavoriteTracks.Add(UserFavoriteTrack.Create(userId, track, clock.UtcNow));
        await db.SaveChangesAsync(cancellationToken);
        return Unit.Value;
    }
}

public sealed record RemoveFavoriteTrackCommand(Guid AudioTrackId) : ICommand<Unit>;

public sealed class RemoveFavoriteTrackCommandHandler(IApplicationDbContext db, AccessContext access) : IRequestHandler<RemoveFavoriteTrackCommand, Unit>
{
    public async Task<Unit> Handle(RemoveFavoriteTrackCommand request, CancellationToken cancellationToken)
    {
        var fav = await db.UserFavoriteTracks.FirstOrDefaultAsync(f => f.UserId == access.UserId && f.AudioTrackId == request.AudioTrackId, cancellationToken);
        if (fav is null) return Unit.Value;
        db.UserFavoriteTracks.Remove(fav);
        await db.SaveChangesAsync(cancellationToken);
        return Unit.Value;
    }
}

// ── المشاركة العامة ────────────────────────────────────────────────────────────
public sealed record SharedLinkDto(string ShortCode, string PublicPath);

/// <summary>ينشئ (أو يعيد) رابط مشاركة لمقطع منشور فقط. محدود المعدل في الـ Endpoint.</summary>
public sealed record CreateSharedLinkCommand(Guid AudioTrackId) : ICommand<SharedLinkDto>;

public sealed class CreateSharedLinkCommandHandler(IApplicationDbContext db, AccessContext access) : IRequestHandler<CreateSharedLinkCommand, SharedLinkDto>
{
    public async Task<SharedLinkDto> Handle(CreateSharedLinkCommand request, CancellationToken cancellationToken)
    {
        var userId = access.UserId;
        var track = await db.AudioTracks.FirstOrDefaultAsync(t => t.Id == request.AudioTrackId, cancellationToken)
            ?? throw new NotFoundException("المقطع", request.AudioTrackId);
        var existing = await db.SharedContentLinks.FirstOrDefaultAsync(l => l.AudioTrackId == track.Id && l.CreatedByUserId == userId, cancellationToken);
        if (existing is not null && track.IsPublished) return new SharedLinkDto(existing.ShortCode, PublicPath(existing.ShortCode));

        var link = SharedContentLink.Create(track, userId); // يرفض المقطع غير المنشور
        db.SharedContentLinks.Add(link);
        await db.SaveChangesAsync(cancellationToken);
        return new SharedLinkDto(link.ShortCode, PublicPath(link.ShortCode));
    }

    private static string PublicPath(string code) => $"/public/shared/{code}";
}

public sealed record PublicSharedTrackDto(string ShortCode, AudioTrackSummaryDto Track);

/// <summary>عام بالكامل، بلا مصادقة. لا يكشف أي بيانات مستخدم، ولا حتى من أنشأ الرابط. يسجّل عدد المشاهدات فقط.</summary>
[AllowAnonymousRequest]
public sealed record ResolveSharedLinkQuery(string ShortCode) : IQuery<PublicSharedTrackDto>;

public sealed class ResolveSharedLinkQueryValidator : AbstractValidator<ResolveSharedLinkQuery>
{
    public ResolveSharedLinkQueryValidator() =>
        RuleFor(x => x.ShortCode).NotEmpty().Length(SharedContentLink.ShortCodeLength).Matches("^[A-Za-z0-9]+$");
}

public sealed class ResolveSharedLinkQueryHandler(IApplicationDbContext db) : IRequestHandler<ResolveSharedLinkQuery, PublicSharedTrackDto>
{
    public async Task<PublicSharedTrackDto> Handle(ResolveSharedLinkQuery request, CancellationToken cancellationToken)
    {
        var link = await db.SharedContentLinks.FirstOrDefaultAsync(l => l.ShortCode == request.ShortCode, cancellationToken)
            ?? throw new NotFoundException("الرابط", request.ShortCode);
        var track = await db.AudioTracks.AsNoTracking().FirstOrDefaultAsync(t => t.Id == link.AudioTrackId && t.IsPublished, cancellationToken)
            ?? throw new NotFoundException("الرابط", request.ShortCode);
        link.RegisterView();
        await db.SaveChangesAsync(cancellationToken);
        return new PublicSharedTrackDto(link.ShortCode, AudioTrackSummaryDto.From(track));
    }
}

// ── إدارة المحتوى (ContentManager + 2FA) ───────────────────────────────────────
[RequireRoles(SanadRoles.ContentManager, RequireMfa = true)]
public sealed record UploadLibraryAudioCommand(Stream Content, long Length) : ICommand<UploadedFileDto>;

public sealed class UploadLibraryAudioCommandHandler(FileUploadService uploads, AccessContext access) : IRequestHandler<UploadLibraryAudioCommand, UploadedFileDto>
{
    public Task<UploadedFileDto> Handle(UploadLibraryAudioCommand request, CancellationToken cancellationToken) =>
        uploads.UploadAsync(access.UserId, UploadKind.LibraryAudio, StoredFilePurpose.LibraryAudio, "library-audio", request.Content, request.Length, cancellationToken);
}

[RequireRoles(SanadRoles.ContentManager, RequireMfa = true)]
public sealed record CreateAudioTrackCommand(string Title, string SourceLabel, string? Description, AudioTrackCategory Category,
    Guid AudioFileId, int DurationSeconds) : ICommand<AudioTrackAdminDto>;

public sealed class CreateAudioTrackCommandValidator : AbstractValidator<CreateAudioTrackCommand>
{
    public CreateAudioTrackCommandValidator()
    {
        RuleFor(x => x.Title).NotEmpty().MaximumLength(200);
        RuleFor(x => x.SourceLabel).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Description).MaximumLength(1500);
        RuleFor(x => x.Category).IsInEnum();
        RuleFor(x => x.AudioFileId).NotEmpty();
        RuleFor(x => x.DurationSeconds).InclusiveBetween(1, 4 * 3600);
    }
}

public sealed class CreateAudioTrackCommandHandler(IApplicationDbContext db, AccessContext access, IContentPolicyChecker policy)
    : IRequestHandler<CreateAudioTrackCommand, AudioTrackAdminDto>
{
    public async Task<AudioTrackAdminDto> Handle(CreateAudioTrackCommand request, CancellationToken cancellationToken)
    {
        var file = await db.StoredFiles.AsNoTracking().FirstOrDefaultAsync(f => f.Id == request.AudioFileId && f.Purpose == StoredFilePurpose.LibraryAudio, cancellationToken)
            ?? throw new RequestValidationException("audioFileId", "ملف الصوت غير موجود.");
        if (await db.AudioTracks.AnyAsync(t => t.AudioStorageKey == file.StorageKey, cancellationToken))
            throw new ConflictException("ملف الصوت مرتبط بمقطع آخر بالفعل.");
        var track = AudioTrack.Create(request.Title, request.SourceLabel, request.Description, request.Category, file.StorageKey,
            file.ContentType, request.DurationSeconds, access.UserId, policy);
        db.AudioTracks.Add(track);
        await db.SaveChangesAsync(cancellationToken);
        return LibraryAdminProjection.ToDto(track);
    }
}

[RequireRoles(SanadRoles.ContentManager, RequireMfa = true)]
public sealed record UpdateAudioTrackCommand(Guid Id, string Title, string SourceLabel, string? Description, AudioTrackCategory Category, int DurationSeconds)
    : ICommand<AudioTrackAdminDto>;

public sealed class UpdateAudioTrackCommandHandler(IApplicationDbContext db, IContentPolicyChecker policy, IDirectorySearchCache cache)
    : IRequestHandler<UpdateAudioTrackCommand, AudioTrackAdminDto>
{
    public async Task<AudioTrackAdminDto> Handle(UpdateAudioTrackCommand request, CancellationToken cancellationToken)
    {
        var track = await db.AudioTracks.FirstOrDefaultAsync(t => t.Id == request.Id, cancellationToken) ?? throw new NotFoundException("المقطع", request.Id);
        track.UpdateDetails(request.Title, request.SourceLabel, request.Description, request.Category, request.DurationSeconds, policy);
        await db.SaveChangesAsync(cancellationToken);
        await cache.InvalidateAsync(CacheKeys.LibraryPrefix, cancellationToken);
        return LibraryAdminProjection.ToDto(track);
    }
}

[RequireRoles(SanadRoles.ContentManager, RequireMfa = true)]
public sealed record PublishTrackCommand(Guid Id) : ICommand<AudioTrackAdminDto>;

public sealed class PublishTrackCommandHandler(IApplicationDbContext db, IContentPolicyChecker policy, IDateTime clock, IDirectorySearchCache cache)
    : IRequestHandler<PublishTrackCommand, AudioTrackAdminDto>
{
    public async Task<AudioTrackAdminDto> Handle(PublishTrackCommand request, CancellationToken cancellationToken)
    {
        var track = await db.AudioTracks.FirstOrDefaultAsync(t => t.Id == request.Id, cancellationToken) ?? throw new NotFoundException("المقطع", request.Id);
        track.Publish(policy, clock.UtcNow);
        await db.SaveChangesAsync(cancellationToken);
        await cache.InvalidateAsync(CacheKeys.LibraryPrefix, cancellationToken);
        return LibraryAdminProjection.ToDto(track);
    }
}

[RequireRoles(SanadRoles.ContentManager, RequireMfa = true)]
public sealed record UnpublishTrackCommand(Guid Id) : ICommand<AudioTrackAdminDto>;

public sealed class UnpublishTrackCommandHandler(IApplicationDbContext db, IDirectorySearchCache cache) : IRequestHandler<UnpublishTrackCommand, AudioTrackAdminDto>
{
    public async Task<AudioTrackAdminDto> Handle(UnpublishTrackCommand request, CancellationToken cancellationToken)
    {
        var track = await db.AudioTracks.FirstOrDefaultAsync(t => t.Id == request.Id, cancellationToken) ?? throw new NotFoundException("المقطع", request.Id);
        track.Unpublish();
        await db.SaveChangesAsync(cancellationToken);
        await cache.InvalidateAsync(CacheKeys.LibraryPrefix, cancellationToken);
        return LibraryAdminProjection.ToDto(track);
    }
}

[RequireRoles(SanadRoles.ContentManager, RequireMfa = true)]
public sealed record GetAdminLibraryQuery : IQuery<IReadOnlyList<AudioTrackAdminDto>>;

public sealed class GetAdminLibraryQueryHandler(IApplicationDbContext db) : IRequestHandler<GetAdminLibraryQuery, IReadOnlyList<AudioTrackAdminDto>>
{
    public async Task<IReadOnlyList<AudioTrackAdminDto>> Handle(GetAdminLibraryQuery request, CancellationToken cancellationToken) =>
        (await db.AudioTracks.AsNoTracking().ToListAsync(cancellationToken))
            .OrderBy(t => t.Category).ThenBy(t => t.Title, StringComparer.Ordinal).Select(LibraryAdminProjection.ToDto).ToList();
}

internal static class LibraryAdminProjection
{
    public static AudioTrackAdminDto ToDto(AudioTrack t) => new(t.Id, t.Title, t.SourceLabel, t.Description, t.Category.ToString(),
        t.DurationSeconds, t.IsPublished, t.PublishedAtUtc, AudioTrackSummaryDto.MediaUrlFor(t), t.MediaKind.ToString(), t.YouTubeVideoId, t.SourceUrl);
}

// ── بث الصوت: المقاطع المنشورة فقط (محتوى عام أصلاً)، ومعاينة ContentManager لغير المنشور ─────
public sealed record TrackMediaDto(string StorageKey, string ContentType);

[AllowAnonymousRequest]
public sealed record GetTrackMediaQuery(Guid TrackId, bool AllowUnpublishedPreview) : IQuery<TrackMediaDto>;

public sealed class GetTrackMediaQueryHandler(IApplicationDbContext db, ICurrentUser currentUser) : IRequestHandler<GetTrackMediaQuery, TrackMediaDto>
{
    public async Task<TrackMediaDto> Handle(GetTrackMediaQuery request, CancellationToken cancellationToken)
    {
        var track = await db.AudioTracks.AsNoTracking().FirstOrDefaultAsync(t => t.Id == request.TrackId, cancellationToken)
            ?? throw new NotFoundException("المقطع", request.TrackId);
        var canPreview = request.AllowUnpublishedPreview && currentUser.IsInRole(SanadRoles.ContentManager) && currentUser.IsMfaAuthenticated;
        if (!track.IsPublished && !canPreview) throw new NotFoundException("المقطع", request.TrackId);
        if (track.MediaKind != AudioTrackMediaKind.StoredAudio || track.AudioStorageKey is null || track.AudioContentType is null)
            throw new NotFoundException("المقطع", request.TrackId);
        return new TrackMediaDto(track.AudioStorageKey, track.AudioContentType);
    }
}
