using Sanad.Domain.Common;
using Sanad.Domain.Directory;
using Sanad.Domain.Identity;
using Sanad.Domain.RuqyahLibrary;
using Sanad.Domain.Scheduling;
using Sanad.Domain.Verification;

namespace Sanad.Domain.UnitTests;

/// <summary>بدائل بسيطة بلا مكتبات Mock — اختبارات Domain نقية.</summary>
internal sealed class ReversingEncryptor : IFieldEncryptor
{
    public string Encrypt(string plainText) => "enc:" + new string(plainText.Reverse().ToArray());
    public string Decrypt(string cipherText) => new(cipherText[4..].Reverse().ToArray());
}

internal sealed class KeywordPolicyChecker : IContentPolicyChecker
{
    public string? FindProhibitedClaim(string text) => text.Contains("مضمون", StringComparison.Ordinal) || text.Contains("ملغ", StringComparison.Ordinal) ? "محظور" : null;
}

internal sealed class KeywordRiskEvaluator : ISafeReferralEvaluator
{
    public bool RequiresImmediateEmergencyReferral(SafetySignal signal) => signal.Text.Contains("انتحار", StringComparison.Ordinal);
}

internal static class Builders
{
    public static readonly DateTimeOffset Now = new(2026, 9, 1, 9, 0, 0, TimeSpan.Zero);
    public static readonly IContentPolicyChecker Policy = new KeywordPolicyChecker();

    public static VerificationRecord ApprovedUpgrade(PractitionerType type = PractitionerType.LicensedPhysician, Guid? userId = null)
    {
        var doc = type == PractitionerType.LicensedPhysician ? VerificationDocumentTypes.MedicalPracticeLicense : VerificationDocumentTypes.ShariaIjazah;
        var v = VerificationRecord.RequestProviderUpgrade(userId ?? Guid.NewGuid(), type, "مختص", doc, "جهة", Guid.NewGuid(), Now);
        v.Approve(Guid.NewGuid(), false, Now.AddYears(1), Now);
        return v;
    }

    public static ProviderProfile PublishedProvider(Guid? userId = null)
    {
        var v = ApprovedUpgrade(userId: userId);
        var p = ProviderProfile.CreateFromApprovedUpgrade(v, "د. اختبار", Now);
        p.UpdateProfile("د. اختبار", "استشاري", "استشارات إدارية وتوجيه", ["ar"], ServiceDeliveryMode.Remote, null, "لا تشخيص عبر المنصة", Policy);
        p.Publish(v, Now);
        return p;
    }

    public static (BookingRequest Booking, AvailabilitySlot Slot, ProviderProfile Provider) Booking(Guid? beneficiaryId = null)
    {
        var provider = PublishedProvider();
        var offering = ServiceOffering.Create(provider, "استشارة", "جلسة استشارية", "يمكن الإلغاء قبل 24 ساعة", null, 45, Policy);
        var slot = AvailabilitySlot.Create(provider.Id, Now.AddDays(1), Now.AddDays(1).AddHours(1), Now);
        var booking = BookingRequest.Create(beneficiaryId ?? Guid.NewGuid(), offering, provider, slot, null, Now);
        return (booking, slot, provider);
    }

    public static AudioTrack Track(bool published)
    {
        var t = AudioTrack.Create("آية الكرسي", "تلاوة", null, AudioTrackCategory.QuranRecitation, $"k/{Guid.NewGuid()}.mp3", "audio/mpeg", 120, Guid.NewGuid(), Policy);
        if (published) t.Publish(Policy, Now);
        return t;
    }
}
