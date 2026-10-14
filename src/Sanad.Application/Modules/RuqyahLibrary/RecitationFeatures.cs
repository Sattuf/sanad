using FluentValidation;
using MediatR;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Common.Messaging;
using Sanad.Domain.Common;

namespace Sanad.Application.Modules.RuqyahLibrary;

// ── تلاوة الآيات المكتوبة في «الرقية والتحصين» ────────────────────────────────
// الصوت آية بآية من everyayah.com بقرّاء ثابتين في قائمة سماح. يجلبه الخادم مرة واحدة ويخزّنه ويخدمه بنفسه،
// فلا يعرف المصدر الخارجي من يستمع (ADR-0015). الآيات نص قرآني عام، فالقراءة بلا تسجيل.

public sealed record RecitationReciterDto(string Id, string Name);

public static class RecitationReciters
{
    /// <summary>مجلدات everyayah.com لقرّاء متقنين برواية حفص — لا يُقبل غيرها في الطلب.</summary>
    public static readonly IReadOnlyList<RecitationReciterDto> All =
    [
        new("Alafasy_128kbps", "مشاري راشد العفاسي"),
        new("Husary_128kbps", "محمود خليل الحصري"),
        new("Minshawy_Murattal_128kbps", "محمد صديق المنشاوي"),
        new("Abdul_Basit_Murattal_192kbps", "عبد الباسط عبد الصمد"),
    ];

    public static bool IsKnown(string? id) => All.Any(r => r.Id == id);
}

[AllowAnonymousRequest]
public sealed record GetRecitationRecitersQuery : IQuery<IReadOnlyList<RecitationReciterDto>>;

public sealed class GetRecitationRecitersQueryHandler : IRequestHandler<GetRecitationRecitersQuery, IReadOnlyList<RecitationReciterDto>>
{
    public Task<IReadOnlyList<RecitationReciterDto>> Handle(GetRecitationRecitersQuery request, CancellationToken cancellationToken) =>
        Task.FromResult(RecitationReciters.All);
}

[AllowAnonymousRequest]
public sealed record GetAyahAudioQuery(string Reciter, int Surah, int Ayah) : IQuery<TrackMediaDto>;

public sealed class GetAyahAudioQueryValidator : AbstractValidator<GetAyahAudioQuery>
{
    public GetAyahAudioQueryValidator()
    {
        RuleFor(x => x.Reciter).Must(RecitationReciters.IsKnown).WithMessage("القارئ غير متاح.");
        RuleFor(x => x.Surah).InclusiveBetween(1, 114).WithMessage("رقم السورة غير صحيح.");
        RuleFor(x => x).Must(x => x.Surah is < 1 or > 114 || x.Ayah >= 1 && x.Ayah <= QuranAyahCounts.Of(x.Surah))
            .OverridePropertyName("ayah").WithMessage("رقم الآية غير صحيح.");
    }
}

public sealed class GetAyahAudioQueryHandler(ILibraryCatalog catalog, IFileStorage storage) : IRequestHandler<GetAyahAudioQuery, TrackMediaDto>
{
    public const string ContentType = "audio/mpeg";

    public static string CacheKey(string reciter, int surah, int ayah) => $"recitation-cache/{reciter}/{surah:000}{ayah:000}.mp3";

    public async Task<TrackMediaDto> Handle(GetAyahAudioQuery request, CancellationToken cancellationToken)
    {
        var key = CacheKey(request.Reciter, request.Surah, request.Ayah);
        await using (var cached = await storage.OpenReadAsync(key, cancellationToken))
            if (cached is not null) return new TrackMediaDto(key, ContentType);

        await using var audio = await catalog.FetchAyahAsync(request.Reciter, request.Surah, request.Ayah, cancellationToken);
        try
        {
            await storage.SaveAsync(key, audio.Content, ContentType, cancellationToken);
        }
        catch (IOException)
        {
            // طلب متزامن خزّن الآية نفسها قبلنا — النسخة المخزّنة صالحة
        }
        catch (OperationCanceledException)
        {
            // لا نترك ملفاً ناقصاً في الذاكرة المؤقتة
            await storage.DeleteAsync(key, CancellationToken.None);
            throw;
        }
        return new TrackMediaDto(key, ContentType);
    }
}
