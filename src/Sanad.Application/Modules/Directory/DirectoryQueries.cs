using System.Security.Cryptography;
using System.Text;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Common.Messaging;
using Sanad.Application.Common.Models;
using Sanad.Domain.Directory;
using Sanad.Domain.Identity;
using Sanad.Domain.Verification;

namespace Sanad.Application.Modules.Directory;

public sealed record VerificationBadgeDto(string Status, DateTimeOffset? LastCheckedAtUtc, DateTimeOffset? ExpiresAtUtc, bool IsConditional);

public sealed record DirectoryItemDto(string Kind, Guid Id, string DisplayName, string? Title, string Track, string? PractitionerType,
    string? DeliveryMode, string? City, IReadOnlyList<string> Languages, VerificationBadgeDto Verification, string? OrganizationName, string Summary);

public sealed record ServiceOfferingPublicDto(Guid Id, string Category, string Description, string CancellationPolicy,
    IReadOnlyList<string> ExplicitExclusions, int SessionDurationMinutes);

public sealed record ProviderPublicDto(Guid Id, string DisplayName, string DeclaredTitle, string PractitionerType, string Track,
    string PracticeScope, IReadOnlyList<string> Languages, string DeliveryMode, string? City, string ProfessionalBoundariesNote,
    Guid? OrganizationId, string? OrganizationName, VerificationBadgeDto Verification, IReadOnlyList<ServiceOfferingPublicDto> Offerings);

public sealed record OrganizationPublicDto(Guid Id, string DisplayName, string LegalName, string Track, string PublicDescription, string? City,
    string? VerificationSourceUrl, VerificationBadgeDto Verification, IReadOnlyList<DirectoryItemDto> Providers);

internal static class DirectoryMapping
{
    public static VerificationBadgeDto Badge(VerificationRecord? v) => v is null
        ? new VerificationBadgeDto("Unknown", null, null, false)
        : new VerificationBadgeDto(v.Status.ToString(), v.LastCheckedAtUtc, v.ExpiresAtUtc, v.Status == VerificationStatus.ConditionallyApproved);

    /// <summary>مسار المختص: مسار جهته إن كان تابعاً لجهة، وإلا مستشار مستقل.</summary>
    public static OrganizationTrack TrackOf(ProviderProfile p, Organization? org) => org?.Track ?? OrganizationTrack.IndependentConsultant;

    public static string Summarize(string text) => text.Length <= 220 ? text : text[..220] + "…";
}

// ── البحث في الدليل: منشور فقط، ترتيب من المطابقة وحالة التوثيق فقط ─────────────────
[AllowAnonymousRequest]
public sealed record SearchDirectoryQuery(string? Q, OrganizationTrack? Track, PractitionerType? PractitionerType,
    ServiceDeliveryMode? DeliveryMode, string? Language, string? City, int? Page, int? PageSize) : IQuery<PagedResult<DirectoryItemDto>>;

public sealed class SearchDirectoryQueryValidator : AbstractValidator<SearchDirectoryQuery>
{
    public SearchDirectoryQueryValidator()
    {
        RuleFor(x => x.Q).MaximumLength(100);
        RuleFor(x => x.Language).MaximumLength(40);
        RuleFor(x => x.City).MaximumLength(100);
        RuleFor(x => x.Track).IsInEnum();
        RuleFor(x => x.PractitionerType).IsInEnum();
        RuleFor(x => x.DeliveryMode).IsInEnum();
    }
}

