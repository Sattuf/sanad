using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sanad.Application.Common.Access;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Common.Messaging;
using Sanad.Domain.Common;
using Sanad.Domain.Identity;
using Sanad.Domain.RuqyahLibrary;

namespace Sanad.Application.Modules.RuqyahLibrary;

// ── الاستيراد من مصادر معتمدة (ADR-0015) ──────────────────────────────────────
// المتصفح لا يرسل أي رابط: يرسل معرّفات (قارئ، سورة، آيات، ذكر) ويبني الخادم الرابط من كتالوج جلبه بنفسه
// من قائمة مضيفين ثابتة. الصوت يُنزَّل مرة واحدة، يمر على فحص الرفع نفسه، ثم يخدمه سند — فلا يعرف أي طرف خارجي من يستمع.

public sealed record CatalogMoshafDto(int Id, string Name, IReadOnlyList<int> Surahs);
public sealed record CatalogReciterDto(int Id, string Name, IReadOnlyList<CatalogMoshafDto> Moshafs);
public sealed record CatalogSurahDto(int Number, string Name, int AyahCount);
public sealed record CatalogAyahReciterDto(string Id, string Name);
public sealed record CatalogAdhkarDto(int Id, string Title);

/// <summary>Unavailable: أسماء المصادر التي تعذّر الوصول إليها الآن (تُعرض بقية المصادر عادياً).</summary>
public sealed record LibraryCatalogDto(IReadOnlyList<CatalogSurahDto> Surahs, IReadOnlyList<CatalogReciterDto> SurahReciters,
    IReadOnlyList<CatalogAyahReciterDto> AyahReciters, IReadOnlyList<CatalogAdhkarDto> Adhkar, IReadOnlyList<string> Unavailable,
    IReadOnlyList<string> AllowedYouTubeChannels);

/// <summary>صوت جُلب إلى ملف مؤقت يُحذف عند التخلص منه.</summary>
public sealed class CatalogAudio(Stream content, int durationSeconds, string suggestedTitle, string sourceLabel, string sourceUrl) : IAsyncDisposable
{
    public Stream Content { get; } = content;
    public int DurationSeconds { get; } = durationSeconds;
    public string SuggestedTitle { get; } = suggestedTitle;
    public string SourceLabel { get; } = sourceLabel;
    public string SourceUrl { get; } = sourceUrl;

    public ValueTask DisposeAsync() => Content.DisposeAsync();
}

public interface ILibraryCatalog
{
    Task<LibraryCatalogDto> GetCatalogAsync(CancellationToken ct);

    /// <summary>سورة كاملة من mp3quran.net بقارئ ورواية محددين.</summary>
    Task<CatalogAudio> FetchSurahAsync(int reciterId, int moshafId, int surah, CancellationToken ct);

    /// <summary>آية أو نطاق آيات متتالية من everyayah.com، تُدمج في ملف واحد.</summary>
    Task<CatalogAudio> FetchAyatAsync(string ayahReciterId, int surah, int fromAyah, int toAyah, CancellationToken ct);

    /// <summary>آية واحدة من everyayah.com بقارئ من <see cref="RecitationReciters"/> — للاستماع في «الرقية والتحصين».</summary>
    Task<CatalogAudio> FetchAyahAsync(string reciterFolder, int surah, int ayah, CancellationToken ct);

    /// <summary>باب من حصن المسلم (hisnmuslim.com).</summary>
    Task<CatalogAudio> FetchAdhkarAsync(int adhkarId, CancellationToken ct);
}

public sealed record YouTubeVideoInfo(string VideoId, string Title, string ChannelName);

public interface IYouTubeVideoVerifier
{
    /// <summary>روابط القنوات المسموح بها كما في الإعدادات (Library:YouTube:AllowedChannels).</summary>
    IReadOnlyList<string> AllowedChannels { get; }

    /// <summary>يتحقق أن الرابط لفيديو عام أو غير مدرج من قناة معتمدة، وإلا يرفض.</summary>
    Task<YouTubeVideoInfo> VerifyAsync(string url, CancellationToken ct);
}

/// <summary>عدد آيات كل سورة (المصحف برواية حفص، 6236 آية) — للتحقق من النطاقات قبل أي طلب خارجي.</summary>
public static class QuranAyahCounts
{
    public static readonly IReadOnlyList<int> BySurah =
    [
        7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
        112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
        54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
        14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
        29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
        11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
    ];

