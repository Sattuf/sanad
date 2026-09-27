namespace Sanad.Domain.Exceptions;

public class DomainException : Exception
{
    public DomainException(string message, string code = "domain_rule_violation") : base(message) => Code = code;

    public string Code { get; }
}

/// <summary>نص يخالف فلتر العبارات المحظورة — يُترجَم إلى 400 في الـ API، ولا يُحفظ صامتاً أبداً.</summary>
public sealed class ContentPolicyViolationException : DomainException
{
    public ContentPolicyViolationException(string context, string category)
        : base($"{context} يحتوي ادعاءً غير مسموح: {category}", "content_policy_violation") => Category = category;

    public string Category { get; }
}

/// <summary>تعارض حالة (حجز على موعد لم يعد متاحاً مثلاً) — يُترجَم إلى 409.</summary>
public sealed class DomainConflictException : DomainException
{
    public DomainConflictException(string message) : base(message, "conflict") { }
}
