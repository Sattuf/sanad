namespace Sanad.Domain.Identity;

/// <summary>
/// تصنيف مهني مستقل عن SanadRole وعن OrganizationTrack. النطاق شرعي فقط (ADR-0024): الشيخ/الراقي الشرعي.
/// يبقى تعداداً ليُضاف إليه أي نوع شرعي لاحق دون تغيير العقد.
/// </summary>
public enum PractitionerType
{
    ReligiousPractitioner
}
