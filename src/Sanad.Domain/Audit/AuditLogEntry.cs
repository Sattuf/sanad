using Sanad.Domain.Common;
using Sanad.Domain.Exceptions;

namespace Sanad.Domain.Audit;

/// <summary>
/// سجل تدقيق. MetadataJson بيانات وصفية فقط — ممنوع أي نص خام من ملاحظة المستفيد أو ملاحظة المختص
/// أو التوصية أو الرسائل.
/// </summary>
public sealed class AuditLogEntry : BaseEntity
{
    /// <summary>معرّف ثابت يحل محل هوية أي فاعل حُذف حسابه.</summary>
    public static readonly Guid AnonymizedActorId = new("00000000-0000-0000-0000-00000000dead");

    private AuditLogEntry() { }

    public Guid? ActorUserId { get; private set; }
    public string Action { get; private set; } = null!;
    public string EntityType { get; private set; } = null!;
    public Guid? EntityId { get; private set; }
    public string? MetadataJson { get; private set; }
    public string? CorrelationId { get; private set; }
    public bool Succeeded { get; private set; }
    public DateTimeOffset OccurredAtUtc { get; private set; }

    public static AuditLogEntry Record(Guid? actorUserId, string action, string entityType, Guid? entityId,
        string? metadataJson, string? correlationId, bool succeeded, DateTimeOffset nowUtc)
    {
        if (string.IsNullOrWhiteSpace(action)) throw new DomainException("اسم العملية مطلوب في سجل التدقيق.");
        return new AuditLogEntry
        {
            ActorUserId = actorUserId,
            Action = action.Length > 150 ? action[..150] : action,
            EntityType = string.IsNullOrWhiteSpace(entityType) ? "-" : entityType,
            EntityId = entityId,
            MetadataJson = metadataJson is { Length: > 4000 } ? metadataJson[..4000] : metadataJson,
            CorrelationId = correlationId,
            Succeeded = succeeded,
            OccurredAtUtc = nowUtc,
        };
    }

    public void AnonymizeActor() => ActorUserId = AnonymizedActorId;
}
