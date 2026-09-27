using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sanad.Application.Common.Access;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Common.Messaging;
using Sanad.Domain.Common;
using Sanad.Domain.Directory;
using Sanad.Domain.Identity;
using Sanad.Domain.Verification;

namespace Sanad.Application.Modules.Directory;

public sealed record ServiceOfferingDto(Guid Id, string Category, string Description, string CancellationPolicy,
    IReadOnlyList<string> ExplicitExclusions, int SessionDurationMinutes, bool IsActive);

public sealed record MyProviderProfileDto(Guid Id, string DisplayName, string DeclaredTitle, string PractitionerType, string PracticeScope,
    IReadOnlyList<string> Languages, string DeliveryMode, string? City, string ProfessionalBoundariesNote, string Status,
    string? SuspensionReasonCode, bool IsProfileComplete, VerificationBadgeDto Verification, IReadOnlyList<ServiceOfferingDto> Offerings);

[RequireRoles(SanadRoles.Practitioner)]
public sealed record GetMyProviderProfileQuery : IQuery<MyProviderProfileDto>;

public sealed class GetMyProviderProfileQueryHandler(IApplicationDbContext db, AccessContext access)
    : IRequestHandler<GetMyProviderProfileQuery, MyProviderProfileDto>
{
    public async Task<MyProviderProfileDto> Handle(GetMyProviderProfileQuery request, CancellationToken cancellationToken)
    {
        var p = await access.RequireCurrentProviderAsync(cancellationToken);
        var v = await db.VerificationRecords.AsNoTracking().FirstOrDefaultAsync(x => x.Id == p.VerificationRecordId, cancellationToken);
        var offerings = await db.ServiceOfferings.AsNoTracking().Where(o => o.ProviderProfileId == p.Id).OrderBy(o => o.Category).ToListAsync(cancellationToken);
        return new MyProviderProfileDto(p.Id, p.DisplayName, p.DeclaredTitle, p.Type.ToString(), p.PracticeScope, p.Languages,
            p.DeliveryMode.ToString(), p.City, p.ProfessionalBoundariesNote, p.Status.ToString(), p.SuspensionReasonCode, p.IsProfileComplete,
            DirectoryMapping.Badge(v), offerings.Select(ToDto).ToList());
    }

    internal static ServiceOfferingDto ToDto(ServiceOffering o) =>
        new(o.Id, o.Category, o.Description, o.CancellationPolicy, o.ExplicitExclusions, o.SessionDurationMinutes, o.IsActive);
}

[RequireRoles(SanadRoles.Practitioner)]
public sealed record UpdateMyProviderProfileCommand(string DisplayName, string DeclaredTitle, string PracticeScope, IReadOnlyList<string> Languages,
    ServiceDeliveryMode DeliveryMode, string? City, string ProfessionalBoundariesNote) : ICommand<Unit>;

public sealed class UpdateMyProviderProfileCommandValidator : AbstractValidator<UpdateMyProviderProfileCommand>
{
    public UpdateMyProviderProfileCommandValidator()
    {
        RuleFor(x => x.DisplayName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.DeclaredTitle).NotEmpty().MaximumLength(200);
        RuleFor(x => x.PracticeScope).NotEmpty().MaximumLength(2000);
        RuleFor(x => x.ProfessionalBoundariesNote).NotEmpty().MaximumLength(1000);
        RuleFor(x => x.Languages).NotEmpty().Must(l => l.Count <= 10);
        RuleForEach(x => x.Languages).NotEmpty().MaximumLength(40);
        RuleFor(x => x.DeliveryMode).IsInEnum();
        RuleFor(x => x.City).MaximumLength(100);
    }
}

public sealed class UpdateMyProviderProfileCommandHandler(IApplicationDbContext db, AccessContext access, IContentPolicyChecker policy, IDirectorySearchCache cache)
    : IRequestHandler<UpdateMyProviderProfileCommand, Unit>
{
    public async Task<Unit> Handle(UpdateMyProviderProfileCommand request, CancellationToken cancellationToken)
    {
        var p = await access.RequireCurrentProviderAsync(cancellationToken);
        p.UpdateProfile(request.DisplayName, request.DeclaredTitle, request.PracticeScope, request.Languages, request.DeliveryMode,
            request.City, request.ProfessionalBoundariesNote, policy);
        await db.SaveChangesAsync(cancellationToken);
        await cache.InvalidateAsync(CacheKeys.DirectoryPrefix, cancellationToken);
        return Unit.Value;
    }
}

/// <summary>النشر في الدليل — بوابة النشر في Domain ترفض أي نشر بلا توثيق ساري.</summary>
[RequireRoles(SanadRoles.Practitioner)]
public sealed record PublishMyProviderProfileCommand : ICommand<Unit>;

