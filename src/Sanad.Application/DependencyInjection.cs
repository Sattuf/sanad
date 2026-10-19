using FluentValidation;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Sanad.Application.Common.Access;
using Sanad.Application.Common.Behaviors;
using Sanad.Application.Modules.Safety;

namespace Sanad.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        var assembly = typeof(DependencyInjection).Assembly;

        services.AddMediatR(cfg =>
        {
            cfg.RegisterServicesFromAssembly(assembly);
            // الترتيب ملزم — references/03-application-layer.md §3.3
            cfg.AddOpenBehavior(typeof(UnhandledExceptionBehavior<,>));
            cfg.AddOpenBehavior(typeof(ValidationBehavior<,>));
            cfg.AddOpenBehavior(typeof(AuthorizationBehavior<,>));
            cfg.AddOpenBehavior(typeof(IdempotencyBehavior<,>));
            cfg.AddOpenBehavior(typeof(AuditLoggingBehavior<,>));
        });

        // كل قاعدة تتوقف عند أول إخفاق: NotNull().Must(x => x.Count…) كانت تكمل إلى Must على null فترمي (500)
        ValidatorOptions.Global.DefaultRuleLevelCascadeMode = CascadeMode.Stop;
        services.AddValidatorsFromAssembly(assembly, includeInternalTypes: true);
        services.AddScoped<AccessContext>();
        services.AddScoped<FileUploadService>();
        services.AddScoped<EscalationService>();
        return services;
    }
}