public sealed class SearchDirectoryQueryHandler(IApplicationDbContext db, IDirectorySearchCache cache, IDateTime clock)
    : IRequestHandler<SearchDirectoryQuery, PagedResult<DirectoryItemDto>>
{
    private const int CandidateLimit = 500;

    public async Task<PagedResult<DirectoryItemDto>> Handle(SearchDirectoryQuery request, CancellationToken cancellationToken)
    {
        var (page, size) = Paging.Normalize(request.Page, request.PageSize);
        var cacheKey = CacheKeys.DirectoryPrefix + Hash($"{request.Q}|{request.Track}|{request.PractitionerType}|{request.DeliveryMode}|{request.Language}|{request.City}|{page}|{size}");
        var cached = await cache.GetAsync<PagedResult<DirectoryItemDto>>(cacheKey, cancellationToken);
        if (cached is not null) return cached;

        var now = clock.UtcNow;
        var q = request.Q?.Trim();

        // ── المختصون المنشورون ──
        var providersQuery = db.ProviderProfiles.AsNoTracking().Where(p => p.Status == PublicationStatus.Published);
        if (request.PractitionerType is { } pt) providersQuery = providersQuery.Where(p => p.Type == pt);
        if (request.DeliveryMode is { } dm) providersQuery = providersQuery.Where(p => p.DeliveryMode == dm || p.DeliveryMode == ServiceDeliveryMode.Both);
        if (!string.IsNullOrWhiteSpace(request.City)) providersQuery = providersQuery.Where(p => p.City == request.City);
        var providers = await providersQuery.Take(CandidateLimit).ToListAsync(cancellationToken);

        var providerIds = providers.Select(p => p.Id).ToList();
        var offerings = await db.ServiceOfferings.AsNoTracking()
            .Where(o => providerIds.Contains(o.ProviderProfileId) && o.IsActive).ToListAsync(cancellationToken);
        var orgIds = providers.Where(p => p.OrganizationId != null).Select(p => p.OrganizationId!.Value).Distinct().ToList();

        // ── الجهات المنشورة ──
        var orgsQuery = db.Organizations.AsNoTracking().Where(o => o.Status == PublicationStatus.Published);
        if (!string.IsNullOrWhiteSpace(request.City)) orgsQuery = orgsQuery.Where(o => o.City == request.City);
        var publishedOrgs = request.PractitionerType is null && request.DeliveryMode is null && string.IsNullOrWhiteSpace(request.Language)
            ? await orgsQuery.Take(CandidateLimit).ToListAsync(cancellationToken)
            : [];
        var allOrgIds = orgIds.Concat(publishedOrgs.Select(o => o.Id)).Distinct().ToList();
        var orgs = await db.Organizations.AsNoTracking().Where(o => allOrgIds.Contains(o.Id)).ToDictionaryAsync(o => o.Id, cancellationToken);

        var subjectIds = providerIds.Concat(publishedOrgs.Select(o => o.Id)).ToList();
        var verifications = (await db.VerificationRecords.AsNoTracking().Where(v => subjectIds.Contains(v.SubjectId)).ToListAsync(cancellationToken))
            .GroupBy(v => v.SubjectId)
            .ToDictionary(g => g.Key, g => g.Where(v => v.IsCurrentlyValid(now)).OrderByDescending(v => v.ExpiresAtUtc).FirstOrDefault());

        var scored = new List<(DirectoryItemDto Item, int Score, int VerificationRank)>();

        foreach (var p in providers)
        {
            verifications.TryGetValue(p.Id, out var v);
            if (v is null) continue; // لا ظهور بلا توثيق ساري حتى لو تأخرت مهمة الانتهاء
            var org = p.OrganizationId is { } oid && orgs.TryGetValue(oid, out var o) ? o : null;
            var track = DirectoryMapping.TrackOf(p, org);
            if (request.Track is { } t && track != t) continue;
            if (!string.IsNullOrWhiteSpace(request.Language) && !p.Languages.Contains(request.Language, StringComparer.OrdinalIgnoreCase)) continue;

            var myOfferings = offerings.Where(x => x.ProviderProfileId == p.Id).ToList();
            var score = Score(q, [(p.DisplayName, 3), (p.DeclaredTitle, 3), (p.PracticeScope, 2)],
                myOfferings.SelectMany(x => new (string? Text, int Weight)[] { (x.Category, 2), (x.Description, 1) }));
            if (score < 0) continue;

            scored.Add((new DirectoryItemDto("Provider", p.Id, p.DisplayName, p.DeclaredTitle, track.ToString(), p.Type.ToString(),
                p.DeliveryMode.ToString(), p.City, p.Languages, DirectoryMapping.Badge(v), org?.DisplayName,
                DirectoryMapping.Summarize(p.PracticeScope)), score, VerificationRank(v)));
        }

        foreach (var o in publishedOrgs)
        {
            verifications.TryGetValue(o.Id, out var v);
            if (v is null) continue;
            if (request.Track is { } t && o.Track != t) continue;
            var score = Score(q, [(o.DisplayName, 3), (o.LegalName, 3), (o.PublicDescription, 1)], []);
            if (score < 0) continue;
            scored.Add((new DirectoryItemDto("Organization", o.Id, o.DisplayName, null, o.Track.ToString(), null, null, o.City, [],
                DirectoryMapping.Badge(v), null, DirectoryMapping.Summarize(o.PublicDescription)), score, VerificationRank(v)));
        }

        // الترتيب: المطابقة أولاً، ثم حالة التوثيق (معتمد قبل مشروط)، ثم الاسم أبجدياً — لا شيء غير ذلك إطلاقاً
        var ordered = scored.OrderByDescending(s => s.Score).ThenBy(s => s.VerificationRank)
            .ThenBy(s => s.Item.DisplayName, StringComparer.Ordinal).Select(s => s.Item).ToList();

        var result = new PagedResult<DirectoryItemDto>(ordered.Skip((page - 1) * size).Take(size).ToList(), page, size, ordered.Count);
        await cache.SetAsync(cacheKey, result, TimeSpan.FromMinutes(2), cancellationToken);
        return result;
    }

    private static int VerificationRank(VerificationRecord v) => v.Status == VerificationStatus.Approved ? 0 : 1;

    /// <summary>درجة المطابقة النصية؛ -1 تعني لا مطابقة عند وجود نص بحث.</summary>
    private static int Score(string? q, IEnumerable<(string? Text, int Weight)> fields, IEnumerable<(string? Text, int Weight)> extra)
    {
        if (string.IsNullOrWhiteSpace(q)) return 0;
        var terms = q.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var score = 0;
        foreach (var (text, weight) in fields.Concat(extra))
        {
            if (string.IsNullOrEmpty(text)) continue;
            foreach (var term in terms)
                if (text.Contains(term, StringComparison.OrdinalIgnoreCase)) score += weight;
        }
        return score == 0 ? -1 : score;
    }

    private static string Hash(string s) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(s)))[..24];
}

