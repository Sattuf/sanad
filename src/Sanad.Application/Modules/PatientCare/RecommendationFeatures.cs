using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sanad.Application.Common.Access;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Common.Messaging;
using Sanad.Application.Modules.RuqyahLibrary;
using Sanad.Domain.Common;
using Sanad.Domain.Identity;
using Sanad.Domain.PatientCare;

namespace Sanad.Application.Modules.PatientCare;

// ════════════════════════════════════════════════════════════════════════════════
//  توصية المختص للمستفيد — القناة الوحيدة لتوجيه المستفيد مباشرة.
//  نفس فلتر العبارات المحظورة بلا استثناء (لا وعد بشفاء ولا ضمان نتيجة) بلا أي استثناء للكاتب.
// ════════════════════════════════════════════════════════════════════════════════

public sealed record RecommendationDto(Guid Id, Guid BookingRequestId, string ProviderDisplayName, string GuidanceText,
    IReadOnlyList<AudioTrackSummaryDto> RecommendedTracks, DateTimeOffset RecordedAtUtc, DateTimeOffset? AcknowledgedAtUtc);

[RequireRoles(SanadRoles.Practitioner)]
public sealed record SendProviderRecommendationCommand(Guid BookingRequestId, string GuidanceText, IReadOnlyList<Guid>? RecommendedAudioTrackIds)
    : ICommand<Guid>, ISensitiveRequest;

public sealed class SendProviderRecommendationCommandValidator : AbstractValidator<SendProviderRecommendationCommand>
{
    public SendProviderRecommendationCommandValidator()
    {
        RuleFor(x => x.BookingRequestId).NotEmpty();
        RuleFor(x => x.GuidanceText).NotEmpty().MaximumLength(ProviderRecommendation.MaxGuidanceLength);
        RuleFor(x => x.RecommendedAudioTrackIds).Must(ids => ids is null || ids.Count <= ProviderRecommendation.MaxTracks);
    }
}

public sealed class SendProviderRecommendationCommandHandler(IApplicationDbContext db, AccessContext access, IFieldEncryptor encryptor,
    IContentPolicyChecker policy, IDateTime clock)
    : IRequestHandler<SendProviderRecommendationCommand, Guid>
{
    public async Task<Guid> Handle(SendProviderRecommendationCommand request, CancellationToken cancellationToken)
    {
        var provider = await access.RequireCurrentProviderAsync(cancellationToken);
        var booking = await access.LoadBookingAsync(request.BookingRequestId, cancellationToken);
        if (!booking.IsAssignedTo(provider.Id)) throw new NotFoundException("الحجز", request.BookingRequestId);

        var ids = (request.RecommendedAudioTrackIds ?? []).Distinct().ToList();
        var tracks = await db.AudioTracks.Where(t => ids.Contains(t.Id)).ToListAsync(cancellationToken);
        if (tracks.Count != ids.Count) throw new RequestValidationException("recommendedAudioTrackIds", "أحد المقاطع المقترحة غير موجود.");

        var recommendation = ProviderRecommendation.Create(booking, provider.Id, request.GuidanceText, tracks, encryptor, policy, clock.UtcNow);
        db.ProviderRecommendations.Add(recommendation);
        await db.SaveChangesAsync(cancellationToken);
        // ProviderRecommendationSentEvent → Outbox → إشعار عام للمستفيد بلا نص التوصية
        return recommendation.Id;
    }
}

/// <summary>توصياتي — المستفيد نفسه فقط. فك التشفير يحدث هنا حصراً.</summary>
public sealed record GetMyRecommendationsQuery : IQuery<IReadOnlyList<RecommendationDto>>, ISensitiveRequest;

public sealed class GetMyRecommendationsQueryHandler(IApplicationDbContext db, AccessContext access, IFieldEncryptor encryptor)
    : IRequestHandler<GetMyRecommendationsQuery, IReadOnlyList<RecommendationDto>>
{
    public async Task<IReadOnlyList<RecommendationDto>> Handle(GetMyRecommendationsQuery request, CancellationToken cancellationToken)
    {
        var recs = await db.ProviderRecommendations.AsNoTracking()
            .Where(r => r.RecipientBeneficiaryUserId == access.UserId).ToListAsync(cancellationToken);
        return await RecommendationProjection.ToDtosAsync(db, recs, encryptor, cancellationToken);
    }
}

