using Sanad.Domain.Common;
using Sanad.Domain.Exceptions;

namespace Sanad.Domain.Consent;

public enum ConsentType { TermsOfService, PrivacyPolicy, SensitiveDataProcessing, MarketingCommunication }

/// <summary>سجل موافقة بإصدار سياسة محدد. السحب لا يحذف السجل، بل يؤرّخه.</summary>
public sealed class ConsentRecord : BaseEntity
{
    private ConsentRecord() { }

    public Guid UserId { get; private set; }
    public ConsentType Type { get; private set; }
    public string PolicyVersion { get; private set; } = null!;
    public DateTimeOffset AcceptedAtUtc { get; private set; }
    public DateTimeOffset? RevokedAtUtc { get; private set; }

    public bool IsActive => RevokedAtUtc is null;

    public static ConsentRecord Accept(Guid userId, ConsentType type, string policyVersion, DateTimeOffset nowUtc)
    {
        if (!Enum.IsDefined(type)) throw new DomainException("نوع الموافقة غير معروف.");
        return new ConsentRecord
        {
            UserId = Guard.NotEmpty(userId, "المستخدم"),
            Type = type,
            PolicyVersion = Guard.Required(policyVersion, "إصدار السياسة", 20),
            AcceptedAtUtc = nowUtc,
        };
    }

    public void Revoke(DateTimeOffset nowUtc) => RevokedAtUtc ??= nowUtc;

    public void AnonymizeUser(Guid anonymousUserId) => UserId = anonymousUserId;
}
