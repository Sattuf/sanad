namespace Sanad.Domain.Identity;

/// <summary>
/// تصنيف مهني مستقل عن SanadRole وعن OrganizationTrack. نوعان متكافئان تماماً، لا تراتب بينهما
/// ولا أفضلية عرض لأيٍّ منهما — راجع references/SKILL.md البند 9.
/// </summary>
public enum PractitionerType
{
    ReligiousPractitioner,
    LicensedPhysician
}
