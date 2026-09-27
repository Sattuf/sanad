namespace Sanad.Domain.Common;

/// <summary>
/// حدث Domain. يحمل معرّفات ورموزاً فقط — ممنوع أن يحمل أي نص حر حساس،
/// لأنه يُسلسَل كما هو في جدول OutboxMessages.
/// </summary>
public interface IDomainEvent { }

public interface IAggregateRoot { }

public interface ISoftDeletable
{
    bool IsDeleted { get; }
}
