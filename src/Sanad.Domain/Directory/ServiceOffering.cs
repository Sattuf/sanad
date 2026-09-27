using Sanad.Domain.Common;
using Sanad.Domain.Exceptions;

namespace Sanad.Domain.Directory;

/// <summary>
/// خدمة يقدّمها مختص موثّق. تصف الخدمة ونطاقها فقط — لا حالة المستخدم الصحية أو الدينية،
/// ولا أي سعر: سند مجانية بالكامل.
/// </summary>
public sealed class ServiceOffering : BaseEntity, IAggregateRoot
{
    private ServiceOffering() { }

    public Guid ProviderProfileId { get; private set; }
    public string Category { get; private set; } = null!;
    public string Description { get; private set; } = null!;
    public string CancellationPolicy { get; private set; } = null!;
    public List<string> ExplicitExclusions { get; private set; } = new();
    public int SessionDurationMinutes { get; private set; }
    public bool IsActive { get; private set; } = true;

    public static ServiceOffering Create(
        ProviderProfile provider, string category, string description, string cancellationPolicy,
        IEnumerable<string>? explicitExclusions, int sessionDurationMinutes, IContentPolicyChecker policyChecker)
    {
        ArgumentNullException.ThrowIfNull(provider);
        var offering = new ServiceOffering { ProviderProfileId = provider.Id };
        offering.Apply(category, description, cancellationPolicy, explicitExclusions, sessionDurationMinutes, policyChecker);
        return offering;
    }

    public void Update(
        string category, string description, string cancellationPolicy,
        IEnumerable<string>? explicitExclusions, int sessionDurationMinutes, IContentPolicyChecker policyChecker) =>
        Apply(category, description, cancellationPolicy, explicitExclusions, sessionDurationMinutes, policyChecker);

    public void Deactivate() => IsActive = false;

    public void Activate() => IsActive = true;

    private void Apply(
        string category, string description, string cancellationPolicy,
        IEnumerable<string>? explicitExclusions, int sessionDurationMinutes, IContentPolicyChecker policyChecker)
    {
        if (sessionDurationMinutes is < 10 or > 240) throw new DomainException("مدة الجلسة بين 10 و240 دقيقة.");
        var cat = Guard.Required(category, "فئة الخدمة", 100);
        var desc = Guard.Required(description, "وصف الخدمة", 2000);
        var cancel = Guard.Required(cancellationPolicy, "سياسة الإلغاء", 1000);
        var exclusions = (explicitExclusions ?? []).Where(e => !string.IsNullOrWhiteSpace(e))
            .Select(e => Guard.Required(e, "الاستثناء", 300)).Take(20).ToList();

        // كل نص عام يمر على فلتر العبارات المحظورة قبل الحفظ — لا "شفاء مضمون"، لا جرعة، لا وعد بنتيجة
        ContentPolicy.EnsureAllowed(policyChecker, "وصف الخدمة", [cat, desc, cancel, .. exclusions]);

        Category = cat;
        Description = desc;
        CancellationPolicy = cancel;
        ExplicitExclusions = exclusions;
        SessionDurationMinutes = sessionDurationMinutes;
    }
}
