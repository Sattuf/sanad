using System.Collections.Concurrent;
using System.Text.Json;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Sanad.Application.Common.Events;
using Sanad.Application.Common.Interfaces;
using Sanad.Domain.Common;

namespace Sanad.Infrastructure.Persistence.Outbox;

public sealed class OutboxOptions
{
    public const string Section = "Outbox";

    public int PollIntervalMilliseconds { get; set; } = 2000;
    public int BatchSize { get; set; } = 50;
    public int MaxAttempts { get; set; } = 10;
    public bool Enabled { get; set; } = true;
}

/// <summary>
/// ينشر رسائل Outbox دورياً بتسليم At-Least-Once. المعالِجات يجب أن تكون متسامحة مع التكرار.
/// </summary>
public sealed class OutboxProcessor(IServiceScopeFactory scopes, IOptions<OutboxOptions> options, ILogger<OutboxProcessor> logger) : BackgroundService
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly ConcurrentDictionary<string, Type?> TypeCache = new();

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.Enabled) return;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var processed = await ProcessBatchAsync(stoppingToken);
                if (processed == 0) await Task.Delay(options.Value.PollIntervalMilliseconds, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Outbox batch failed");
                await Task.Delay(options.Value.PollIntervalMilliseconds, stoppingToken);
            }
        }
    }

    public async Task<int> ProcessBatchAsync(CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<SanadDbContext>();
        var clock = scope.ServiceProvider.GetRequiredService<IDateTime>();
        var max = options.Value.MaxAttempts;

        var batch = (await db.OutboxMessages.Where(m => m.ProcessedAtUtc == null && m.Attempts < max).ToListAsync(ct))
            .OrderBy(m => m.OccurredAtUtc).Take(options.Value.BatchSize).ToList();

        foreach (var message in batch)
        {
            try
            {
                await using var handlerScope = scopes.CreateAsyncScope();
                var publisher = handlerScope.ServiceProvider.GetRequiredService<IPublisher>();
                var notification = Deserialize(message);
                if (notification is not null) await publisher.Publish(notification, ct);
                message.ProcessedAtUtc = clock.UtcNow;
                message.LastError = null;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                message.Attempts++;
                message.LastError = ex.GetType().Name + ": " + (ex.Message.Length > 500 ? ex.Message[..500] : ex.Message);
                logger.LogWarning(ex, "Outbox message {Id} ({Type}) failed, attempt {Attempt}", message.Id, message.Type, message.Attempts);
            }
        }
        await db.SaveChangesAsync(ct);
        return batch.Count;
    }

    private static INotification? Deserialize(OutboxMessage message)
    {
        var type = TypeCache.GetOrAdd(message.Type, name => typeof(IDomainEvent).Assembly.GetType(name));
        if (type is null || !typeof(IDomainEvent).IsAssignableFrom(type)) return null;
        var domainEvent = JsonSerializer.Deserialize(message.PayloadJson, type, Json);
        if (domainEvent is null) return null;
        var wrapperType = typeof(DomainEventNotification<>).MakeGenericType(type);
        return (INotification)Activator.CreateInstance(wrapperType, domainEvent)!;
    }
}