public sealed class PublishMyProviderProfileCommandHandler(IApplicationDbContext db, AccessContext access, IDateTime clock, IDirectorySearchCache cache)
    : IRequestHandler<PublishMyProviderProfileCommand, Unit>
{
    public async Task<Unit> Handle(PublishMyProviderProfileCommand request, CancellationToken cancellationToken)
    {
        var p = await access.RequireCurrentProviderAsync(cancellationToken);
        var now = clock.UtcNow;
        var verification = (await db.VerificationRecords.Where(v => v.SubjectId == p.Id).ToListAsync(cancellationToken))
            .Where(v => v.IsCurrentlyValid(now)).OrderByDescending(v => v.ExpiresAtUtc).FirstOrDefault()
            ?? await db.VerificationRecords.FirstAsync(v => v.Id == p.VerificationRecordId, cancellationToken);
        p.Publish(verification, now);
        await db.SaveChangesAsync(cancellationToken);
        await cache.InvalidateAsync(CacheKeys.DirectoryPrefix, cancellationToken);
        return Unit.Value;
    }
}

// ── الخدمات ────────────────────────────────────────────────────────────────────
public abstract record ServiceOfferingInput(string Category, string Description, string CancellationPolicy,
    IReadOnlyList<string>? ExplicitExclusions, int SessionDurationMinutes);

internal static class ServiceOfferingRules
{
    public static void Apply<T>(AbstractValidator<T> v) where T : ServiceOfferingInput
    {
        v.RuleFor(x => x.Category).NotEmpty().MaximumLength(100);
        v.RuleFor(x => x.Description).NotEmpty().MaximumLength(2000);
        v.RuleFor(x => x.CancellationPolicy).NotEmpty().MaximumLength(1000);
        v.RuleFor(x => x.SessionDurationMinutes).InclusiveBetween(10, 240);
        v.RuleFor(x => x.ExplicitExclusions).Must(e => e is null || e.Count <= 20);
    }
}

[RequireRoles(SanadRoles.Practitioner)]
public sealed record CreateServiceOfferingCommand(string Category, string Description, string CancellationPolicy,
    IReadOnlyList<string>? ExplicitExclusions, int SessionDurationMinutes)
    : ServiceOfferingInput(Category, Description, CancellationPolicy, ExplicitExclusions, SessionDurationMinutes), ICommand<ServiceOfferingDto>;

public sealed class CreateServiceOfferingCommandValidator : AbstractValidator<CreateServiceOfferingCommand>
{
    public CreateServiceOfferingCommandValidator() => ServiceOfferingRules.Apply(this);
}

public sealed class CreateServiceOfferingCommandHandler(IApplicationDbContext db, AccessContext access, IContentPolicyChecker policy, IDirectorySearchCache cache)
    : IRequestHandler<CreateServiceOfferingCommand, ServiceOfferingDto>
{
    public async Task<ServiceOfferingDto> Handle(CreateServiceOfferingCommand request, CancellationToken cancellationToken)
    {
        var p = await access.RequireCurrentProviderAsync(cancellationToken);
        if (await db.ServiceOfferings.CountAsync(o => o.ProviderProfileId == p.Id, cancellationToken) >= 20)
            throw new ConflictException("الحد الأقصى 20 خدمة لكل مقدّم خدمة.");
        var offering = ServiceOffering.Create(p, request.Category, request.Description, request.CancellationPolicy,
            request.ExplicitExclusions, request.SessionDurationMinutes, policy);
        db.ServiceOfferings.Add(offering);
        await db.SaveChangesAsync(cancellationToken);
        await cache.InvalidateAsync(CacheKeys.DirectoryPrefix, cancellationToken);
        return GetMyProviderProfileQueryHandler.ToDto(offering);
    }
}

[RequireRoles(SanadRoles.Practitioner)]
public sealed record UpdateServiceOfferingCommand(Guid Id, string Category, string Description, string CancellationPolicy,
    IReadOnlyList<string>? ExplicitExclusions, int SessionDurationMinutes, bool IsActive)
    : ServiceOfferingInput(Category, Description, CancellationPolicy, ExplicitExclusions, SessionDurationMinutes), ICommand<ServiceOfferingDto>;

public sealed class UpdateServiceOfferingCommandValidator : AbstractValidator<UpdateServiceOfferingCommand>
{
    public UpdateServiceOfferingCommandValidator() => ServiceOfferingRules.Apply(this);
}

public sealed class UpdateServiceOfferingCommandHandler(IApplicationDbContext db, AccessContext access, IContentPolicyChecker policy, IDirectorySearchCache cache)
    : IRequestHandler<UpdateServiceOfferingCommand, ServiceOfferingDto>
{
    public async Task<ServiceOfferingDto> Handle(UpdateServiceOfferingCommand request, CancellationToken cancellationToken)
    {
        var p = await access.RequireCurrentProviderAsync(cancellationToken);
        var offering = await db.ServiceOfferings.FirstOrDefaultAsync(o => o.Id == request.Id && o.ProviderProfileId == p.Id, cancellationToken)
            ?? throw new NotFoundException("الخدمة", request.Id);
        offering.Update(request.Category, request.Description, request.CancellationPolicy, request.ExplicitExclusions, request.SessionDurationMinutes, policy);
        if (request.IsActive) offering.Activate(); else offering.Deactivate();
        await db.SaveChangesAsync(cancellationToken);
        await cache.InvalidateAsync(CacheKeys.DirectoryPrefix, cancellationToken);
        return GetMyProviderProfileQueryHandler.ToDto(offering);
    }
}