/// <summary>التوصيات التي أرسلها المختص نفسه لحجز مُسنَد له (للمراجعة الذاتية).</summary>
[RequireRoles(SanadRoles.Practitioner)]
public sealed record GetSentRecommendationsForBookingQuery(Guid BookingRequestId) : IQuery<IReadOnlyList<RecommendationDto>>, ISensitiveRequest;

public sealed class GetSentRecommendationsForBookingQueryHandler(IApplicationDbContext db, AccessContext access, IFieldEncryptor encryptor)
    : IRequestHandler<GetSentRecommendationsForBookingQuery, IReadOnlyList<RecommendationDto>>
{
    public async Task<IReadOnlyList<RecommendationDto>> Handle(GetSentRecommendationsForBookingQuery request, CancellationToken cancellationToken)
    {
        var provider = await access.RequireCurrentProviderAsync(cancellationToken);
        var recs = await db.ProviderRecommendations.AsNoTracking()
            .Where(r => r.BookingRequestId == request.BookingRequestId && r.AuthoredByProviderProfileId == provider.Id).ToListAsync(cancellationToken);
        return await RecommendationProjection.ToDtosAsync(db, recs, encryptor, cancellationToken);
    }
}

public sealed record AcknowledgeRecommendationCommand(Guid RecommendationId) : ICommand<Unit>;

public sealed class AcknowledgeRecommendationCommandHandler(IApplicationDbContext db, AccessContext access, IDateTime clock)
    : IRequestHandler<AcknowledgeRecommendationCommand, Unit>
{
    public async Task<Unit> Handle(AcknowledgeRecommendationCommand request, CancellationToken cancellationToken)
    {
        var rec = await db.ProviderRecommendations.FirstOrDefaultAsync(r => r.Id == request.RecommendationId && r.RecipientBeneficiaryUserId == access.UserId, cancellationToken)
            ?? throw new NotFoundException("التوصية", request.RecommendationId);
        rec.MarkAcknowledged(access.UserId, clock.UtcNow);
        await db.SaveChangesAsync(cancellationToken);
        return Unit.Value;
    }
}

internal static class RecommendationProjection
{
    public static async Task<IReadOnlyList<RecommendationDto>> ToDtosAsync(IApplicationDbContext db, IReadOnlyList<ProviderRecommendation> recs,
        IFieldEncryptor encryptor, CancellationToken ct)
    {
        var trackIds = recs.SelectMany(r => r.RecommendedAudioTrackIds).Distinct().ToList();
        // المقاطع المنشورة فقط — إن سُحب مقطع من المكتبة بعد التوصية لا يُعرض
        var tracks = await db.AudioTracks.AsNoTracking().Where(t => trackIds.Contains(t.Id) && t.IsPublished).ToDictionaryAsync(t => t.Id, ct);
        var providerIds = recs.Select(r => r.AuthoredByProviderProfileId).Distinct().ToList();
        var providers = await db.ProviderProfiles.AsNoTracking().Where(p => providerIds.Contains(p.Id)).ToDictionaryAsync(p => p.Id, p => p.DisplayName, ct);

        return recs.OrderByDescending(r => r.RecordedAtUtc).Select(r => new RecommendationDto(r.Id, r.BookingRequestId,
            providers.GetValueOrDefault(r.AuthoredByProviderProfileId, "—"), encryptor.Decrypt(r.GuidanceTextEncrypted),
            r.RecommendedAudioTrackIds.Where(tracks.ContainsKey).Select(id => AudioTrackSummaryDto.From(tracks[id])).ToList(),
            r.RecordedAtUtc, r.AcknowledgedByBeneficiaryAtUtc)).ToList();
    }
}