// ── ملف مختص عام (منشور فقط) ─────────────────────────────────────────────────────
[AllowAnonymousRequest]
public sealed record GetProviderByIdQuery(Guid Id) : IQuery<ProviderPublicDto>;

public sealed class GetProviderByIdQueryHandler(IApplicationDbContext db, IDateTime clock) : IRequestHandler<GetProviderByIdQuery, ProviderPublicDto>
{
    public async Task<ProviderPublicDto> Handle(GetProviderByIdQuery request, CancellationToken cancellationToken) =>
        await ProviderPublicLoader.LoadAsync(db, request.Id, clock.UtcNow, cancellationToken)
        ?? throw new NotFoundException("مقدّم الخدمة", request.Id);
}

internal static class ProviderPublicLoader
{
    public static async Task<ProviderPublicDto?> LoadAsync(IApplicationDbContext db, Guid id, DateTimeOffset now, CancellationToken ct)
    {
        var p = await db.ProviderProfiles.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.Status == PublicationStatus.Published, ct);
        if (p is null) return null;
        var v = (await db.VerificationRecords.AsNoTracking().Where(x => x.SubjectId == p.Id).ToListAsync(ct))
            .Where(x => x.IsCurrentlyValid(now)).OrderByDescending(x => x.ExpiresAtUtc).FirstOrDefault();
        if (v is null) return null;
        var org = p.OrganizationId is { } oid ? await db.Organizations.AsNoTracking().FirstOrDefaultAsync(o => o.Id == oid, ct) : null;
        var offerings = await db.ServiceOfferings.AsNoTracking().Where(o => o.ProviderProfileId == p.Id && o.IsActive)
            .OrderBy(o => o.Category).ToListAsync(ct);

        return new ProviderPublicDto(p.Id, p.DisplayName, p.DeclaredTitle, p.Type.ToString(), DirectoryMapping.TrackOf(p, org).ToString(),
            p.PracticeScope, p.Languages, p.DeliveryMode.ToString(), p.City, p.ProfessionalBoundariesNote,
            org?.Status == PublicationStatus.Published ? org.Id : null, org?.Status == PublicationStatus.Published ? org.DisplayName : null,
            DirectoryMapping.Badge(v),
            offerings.Select(o => new ServiceOfferingPublicDto(o.Id, o.Category, o.Description, o.CancellationPolicy, o.ExplicitExclusions, o.SessionDurationMinutes)).ToList());
    }
}

[AllowAnonymousRequest]
public sealed record CompareProvidersQuery(IReadOnlyList<Guid> Ids) : IQuery<IReadOnlyList<ProviderPublicDto>>;

