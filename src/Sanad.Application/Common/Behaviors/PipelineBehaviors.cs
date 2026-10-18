using System.Collections.Concurrent;
using System.Reflection;
using System.Text.Json;
using FluentValidation;
using MediatR;
using Microsoft.Extensions.Logging;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Common.Messaging;
using Sanad.Domain.Exceptions;

namespace Sanad.Application.Common.Behaviors;

/// <summary>
/// يسجّل الاستثناءات غير المتوقعة باسم الطلب فقط — لا يسجّل محتوى الطلب أبداً (قد يحوي نصاً حساساً).
/// </summary>
public sealed class UnhandledExceptionBehavior<TRequest, TResponse>(ILogger<TRequest> logger)
    : IPipelineBehavior<TRequest, TResponse> where TRequest : notnull
{
    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        try
        {
            return await next();
        }
        catch (Exception ex) when (ex is not (DomainException or RequestValidationException or NotFoundException
                                       or ForbiddenAccessException or UnauthenticatedException or MfaRequiredException
                                       or ConflictException or TooManyRequestsException or AuthenticationFailedException
                                       or OperationCanceledException))
        {
            logger.LogError(ex, "Unhandled exception while processing {RequestName}", typeof(TRequest).Name);
            throw;
        }
    }
}

public sealed class ValidationBehavior<TRequest, TResponse>(IEnumerable<IValidator<TRequest>> validators)
    : IPipelineBehavior<TRequest, TResponse> where TRequest : notnull
{
    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        if (!validators.Any()) return await next();

        var context = new ValidationContext<TRequest>(request);
        var results = await Task.WhenAll(validators.Select(v => v.ValidateAsync(context, cancellationToken)));
        var failures = results.SelectMany(r => r.Errors).Where(f => f is not null).ToList();
        if (failures.Count == 0) return await next();

        var errors = failures
            .GroupBy(f => ToCamelCase(f.PropertyName), f => f.ErrorMessage)
            .ToDictionary(g => g.Key, g => g.Distinct().ToArray());
        throw new RequestValidationException(errors);
    }

    private static string ToCamelCase(string name) =>
        string.IsNullOrEmpty(name) ? name : char.ToLowerInvariant(name[0]) + name[1..];
}

/// <summary>
/// آمن افتراضياً: كل طلب يتطلب مصادقة ما لم يُعلَّم صراحة بـ AllowAnonymousRequest.
/// الأدوار الإدارية الحساسة تتطلب أيضاً جلسة بتحقق ثنائي. تحقق الملكية على مستوى المورد يتم داخل الـ Handler.
/// </summary>
public sealed class AuthorizationBehavior<TRequest, TResponse>(ICurrentUser currentUser)
    : IPipelineBehavior<TRequest, TResponse> where TRequest : notnull
{
    private static readonly ConcurrentDictionary<Type, (bool Anonymous, RequireRolesAttribute? Roles)> Cache = new();

    public Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        var (anonymous, roles) = Cache.GetOrAdd(typeof(TRequest), t =>
            (t.GetCustomAttribute<AllowAnonymousRequestAttribute>() is not null, t.GetCustomAttribute<RequireRolesAttribute>()));

        if (anonymous) return next();
        if (currentUser.UserId is null) throw new UnauthenticatedException();

        if (roles is not null)
        {
            if (!roles.Roles.Any(currentUser.IsInRole)) throw new ForbiddenAccessException();
            if (roles.RequireMfa && !currentUser.IsMfaAuthenticated) throw new MfaRequiredException();
        }
        return next();
    }
}

/// <summary>
/// إعادة إرسال نفس الأمر بنفس Idempotency-Key تعيد نفس النتيجة المخزَّنة، دون تنفيذ ثانٍ.
/// </summary>
public sealed class IdempotencyBehavior<TRequest, TResponse>(IRequestContext requestContext, ICurrentUser currentUser, IIdempotencyStore store)
    : IPipelineBehavior<TRequest, TResponse> where TRequest : notnull
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        if (request is not IIdempotentCommand || string.IsNullOrWhiteSpace(requestContext.IdempotencyKey)) return await next();

        var key = requestContext.IdempotencyKey!;
        var name = typeof(TRequest).Name;
        var cached = await store.GetResponseAsync(key, currentUser.UserId, name, cancellationToken);
        if (cached is not null) return JsonSerializer.Deserialize<TResponse>(cached, JsonOptions)!;

        var response = await next();
        await store.SaveResponseAsync(key, currentUser.UserId, name, JsonSerializer.Serialize(response, JsonOptions), cancellationToken);
        return response;
    }
}

/// <summary>
/// يسجّل كل أمر في سجل التدقيق: اسم العملية، الفاعل، المعرّف الناتج، والنجاح — لا أي حقل نصي من الطلب.
/// </summary>
public sealed class AuditLoggingBehavior<TRequest, TResponse>(IAuditLogger auditLogger)
    : IPipelineBehavior<TRequest, TResponse> where TRequest : notnull
{
    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        if (!IsCommand(typeof(TRequest))) return await next();

        var action = ActionName(typeof(TRequest));
        var module = ModuleName(typeof(TRequest));
        try
        {
            var response = await next();
            await auditLogger.LogAsync(action, module, ExtractId(response), null, true, cancellationToken);
            return response;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            await auditLogger.LogAsync(action, module, null, new { Outcome = ex.GetType().Name }, false, CancellationToken.None);
            throw;
        }
    }

    private static bool IsCommand(Type t) =>
        t.GetInterfaces().Any(i => i.IsGenericType && i.GetGenericTypeDefinition() == typeof(ICommand<>));

    private static string ActionName(Type t)
    {
        var name = t.Name.EndsWith("Command", StringComparison.Ordinal) ? t.Name[..^"Command".Length] : t.Name;
        return $"{ModuleName(t)}.{name}";
    }

    private static string ModuleName(Type t)
    {
        var parts = (t.Namespace ?? string.Empty).Split('.');
        var idx = Array.IndexOf(parts, "Modules");
        return idx >= 0 && idx + 1 < parts.Length ? parts[idx + 1] : "App";
    }

    private static Guid? ExtractId(object? response) => response switch
    {
        Guid g => g,
        null => null,
        _ => response.GetType().GetProperty("Id")?.GetValue(response) as Guid?,
    };
}

