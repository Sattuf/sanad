namespace Sanad.Application.Common.Safety;

public sealed record EmergencyContactDto(string Label, string PhoneNumber);

/// <summary>معلومات الإحالة العاجلة — تُضمَّن في أي استجابة رُصد فيها مؤشر خطر.</summary>
public sealed record EmergencyReferralDto(bool Required, string Message, IReadOnlyList<EmergencyContactDto> Contacts, string EmergencyPagePath);

public interface IEmergencyReferralInfoProvider
{
    EmergencyReferralDto Get();
}

/// <summary>استجابة قد تحمل إحالة عاجلة (إنشاء حجز بملاحظة، رسالة، بلاغ).</summary>
public interface ISafetyAwareResponse
{
    EmergencyReferralDto? EmergencyReferral { get; }

    ISafetyAwareResponse WithEmergencyReferral(EmergencyReferralDto referral);
}