    public const int MaxAyatPerImport = 60;

    public static int Of(int surah) => BySurah[surah - 1];
}

[RequireRoles(SanadRoles.ContentManager, RequireMfa = true)]
public sealed record GetLibraryCatalogQuery : IQuery<LibraryCatalogDto>;

public sealed class GetLibraryCatalogQueryHandler(ILibraryCatalog catalog, IYouTubeVideoVerifier youTube) : IRequestHandler<GetLibraryCatalogQuery, LibraryCatalogDto>
{
    public async Task<LibraryCatalogDto> Handle(GetLibraryCatalogQuery request, CancellationToken cancellationToken) =>
        await catalog.GetCatalogAsync(cancellationToken) with { AllowedYouTubeChannels = youTube.AllowedChannels };
}

public enum CatalogImportKind { Surah, Ayat, Adhkar }

/// <summary>Title/SourceLabel اختياريان: يُملآن تلقائياً من المصدر إن تُركا فارغين.</summary>
[RequireRoles(SanadRoles.ContentManager, RequireMfa = true)]
public sealed record ImportCatalogTrackCommand(CatalogImportKind Kind, AudioTrackCategory Category,
    int? ReciterId, int? MoshafId, int? Surah, int? FromAyah, int? ToAyah, string? AyahReciterId, int? AdhkarId,
    string? Title, string? SourceLabel, string? Description, bool Publish) : ICommand<AudioTrackAdminDto>;

public sealed class ImportCatalogTrackCommandValidator : AbstractValidator<ImportCatalogTrackCommand>
{
    public ImportCatalogTrackCommandValidator()
    {
        RuleFor(x => x.Kind).IsInEnum();
        RuleFor(x => x.Category).IsInEnum();
        RuleFor(x => x.Title).MaximumLength(200);
        RuleFor(x => x.SourceLabel).MaximumLength(200);
        RuleFor(x => x.Description).MaximumLength(1500);
        When(x => x.Kind == CatalogImportKind.Surah, () =>
        {
            RuleFor(x => x.ReciterId).NotNull().WithMessage("اختر القارئ.");
            RuleFor(x => x.MoshafId).NotNull().WithMessage("اختر الرواية.");
            RuleFor(x => x.Surah).NotNull().InclusiveBetween(1, 114).WithMessage("اختر سورة صحيحة.");
        });
        When(x => x.Kind == CatalogImportKind.Ayat, () =>
        {
            RuleFor(x => x.AyahReciterId).NotEmpty().MaximumLength(80).Matches("^[A-Za-z0-9_.-]+$").WithMessage("اختر القارئ.");
            RuleFor(x => x.Surah).NotNull().InclusiveBetween(1, 114).WithMessage("اختر سورة صحيحة.");
            RuleFor(x => x.FromAyah).NotNull().GreaterThanOrEqualTo(1).WithMessage("رقم الآية الأولى غير صحيح.");
            RuleFor(x => x.ToAyah).NotNull().WithMessage("رقم الآية الأخيرة مطلوب.");
            RuleFor(x => x).Must(x => x.Surah is not (>= 1 and <= 114) || x.ToAyah is null || x.ToAyah <= QuranAyahCounts.Of(x.Surah.Value))
                .OverridePropertyName("toAyah").WithMessage("رقم الآية الأخيرة يتجاوز عدد آيات السورة.");
            RuleFor(x => x).Must(x => x.FromAyah is null || x.ToAyah is null || x.ToAyah >= x.FromAyah)
                .OverridePropertyName("toAyah").WithMessage("الآية الأخيرة يجب ألا تسبق الأولى.");
            RuleFor(x => x).Must(x => x.FromAyah is null || x.ToAyah is null || x.ToAyah - x.FromAyah < QuranAyahCounts.MaxAyatPerImport)
                .OverridePropertyName("toAyah").WithMessage($"الحد الأقصى {QuranAyahCounts.MaxAyatPerImport} آية في المقطع الواحد — استورد سورة كاملة بدلاً من ذلك.");
        });
        When(x => x.Kind == CatalogImportKind.Adhkar, () => RuleFor(x => x.AdhkarId).NotNull().GreaterThan(0).WithMessage("اختر الذكر."));
    }
}

