using Sanad.Domain.Identity;

namespace Sanad.Domain.Verification;

/// <summary>
/// قائمة سماح صريحة لأنواع مستندات التوثيق لكل نوع ممارسة. نوع مستند لا يطابق النوع المُعلَن
/// يعني رفضاً إدارياً بسبب DocumentTypeMismatch، لا اعتماداً شرطياً.
/// </summary>
public static class VerificationDocumentTypes
{
    // مستندات الشيخ/الراقي الشرعي
    public const string ShariaIjazah = "ShariaIjazah";
    public const string ShariaEndorsement = "ShariaEndorsement";

    // مستندات الجهات
    public const string OrganizationRegistration = "OrganizationRegistration";

    private static readonly Dictionary<PractitionerType, string[]> AllowedByType = new()
    {
        [PractitionerType.ReligiousPractitioner] = [ShariaIjazah, ShariaEndorsement],
    };

    public static bool IsKnownPractitionerDocument(string documentType) =>
        AllowedByType.Values.Any(list => list.Contains(documentType, StringComparer.Ordinal));

    public static bool Matches(PractitionerType type, string documentType) =>
        AllowedByType[type].Contains(documentType, StringComparer.Ordinal);
}
