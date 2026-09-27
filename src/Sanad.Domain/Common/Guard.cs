using Sanad.Domain.Exceptions;

namespace Sanad.Domain.Common;

internal static class Guard
{
    public static string Required(string? value, string fieldLabel, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value)) throw new DomainException($"الحقل «{fieldLabel}» مطلوب.");
        var trimmed = value.Trim();
        if (trimmed.Length > maxLength) throw new DomainException($"الحقل «{fieldLabel}» أطول من الحد المسموح ({maxLength}).");
        return trimmed;
    }

    public static string? Optional(string? value, string fieldLabel, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        if (trimmed.Length > maxLength) throw new DomainException($"الحقل «{fieldLabel}» أطول من الحد المسموح ({maxLength}).");
        return trimmed;
    }

    public static Guid NotEmpty(Guid value, string fieldLabel)
    {
        if (value == Guid.Empty) throw new DomainException($"المعرّف «{fieldLabel}» غير صالح.");
        return value;
    }
}
