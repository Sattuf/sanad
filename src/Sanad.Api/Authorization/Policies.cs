using Microsoft.AspNetCore.Authorization;
using Sanad.Domain.Identity;
using Sanad.Infrastructure.Identity;

namespace Sanad.Api.Authorization;

/// <summary>
/// RBAC + Policy-Based AuthZ — references/05-api-layer-and-security.md §5.3.
/// الطبقة الأولى هنا (الدور + جلسة 2FA للأدوار الإدارية)، والطبقة الثانية (الملكية والإسناد والتصعيد) داخل الـ Handler
/// حيث تتوفر بيانات المورد نفسه. Policy الملاحظة الخاصة منفصلة صراحة ولا تُدمَج مع أي Policy أخرى.
/// </summary>
public static class Policies
{
    public const string ReviewVerification = nameof(ReviewVerification);
    public const string ActOnOwnServiceOffering = nameof(ActOnOwnServiceOffering);
    public const string ReadAssignedConversationOnly = nameof(ReadAssignedConversationOnly);
    public const string ManageOwnAccountOnly = nameof(ManageOwnAccountOnly);
    public const string ReadOwnBeneficiaryNoteOnly = nameof(ReadOwnBeneficiaryNoteOnly);
    public const string ReadCaseNoteWithSupervisionOnly = nameof(ReadCaseNoteWithSupervisionOnly);
    public const string ManageContentLibrary = nameof(ManageContentLibrary);
    public const string AssignSystemRoles = nameof(AssignSystemRoles);
    public const string ReviewSafety = nameof(ReviewSafety);

    public static void Register(AuthorizationOptions options)
    {
        // آمن افتراضياً: أي Endpoint بلا تعليم صريح يتطلب مستخدماً مصادَقاً
        options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();

        options.AddPolicy(ReviewVerification, p => p.RequireRole(SanadRoles.Coordinator).RequireClaim(SanadClaims.AuthMethod, SanadClaims.MethodMfa));
        options.AddPolicy(ActOnOwnServiceOffering, p => p.RequireRole(SanadRoles.Practitioner));
        options.AddPolicy(ReadCaseNoteWithSupervisionOnly, p => p.RequireAssertion(ctx =>
            ctx.User.IsInRole(SanadRoles.Practitioner) ||
            ((ctx.User.IsInRole(SanadRoles.ClinicalSupervisor) || ctx.User.IsInRole(SanadRoles.Coordinator)) &&
             ctx.User.HasClaim(SanadClaims.AuthMethod, SanadClaims.MethodMfa))));
        options.AddPolicy(ManageContentLibrary, p => p.RequireRole(SanadRoles.ContentManager).RequireClaim(SanadClaims.AuthMethod, SanadClaims.MethodMfa));
        options.AddPolicy(AssignSystemRoles, p => p.RequireRole(SanadRoles.SystemAdmin).RequireClaim(SanadClaims.AuthMethod, SanadClaims.MethodMfa));
        options.AddPolicy(ReviewSafety, p => p.RequireRole(SanadRoles.Coordinator, SanadRoles.ClinicalSupervisor).RequireClaim(SanadClaims.AuthMethod, SanadClaims.MethodMfa));

        // سياسات "المالك فقط": الدور غير كافٍ بذاته — التحقق الفعلي من الملكية داخل الـ Handler
        options.AddPolicy(ManageOwnAccountOnly, p => p.RequireAuthenticatedUser());
        options.AddPolicy(ReadOwnBeneficiaryNoteOnly, p => p.RequireAuthenticatedUser());
        options.AddPolicy(ReadAssignedConversationOnly, p => p.RequireAuthenticatedUser());
    }
}
