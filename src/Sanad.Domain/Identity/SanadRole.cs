namespace Sanad.Domain.Identity;

/// <summary>أدوار النظام. لا يوجد أي دور مالي في هذا المنتج.</summary>
public enum SanadRole
{
    Beneficiary,
    OrganizationRepresentative,
    Practitioner,
    Coordinator,
    ContentManager,
    PrivacySecurityOfficer,
    SystemAdmin
}

public static class SanadRoles
{
    public const string Beneficiary = nameof(SanadRole.Beneficiary);
    public const string OrganizationRepresentative = nameof(SanadRole.OrganizationRepresentative);
    public const string Practitioner = nameof(SanadRole.Practitioner);
    public const string Coordinator = nameof(SanadRole.Coordinator);
    public const string ContentManager = nameof(SanadRole.ContentManager);
    public const string PrivacySecurityOfficer = nameof(SanadRole.PrivacySecurityOfficer);
    public const string SystemAdmin = nameof(SanadRole.SystemAdmin);

    /// <summary>أدوار إدارية حساسة: التحقق الثنائي (2FA) إلزامي قبل أي عملية إدارية.</summary>
    public static readonly IReadOnlySet<SanadRole> Sensitive = new HashSet<SanadRole>
    {
        SanadRole.Coordinator, SanadRole.ContentManager, SanadRole.PrivacySecurityOfficer, SanadRole.SystemAdmin
    };

    /// <summary>
    /// أدوار يجوز منحها عبر واجهة إدارة الأدوار. SystemAdmin لا يُمنح من التطبيق إطلاقاً،
    /// وPractitioner لا يُمنح إلا عبر اعتماد طلب الترقية — راجع references/10-frontend-architecture.md §10.9.
    /// </summary>
    public static readonly IReadOnlySet<SanadRole> AssignableByAdmin = new HashSet<SanadRole>
    {
        SanadRole.Coordinator, SanadRole.ContentManager, SanadRole.PrivacySecurityOfficer, SanadRole.OrganizationRepresentative
    };
}