public sealed class CompareProvidersQueryValidator : AbstractValidator<CompareProvidersQuery>
{
    public CompareProvidersQueryValidator() =>
        RuleFor(x => x.Ids).NotEmpty().Must(ids => ids.Count is >= 2 and <= 3).WithMessage("المقارنة بين 2 و3 مقدّمي خدمة.");
}

public sealed class CompareProvidersQueryHandler(IApplicationDbContext db, IDateTime clock) : IRequestHandler<CompareProvidersQuery, IReadOnlyList<ProviderPublicDto>>
{
    public async Task<IReadOnlyList<ProviderPublicDto>> Handle(CompareProvidersQuery request, CancellationToken cancellationToken)
    {
        var list = new List<ProviderPublicDto>();
        foreach (var id in request.Ids.Distinct())
            if (await ProviderPublicLoader.LoadAsync(db, id, clock.UtcNow, cancellationToken) is { } dto) list.Add(dto);
        return list;
    }
}

// ── جهة عامة (منشورة فقط) ─────────────────────────────────────────────────────────
[AllowAnonymousRequest]
public sealed record GetOrganizationByIdQuery(Guid Id) : IQuery<OrganizationPublicDto>;

public sealed class GetOrganizationByIdQueryHandler(IApplicationDbContext db, IDateTime clock) : IRequestHandler<GetOrganizationByIdQuery, OrganizationPublicDto>
{
    public async Task<OrganizationPublicDto> Handle(GetOrganizationByIdQuery request, CancellationToken cancellationToken)
    {
        var now = clock.UtcNow;
        var o = await db.Organizations.AsNoTracking().FirstOrDefaultAsync(x => x.Id == request.Id && x.Status == PublicationStatus.Published, cancellationToken)
            ?? throw new NotFoundException("الجهة", request.Id);
        var v = (await db.VerificationRecords.AsNoTracking().Where(x => x.SubjectId == o.Id).ToListAsync(cancellationToken))
            .Where(x => x.IsCurrentlyValid(now)).OrderByDescending(x => x.ExpiresAtUtc).FirstOrDefault()
            ?? throw new NotFoundException("الجهة", request.Id);

        var providers = await db.ProviderProfiles.AsNoTracking()
            .Where(p => p.OrganizationId == o.Id && p.Status == PublicationStatus.Published).ToListAsync(cancellationToken);
        var items = providers.Select(p => new DirectoryItemDto("Provider", p.Id, p.DisplayName, p.DeclaredTitle, o.Track.ToString(),
            p.Type.ToString(), p.DeliveryMode.ToString(), p.City, p.Languages, new VerificationBadgeDto("Approved", null, null, false),
            o.DisplayName, DirectoryMapping.Summarize(p.PracticeScope))).ToList();

        return new OrganizationPublicDto(o.Id, o.DisplayName, o.LegalName, o.Track.ToString(), o.PublicDescription, o.City,
            o.VerificationSourceUrl, DirectoryMapping.Badge(v), items);
    }
}

/// <summary>صفحة "عن التوثيق": أرقام تجميعية فقط، بلا أي بيانات تكشف هوية فردية.</summary>
[AllowAnonymousRequest]
public sealed record GetVerificationTransparencyQuery : IQuery<VerificationTransparencyDto>;

public sealed record VerificationTransparencyDto(int PublishedProviders, int PublishedOrganizations, int PhysicianProviders, int ReligiousProviders);

public sealed class GetVerificationTransparencyQueryHandler(IApplicationDbContext db) : IRequestHandler<GetVerificationTransparencyQuery, VerificationTransparencyDto>
{
    public async Task<VerificationTransparencyDto> Handle(GetVerificationTransparencyQuery request, CancellationToken cancellationToken)
    {
        var published = db.ProviderProfiles.Where(p => p.Status == PublicationStatus.Published);
        return new VerificationTransparencyDto(
            await published.CountAsync(cancellationToken),
            await db.Organizations.CountAsync(o => o.Status == PublicationStatus.Published, cancellationToken),
            await published.CountAsync(p => p.Type == PractitionerType.LicensedPhysician, cancellationToken),
            await published.CountAsync(p => p.Type == PractitionerType.ReligiousPractitioner, cancellationToken));
    }
}
