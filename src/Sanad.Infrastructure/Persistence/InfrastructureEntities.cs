namespace Sanad.Infrastructure.Persistence;

/// <summary>حدث Domain مُسلسَل ضمن نفس معاملة الحفظ — يُنشَر لاحقاً بتسليم At-Least-Once.</summary>
public sealed class OutboxMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Type { get; set; } = null!;
    public string PayloadJson { get; set; } = null!;
    public DateTimeOffset OccurredAtUtc { get; set; }
    public DateTimeOffset? ProcessedAtUtc { get; set; }
    public int Attempts { get; set; }
    public string? LastError { get; set; }
}

public sealed class IdempotencyRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Key { get; set; } = null!;
    public Guid? UserId { get; set; }
    public string RequestName { get; set; } = null!;
    public string ResponseJson { get; set; } = null!;
    public DateTimeOffset CreatedAtUtc { get; set; }
}

/// <summary>إشعار داخل التطبيق — نص عام فقط، بلا أي محتوى حساس.</summary>
public sealed class UserNotification
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string Kind { get; set; } = null!;
    public string Title { get; set; } = null!;
    public string Body { get; set; } = null!;
    public string? Link { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset? ReadAtUtc { get; set; }
}
