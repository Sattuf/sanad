namespace Sanad.Domain.Common;

/// <summary>
/// فلتر العبارات المحظورة (ادعاء علاجي، وعد بشفاء، جرعة دوائية...). يعيد تصنيف المخالفة أو null.
/// مكانه في Domain لأن كيانات Domain تستدعيه عند الإنشاء — راجع references/07-safety-guardrails.md §7.2.
/// </summary>
public interface IContentPolicyChecker
{
    string? FindProhibitedClaim(string text);
}

public static class ContentPolicy
{
    /// <summary>يرمي DomainException إن احتوى أيٌّ من النصوص ادعاءً محظوراً.</summary>
    public static void EnsureAllowed(IContentPolicyChecker checker, string context, params string?[] texts)
    {
        ArgumentNullException.ThrowIfNull(checker);
        foreach (var text in texts)
        {
            if (string.IsNullOrWhiteSpace(text)) continue;
            var violation = checker.FindProhibitedClaim(text);
            if (violation is not null)
                throw new Exceptions.ContentPolicyViolationException(context, violation);
        }
    }
}
