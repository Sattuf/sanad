using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Sanad.Application.Common.Interfaces;
using Sanad.Domain.Audit;
using Sanad.Infrastructure.Identity;
using Sanad.Infrastructure.Persistence;

namespace Sanad.Infrastructure.Services;

public sealed class SystemDateTime : IDateTime
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
}

public sealed class HttpCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private ClaimsPrincipal? Principal => accessor.HttpContext?.User;

    public Guid? UserId
    {
        get
        {
            var sub = Principal?.FindFirstValue(ClaimTypes.NameIdentifier) ?? Principal?.FindFirstValue("sub");
            return Principal?.Identity?.IsAuthenticated == true && Guid.TryParse(sub, out var id) ? id : null;
        }
    }

    public IReadOnlyList<string> Roles => Principal?.FindAll(SanadClaims.Role).Select(c => c.Value).ToList() ?? [];

    public bool IsInRole(string role) => Principal?.IsInRole(role) == true;

    public bool IsMfaAuthenticated => Principal?.FindFirstValue(SanadClaims.AuthMethod) == SanadClaims.MethodMfa;
}

public sealed class HttpRequestContext(IHttpContextAccessor accessor) : IRequestContext
{
    public const string CorrelationHeader = "X-Correlation-Id";
    public const string IdempotencyHeader = "Idempotency-Key";

    public string? CorrelationId => accessor.HttpContext?.TraceIdentifier;

    public string? IdempotencyKey
    {
        get
        {
            var value = accessor.HttpContext?.Request.Headers[IdempotencyHeader].ToString();
            return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        }
    }

    public string? ClientIp => accessor.HttpContext?.Connection.RemoteIpAddress?.ToString();

    public string PublicBaseUrl
    {
        get
        {
            var req = accessor.HttpContext?.Request;
            return req is null ? string.Empty : $"{req.Scheme}://{req.Host}";
        }
    }
}

/// <summary>
/// سجل التدقيق يُكتب عبر DbContext مستقل (نطاق جديد) — حتى لا يحفظ تغييرات جزئية معلّقة لأمر فشل،
/// وحتى يُسجَّل الفشل نفسه. البيانات الوصفية فقط، ولا نص حساس أبداً.
/// </summary>
public sealed class AuditLogger(IServiceScopeFactory scopes, ICurrentUser currentUser, IRequestContext request, IDateTime clock, ILogger<AuditLogger> logger)
    : IAuditLogger
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public Task LogAsync(string action, string entityType, Guid? entityId, object? metadata = null, bool succeeded = true, CancellationToken ct = default) =>
        WriteAsync(currentUser.UserId, action, entityType, entityId, metadata, succeeded, ct);

    public Task LogForActorAsync(Guid? actorUserId, string action, string entityType, Guid? entityId, object? metadata = null, CancellationToken ct = default) =>
        WriteAsync(actorUserId, action, entityType, entityId, metadata, true, ct);

    private async Task WriteAsync(Guid? actor, string action, string entityType, Guid? entityId, object? metadata, bool succeeded, CancellationToken ct)
    {
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<SanadDbContext>();
            db.AuditLogEntries.Add(AuditLogEntry.Record(actor, action, entityType, entityId,
                metadata is null ? null : JsonSerializer.Serialize(metadata, Json), request.CorrelationId, succeeded, clock.UtcNow));
            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // فشل التدقيق لا يُسقط العملية، لكنه يُسجَّل كخطأ تشغيلي واضح
            logger.LogError(ex, "Audit write failed for {Action}", action);
        }
    }
}

public sealed class DbIdempotencyStore(SanadDbContext db, IDateTime clock) : IIdempotencyStore
{
    public async Task<string?> GetResponseAsync(string key, Guid? userId, string requestName, CancellationToken ct) =>
        await db.IdempotencyRecords.AsNoTracking()
            .Where(r => r.Key == key && r.UserId == userId && r.RequestName == requestName)
            .Select(r => r.ResponseJson).FirstOrDefaultAsync(ct);

    public async Task SaveResponseAsync(string key, Guid? userId, string requestName, string responseJson, CancellationToken ct)
    {
        db.IdempotencyRecords.Add(new IdempotencyRecord
        {
            Key = key,
            UserId = userId,
            RequestName = requestName,
            ResponseJson = responseJson,
            CreatedAtUtc = clock.UtcNow,
        });
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // طلبان متزامنان بنفس المفتاح: الأول فاز، والنتيجة محفوظة بالفعل
        }
    }
}
