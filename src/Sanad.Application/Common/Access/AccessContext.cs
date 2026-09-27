using Microsoft.EntityFrameworkCore;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Domain.Directory;
using Sanad.Domain.Identity;
using Sanad.Domain.Scheduling;

namespace Sanad.Application.Common.Access;

/// <summary>
/// تحقق الصلاحية على مستوى المورد (الملكية والإسناد والإشراف). مصدر واحد لهذه القواعد بدلاً من تكرارها في كل Handler.
/// </summary>
public sealed class AccessContext(ICurrentUser currentUser, IApplicationDbContext db)
{
    private ProviderProfile? _provider;
    private bool _providerLoaded;

    public Guid UserId => currentUser.UserId ?? throw new UnauthenticatedException();

    public bool IsInRole(string role) => currentUser.IsInRole(role);

    /// <summary>دور إداري حساس مع جلسة تحقق ثنائي.</summary>
    public bool IsStaff(string role) => currentUser.IsInRole(role) && currentUser.IsMfaAuthenticated;

    public async Task<ProviderProfile?> GetCurrentProviderAsync(CancellationToken ct)
    {
        if (_providerLoaded) return _provider;
        _provider = currentUser.IsInRole(SanadRoles.Practitioner)
            ? await db.ProviderProfiles.FirstOrDefaultAsync(p => p.UserId == UserId, ct)
            : null;
        _providerLoaded = true;
        return _provider;
    }

    public async Task<ProviderProfile> RequireCurrentProviderAsync(CancellationToken ct) =>
        await GetCurrentProviderAsync(ct) ?? throw new ForbiddenAccessException("هذه العملية متاحة لمقدّمي الخدمة الموثّقين فقط.");

    /// <summary>
    /// صلاحية إشراف المنسق على حجز: فقط عند وجود تصعيد مفتوح موثّق يخص أحد طرفي الحجز.
    /// </summary>
    public async Task<bool> CoordinatorHasEscalationAccessAsync(BookingRequest booking, CancellationToken ct)
    {
        if (!IsStaff(SanadRoles.Coordinator)) return false;
        var providerUserId = await db.ProviderProfiles.Where(p => p.Id == booking.ProviderProfileIdOfAssignedService)
            .Select(p => (Guid?)p.UserId).FirstOrDefaultAsync(ct);
        return await db.EscalationCases.AnyAsync(e => e.IsOpen &&
            (e.SubjectAccountId == booking.BeneficiaryUserId || e.SubjectAccountId == providerUserId), ct);
    }

    public async Task<BookingRequest> LoadBookingAsync(Guid bookingId, CancellationToken ct) =>
        await db.BookingRequests.FirstOrDefaultAsync(b => b.Id == bookingId, ct)
        ?? throw new NotFoundException("الحجز", bookingId);

    /// <summary>طرف في الحجز: المستفيد صاحبه أو المختص المُسنَد. غير ذلك يُعامَل كغير موجود (لا كشف لوجوده).</summary>
    public async Task<(BookingRequest Booking, bool IsBeneficiary, ProviderProfile? Provider)> LoadBookingAsPartyAsync(Guid bookingId, CancellationToken ct)
    {
        var booking = await LoadBookingAsync(bookingId, ct);
        var isBeneficiary = booking.BelongsToBeneficiary(UserId);
        var provider = await GetCurrentProviderAsync(ct);
        var isProvider = provider is not null && booking.IsAssignedTo(provider.Id);
        if (!isBeneficiary && !isProvider) throw new NotFoundException("الحجز", bookingId);
        return (booking, isBeneficiary, isProvider ? provider : null);
    }
}