public sealed class ImportCatalogTrackCommandHandler(ILibraryCatalog catalog, FileUploadService uploads, IApplicationDbContext db,
    AccessContext access, IContentPolicyChecker policy, IDateTime clock, IDirectorySearchCache cache)
    : IRequestHandler<ImportCatalogTrackCommand, AudioTrackAdminDto>
{
    public async Task<AudioTrackAdminDto> Handle(ImportCatalogTrackCommand request, CancellationToken cancellationToken)
    {
        await using var audio = request.Kind switch
        {
            CatalogImportKind.Surah => await catalog.FetchSurahAsync(request.ReciterId!.Value, request.MoshafId!.Value, request.Surah!.Value, cancellationToken),
            CatalogImportKind.Ayat => await catalog.FetchAyatAsync(request.AyahReciterId!, request.Surah!.Value, request.FromAyah!.Value, request.ToAyah!.Value, cancellationToken),
            _ => await catalog.FetchAdhkarAsync(request.AdhkarId!.Value, cancellationToken),
        };
        if (await db.AudioTracks.AnyAsync(t => t.SourceUrl == audio.SourceUrl, cancellationToken))
            throw new ConflictException("هذا المقطع مستورد في المكتبة مسبقاً.");

        var file = await uploads.StoreAsync(access.UserId, UploadKind.LibraryAudioImport, StoredFilePurpose.LibraryAudio, "library-audio",
            audio.Content, audio.Content.Length, cancellationToken);
        var track = AudioTrack.Create(Pick(request.Title, audio.SuggestedTitle), Pick(request.SourceLabel, audio.SourceLabel), request.Description,
            request.Category, file.StorageKey, file.ContentType, audio.DurationSeconds, access.UserId, policy, audio.SourceUrl);
        if (request.Publish) track.Publish(policy, clock.UtcNow);
        db.AudioTracks.Add(track);
        await db.SaveChangesAsync(cancellationToken);
        await cache.InvalidateAsync(CacheKeys.LibraryPrefix, cancellationToken);
        return LibraryAdminProjection.ToDto(track);
    }

    internal static string Pick(string? preferred, string fallback)
    {
        var value = string.IsNullOrWhiteSpace(preferred) ? fallback : preferred.Trim();
        return value.Length <= 200 ? value : value[..200];
    }
}

// ── YouTube: تضمين من قناة معتمدة فقط، بلا تنزيل ─────────────────────────────
[RequireRoles(SanadRoles.ContentManager, RequireMfa = true)]
public sealed record AddYouTubeTrackCommand(string Url, AudioTrackCategory Category, string? Title, string? Description, bool Publish)
    : ICommand<AudioTrackAdminDto>;

public sealed class AddYouTubeTrackCommandValidator : AbstractValidator<AddYouTubeTrackCommand>
{
    public AddYouTubeTrackCommandValidator()
    {
        RuleFor(x => x.Url).NotEmpty().MaximumLength(300).WithMessage("أدخل رابط الفيديو.");
        RuleFor(x => x.Category).IsInEnum();
        RuleFor(x => x.Title).MaximumLength(200);
        RuleFor(x => x.Description).MaximumLength(1500);
    }
}

public sealed class AddYouTubeTrackCommandHandler(IYouTubeVideoVerifier youTube, IApplicationDbContext db, AccessContext access,
    IContentPolicyChecker policy, IDateTime clock, IDirectorySearchCache cache) : IRequestHandler<AddYouTubeTrackCommand, AudioTrackAdminDto>
{
    public async Task<AudioTrackAdminDto> Handle(AddYouTubeTrackCommand request, CancellationToken cancellationToken)
    {
        var video = await youTube.VerifyAsync(request.Url, cancellationToken);
        if (await db.AudioTracks.AnyAsync(t => t.YouTubeVideoId == video.VideoId, cancellationToken))
            throw new ConflictException("هذا الفيديو مضاف إلى المكتبة مسبقاً.");

        var track = AudioTrack.CreateFromYouTube(ImportCatalogTrackCommandHandler.Pick(request.Title, video.Title),
            ImportCatalogTrackCommandHandler.Pick(null, $"{video.ChannelName} — YouTube"), request.Description, request.Category,
            video.VideoId, durationSeconds: 0, access.UserId, policy);
        if (request.Publish) track.Publish(policy, clock.UtcNow);
        db.AudioTracks.Add(track);
        await db.SaveChangesAsync(cancellationToken);
        await cache.InvalidateAsync(CacheKeys.LibraryPrefix, cancellationToken);
        return LibraryAdminProjection.ToDto(track);
    }
}
