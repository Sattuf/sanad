using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Sanad.Application.Common.Interfaces;
using Sanad.Domain.Identity;
using Sanad.Infrastructure.Persistence;

namespace Sanad.Infrastructure.Identity;

/// <summary>ينشئ المخطط (حسب المزود) والأدوار الثابتة، ثم يشغّل Bootstrap أول مدير.</summary>
public sealed class DatabaseInitializer(IServiceScopeFactory scopes, IConfiguration config, ILogger<DatabaseInitializer> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<SanadDbContext>();

        if (db.IsSqlite)
            await db.Database.EnsureCreatedAsync(cancellationToken); // تطوير/اختبار فقط — ADR-0002
        else if (config.GetValue("Database:ApplyMigrationsOnStartup", false))
            await db.Database.MigrateAsync(cancellationToken);

        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<ApplicationRole>>();
        foreach (var role in Enum.GetNames<SanadRole>())
            if (!await roles.RoleExistsAsync(role))
                await roles.CreateAsync(new ApplicationRole(role));

        await scope.ServiceProvider.GetRequiredService<AdminBootstrapSeeder>().RunAsync(cancellationToken);
        logger.LogInformation("Database initialized");
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}

/// <summary>
/// Bootstrap أول SystemAdmin — آلية Seeding آمنة لا حقن مباشر (ADR-0003):
/// يعمل مرة واحدة فقط في عمر النظام، عبر Identity API (تجزئة صحيحة)، بإعداد صريح، مع 2FA إلزامي وتغيير كلمة مرور إلزامي.
/// كل مدير/منسق لاحق يُنشأ حصراً عبر AssignRoleCommand.
/// </summary>
public sealed class AdminBootstrapSeeder(UserManager<ApplicationUser> userManager, SanadDbContext db, IConfiguration config,
    IAuditLogger audit, IDateTime clock, ILogger<AdminBootstrapSeeder> logger)
{
    public async Task<bool> RunAsync(CancellationToken ct)
    {
        var adminRoleId = await db.Roles.Where(r => r.Name == SanadRoles.SystemAdmin).Select(r => r.Id).FirstOrDefaultAsync(ct);
        if (await db.UserRoles.AnyAsync(ur => ur.RoleId == adminRoleId, ct))
            return false; // لا يُنشئ حساباً ثانياً أبداً إن وُجد واحد بالفعل

        var email = config["Bootstrap:AdminEmail"];
        var tempPassword = config["Bootstrap:AdminTempPassword"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(tempPassword))
        {
            logger.LogWarning("No SystemAdmin exists and Bootstrap:AdminEmail/AdminTempPassword are not configured — skipping bootstrap.");
            return false;
        }

        var admin = new ApplicationUser
        {
            Email = email,
            UserName = email,
            EmailConfirmed = true,
            DisplayName = "مدير النظام",
            MustChangePassword = true,
            CreatedAtUtc = clock.UtcNow,
        };
        var result = await userManager.CreateAsync(admin, tempPassword);
        if (!result.Succeeded)
            throw new InvalidOperationException("فشل Bootstrap — كلمة المرور المؤقتة لا تستوفي سياسة كلمات المرور أو البريد مستخدم.");

        await userManager.AddToRoleAsync(admin, SanadRoles.SystemAdmin);
        await userManager.SetTwoFactorEnabledAsync(admin, true); // إلزامي فوراً، لا اختياري لاحقاً
        await audit.LogForActorAsync(admin.Id, "System.AdminBootstrapped", "User", admin.Id, ct: ct);
        logger.LogWarning("SystemAdmin bootstrapped. Remove Bootstrap:* secrets now; password change and 2FA setup are enforced on first login.");
        return true;
    }
}
