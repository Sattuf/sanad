using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Common.Messaging;
using Sanad.Domain.Common;
using Sanad.Domain.Directory;
using Sanad.Domain.Identity;
using Sanad.Domain.Verification;

namespace Sanad.Application.Modules.Directory;

public sealed record OrganizationAdminDto(Guid Id, string LegalName, string? TradeName, string Track, string Status, string? City,
    Guid? LatestVerificationId, string? LatestVerificationStatus, DateTimeOffset? VerificationExpiresAtUtc);

/// <summary>إدخال جهة من المنسق مع سجل توثيقها الإداري — تبقى مسودة حتى الاعتماد ثم النشر الصريح.</summary>
[RequireRoles(SanadRoles.Coordinator, RequireMfa = true)]
public sealed record CreateOrganizationCommand(string LegalName, string? TradeName, OrganizationTrack Track, string? RegistrationNumber,
    string IssuingAuthorityName, string? VerificationSourceUrl, string PublicDescription, string? City) : ICommand<OrganizationAdminDto>;

public sealed class CreateOrganizationCommandValidator : AbstractValidator<CreateOrganizationCommand>
{
    public CreateOrganizationCommandValidator()
    {
        RuleFor(x => x.LegalName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.TradeName).MaximumLength(200);
        RuleFor(x => x.Track).IsInEnum();
        RuleFor(x => x.RegistrationNumber).MaximumLength(100);
        RuleFor(x => x.IssuingAuthorityName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.VerificationSourceUrl).MaximumLength(500)
            .Must(u => u is null || Uri.TryCreate(u, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps)
            .WithMessage("رابط التحقق يجب أن يكون HTTPS.");
        RuleFor(x => x.PublicDescription).NotEmpty().MaximumLength(2000);
        RuleFor(x => x.City).MaximumLength(100);
    }
}

public sealed class CreateOrganizationCommandHandler(IApplicationDbContext db, IContentPolicyChecker policy, IDateTime clock)
    : IRequestHandler<CreateOrganizationCommand, OrganizationAdminDto>
{
    public async Task<OrganizationAdminDto> Handle(CreateOrganizationCommand request, CancellationToken cancellationToken)
    {
        var org = Organization.Create(request.LegalName, request.TradeName, request.Track, request.RegistrationNumber,
            request.IssuingAuthorityName, request.VerificationSourceUrl, request.PublicDescription, request.City, policy);
        var verification = VerificationRecord.RequestForOrganization(org.Id, VerificationDocumentTypes.OrganizationRegistration,
            request.IssuingAuthorityName, request.VerificationSourceUrl, null, clock.UtcNow);
        db.Organizations.Add(org);
        db.VerificationRecords.Add(verification);
        await db.SaveChangesAsync(cancellationToken);
        return new OrganizationAdminDto(org.Id, org.LegalName, org.TradeName, org.Track.ToString(), org.Status.ToString(), org.City,
            verification.Id, verification.Status.ToString(), verification.ExpiresAtUtc);
    }
}

[RequireRoles(SanadRoles.Coordinator, RequireMfa = true)]
public sealed record ListOrganizationsForAdminQuery : IQuery<IReadOnlyList<OrganizationAdminDto>>;

public sealed class ListOrganizationsForAdminQueryHandler(IApplicationDbContext db) : IRequestHandler<ListOrganizationsForAdminQuery, IReadOnlyList<OrganizationAdminDto>>
{
    public async Task<IReadOnlyList<OrganizationAdminDto>> Handle(ListOrganizationsForAdminQuery request, CancellationToken cancellationToken)
    {
        var orgs = await db.Organizations.AsNoTracking().OrderBy(o => o.LegalName).Take(500).ToListAsync(cancellationToken);
        var ids = orgs.Select(o => o.Id).ToList();
        var verifications = (await db.VerificationRecords.AsNoTracking().Where(v => ids.Contains(v.SubjectId)).ToListAsync(cancellationToken))
            .GroupBy(v => v.SubjectId).ToDictionary(g => g.Key, g => g.OrderByDescending(v => v.SubmittedAtUtc).First());
        return orgs.Select(o =>
        {
            verifications.TryGetValue(o.Id, out var v);
            return new OrganizationAdminDto(o.Id, o.LegalName, o.TradeName, o.Track.ToString(), o.Status.ToString(), o.City,
                v?.Id, v?.Status.ToString(), v?.ExpiresAtUtc);
        }).ToList();
    }
}

[RequireRoles(SanadRoles.Coordinator, RequireMfa = true)]
public sealed record PublishOrganizationCommand(Guid OrganizationId) : ICommand<Unit>;

public sealed class PublishOrganizationCommandHandler(IApplicationDbContext db, IDateTime clock, IDirectorySearchCache cache)
    : IRequestHandler<PublishOrganizationCommand, Unit>
{
    public async Task<Unit> Handle(PublishOrganizationCommand request, CancellationToken cancellationToken)
    {
        var org = await db.Organizations.FirstOrDefaultAsync(o => o.Id == request.OrganizationId, cancellationToken)
            ?? throw new NotFoundException("الجهة", request.OrganizationId);
        var now = clock.UtcNow;
        var verification = (await db.VerificationRecords.Where(v => v.SubjectId == org.Id).ToListAsync(cancellationToken))
            .OrderByDescending(v => v.IsCurrentlyValid(now)).ThenByDescending(v => v.SubmittedAtUtc).FirstOrDefault()
            ?? throw new Sanad.Domain.Exceptions.DomainException("لا يوجد سجل توثيق لهذه الجهة.");
        org.Publish(verification, now);
        await db.SaveChangesAsync(cancellationToken);
        await cache.InvalidateAsync(CacheKeys.DirectoryPrefix, cancellationToken);
        return Unit.Value;
    }
}

[RequireRoles(SanadRoles.Coordinator, RequireMfa = true)]
public sealed record SuspendOrganizationCommand(Guid OrganizationId, string ReasonCode) : ICommand<Unit>;

public sealed class SuspendOrganizationCommandValidator : AbstractValidator<SuspendOrganizationCommand>
{
    public SuspendOrganizationCommandValidator() => RuleFor(x => x.ReasonCode).NotEmpty().MaximumLength(100);
}

public sealed class SuspendOrganizationCommandHandler(IApplicationDbContext db, IDirectorySearchCache cache) : IRequestHandler<SuspendOrganizationCommand, Unit>
{
    public async Task<Unit> Handle(SuspendOrganizationCommand request, CancellationToken cancellationToken)
    {
        var org = await db.Organizations.FirstOrDefaultAsync(o => o.Id == request.OrganizationId, cancellationToken)
            ?? throw new NotFoundException("الجهة", request.OrganizationId);
        org.Suspend(request.ReasonCode);
        await db.SaveChangesAsync(cancellationToken);
        await cache.InvalidateAsync(CacheKeys.DirectoryPrefix, cancellationToken);
        return Unit.Value;
    }
}

[RequireRoles(SanadRoles.Coordinator, RequireMfa = true)]
public sealed record AttachProviderToOrganizationCommand(Guid ProviderProfileId, Guid? OrganizationId) : ICommand<Unit>;

public sealed class AttachProviderToOrganizationCommandHandler(IApplicationDbContext db, IDirectorySearchCache cache)
    : IRequestHandler<AttachProviderToOrganizationCommand, Unit>
{
    public async Task<Unit> Handle(AttachProviderToOrganizationCommand request, CancellationToken cancellationToken)
    {
        var p = await db.ProviderProfiles.FirstOrDefaultAsync(x => x.Id == request.ProviderProfileId, cancellationToken)
            ?? throw new NotFoundException("مقدّم الخدمة", request.ProviderProfileId);
        if (request.OrganizationId is { } oid && !await db.Organizations.AnyAsync(o => o.Id == oid, cancellationToken))
            throw new NotFoundException("الجهة", oid);
        p.AttachToOrganization(request.OrganizationId);
        await db.SaveChangesAsync(cancellationToken);
        await cache.InvalidateAsync(CacheKeys.DirectoryPrefix, cancellationToken);
        return Unit.Value;
    }
}
