using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.FeatureManagement;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Modules.Ruqyah;
using Sanad.Application.Modules.RuqyahLibrary;
using Sanad.Domain.Common;
using Sanad.Infrastructure.Caching;
using Sanad.Infrastructure.Captcha;
using Sanad.Infrastructure.Encryption;
using Sanad.Infrastructure.Identity;
using Sanad.Infrastructure.Jobs;
using StackExchange.Redis;
using Sanad.Infrastructure.Library;
using Sanad.Infrastructure.Notifications;
using Sanad.Infrastructure.Persistence;
using Sanad.Infrastructure.Persistence.Outbox;
using Sanad.Infrastructure.Realtime;
using Sanad.Infrastructure.Safety;
using Sanad.Infrastructure.Services;
using Sanad.Infrastructure.Storage;

namespace Sanad.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration config, IHostEnvironment env)
    {
        services.AddHttpContextAccessor();

        // ── الإعدادات ──
        services.Configure<FieldEncryptionOptions>(config.GetSection(FieldEncryptionOptions.Section));
        services.Configure<JwtOptions>(config.GetSection(JwtOptions.Section));
        services.Configure<OtpOptions>(config.GetSection(OtpOptions.Section));
        services.Configure<CaptchaOptions>(config.GetSection(CaptchaOptions.Section));
        services.Configure<StorageOptions>(config.GetSection(StorageOptions.Section));
        services.Configure<OutboxOptions>(config.GetSection(OutboxOptions.Section));
        services.Configure<PolicyVersionOptions>(config.GetSection(PolicyVersionOptions.Section));

        // ── قاعدة البيانات: PostgreSQL في الإنتاج، SQLite للتطوير/الاختبار (ADR-0002) ──
        var provider = config["Database:Provider"] ?? "Postgres";
        var connectionString = config.GetConnectionString("Sanad") ?? throw new InvalidOperationException("ConnectionStrings:Sanad غير مُعدّ.");
        services.AddDbContext<SanadDbContext>(options =>
        {
            if (provider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase)) options.UseSqlite(connectionString);
            else options.UseNpgsql(connectionString);
        });
        services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<SanadDbContext>());

        // ── Identity ──
        services.AddIdentityCore<ApplicationUser>(o =>
            {
                o.User.RequireUniqueEmail = false; // مستخدمو الهاتف بلا بريد؛ التفرد مفروض في منطق التسجيل
                o.Password.RequiredLength = 10;
                o.Password.RequireDigit = true;
                o.Password.RequireUppercase = true;
                o.Password.RequireLowercase = true;
                o.Password.RequireNonAlphanumeric = false;
                o.Lockout.MaxFailedAccessAttempts = 5;
                o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
                o.Lockout.AllowedForNewUsers = true;
            })
            .AddRoles<ApplicationRole>()
            .AddEntityFrameworkStores<SanadDbContext>()
            .AddDefaultTokenProviders();

        services.AddScoped<JwtTokenService>();
        services.AddScoped<TokenRevocationStore>();
        services.AddScoped<SignInTicketStore>();
        services.AddScoped<IOtpService, OtpService>();
        services.AddScoped<IIdentityService, AspNetIdentityService>();
        // دخول جوجل وأبل الأصلي من الجوال (ADR-0019) — مفاتيح المزودين مخزّنة مؤقتاً على مستوى التطبيق
        services.AddSingleton<IExternalSigningKeys, OidcSigningKeys>();
        services.AddSingleton<IExternalIdTokenValidator, ExternalIdTokenValidator>();
        services.AddScoped<AdminBootstrapSeeder>();
        if (env.IsDevelopment() && config.GetValue("Otp:DevelopmentLogCodes", false))
            services.TryAddSingleton<ISmsSender, DevelopmentLogSmsSender>();
        else
            services.TryAddSingleton<ISmsSender, NotConfiguredSmsSender>();

        // ── الخدمات الأساسية ──
        services.AddSingleton<IDateTime, SystemDateTime>();
        services.AddScoped<ICurrentUser, HttpCurrentUser>();
        services.AddScoped<IRequestContext, HttpRequestContext>();
        services.AddScoped<IAuditLogger, AuditLogger>();
        services.AddScoped<IIdempotencyStore, DbIdempotencyStore>();
        services.AddSingleton<IFieldEncryptor, AesGcmFieldEncryptor>();
        services.AddSingleton<IContentPolicyChecker, ContentPolicyChecker>();
        services.AddSingleton<IPolicyVersionProvider, PolicyVersionProvider>();

        // ── Cache: Redis إن وُجد، وإلا ذاكرة محلية ──
        var redis = config.GetConnectionString("Redis");
        if (!string.IsNullOrWhiteSpace(redis))
        {
            services.AddStackExchangeRedisCache(o => { o.Configuration = redis; o.InstanceName = "sanad:"; });
            // اتصال مشترك لحدود المعدل الموزّعة (ADR-0020) — لا يُسقط الإقلاع إن تأخر Redis، والحد يعود محلياً حتى يتصل
            services.AddSingleton<IConnectionMultiplexer>(_ =>
            {
                var options = ConfigurationOptions.Parse(redis);
                options.AbortOnConnectFail = false;
                options.ConnectTimeout = Math.Min(options.ConnectTimeout, 3000);
                options.SyncTimeout = Math.Min(options.SyncTimeout, 1000);
                options.AsyncTimeout = Math.Min(options.AsyncTimeout, 1000);
                return ConnectionMultiplexer.Connect(options);
            });
        }
        else
            services.AddDistributedMemoryCache();
        services.AddSingleton<IDirectorySearchCache, DistributedDirectorySearchCache>();

        // ── التخزين ──
        // تخزين الملفات: محلي للتطوير، وكائنات متوافقة مع S3 مع CDN للإنتاج الموسّع (ADR-0020)
        if (string.Equals(config["Storage:Provider"], "S3", StringComparison.OrdinalIgnoreCase))
        {
            services.Configure<S3StorageOptions>(config.GetSection(S3StorageOptions.Section));
            services.AddSingleton<IFileStorage, S3FileStorage>();
        }
        else
        {
            services.AddSingleton<LocalFileStorage>();
            services.AddSingleton<IFileStorage>(sp => sp.GetRequiredService<LocalFileStorage>());
        }
        services.AddSingleton<IFileSignatureInspector, FileSignatureInspector>();

        // ── مصادر المكتبة المعتمدة (ADR-0015): بلا تحويل تلقائي — كل Redirect يُتحقق منه ضد قائمة السماح ──
        services.Configure<LibrarySourcesOptions>(config.GetSection(LibrarySourcesOptions.Section));
        services.AddHttpClient(TrustedSources.HttpClientName, c =>
            {
                c.Timeout = TimeSpan.FromSeconds(30); // حتى وصول الترويسات؛ قراءة الملف نفسه محكومة بمهلة التنزيل
                c.DefaultRequestHeaders.UserAgent.ParseAdd("Sanad-Library/1.0");
            })
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler { AllowAutoRedirect = false, ConnectTimeout = TimeSpan.FromSeconds(10) });
        services.AddSingleton<ILibraryCatalog, TrustedLibraryCatalog>();
        services.AddSingleton<IYouTubeVideoVerifier, YouTubeVideoVerifier>();

        // ── الوقت الفعلي والإشعارات ──
        var signalR = services.AddSignalR();
        if (!string.IsNullOrWhiteSpace(redis)) signalR.AddStackExchangeRedis(redis);
        services.AddSingleton<IRealtimePublisher, SignalRRealtimePublisher>();
        services.AddFeatureManagement();
        services.AddScoped<INotificationDispatcher, CompositeNotificationDispatcher>();
        services.AddScoped<IExternalNotificationChannel, FcmNotificationChannel>();
        services.AddScoped<IExternalNotificationChannel, WhatsAppNotificationChannel>();

        // ── تذكير الأذكار عبر Web Push (VAPID) ──
        services.Configure<WebPushOptions>(config.GetSection(WebPushOptions.Section));
        services.AddHttpClient(WebPushReminderSender.HttpClientName, c => c.Timeout = TimeSpan.FromSeconds(15))
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler { AllowAutoRedirect = false, ConnectTimeout = TimeSpan.FromSeconds(10) });
        services.TryAddSingleton<IReminderPushSender, WebPushReminderSender>();

        // ── CAPTCHA ──
        services.AddHttpClient<ICaptchaVerifier, TurnstileCaptchaVerifier>(c => c.Timeout = TimeSpan.FromSeconds(5));

        // ── الخدمات الخلفية: كل مهمة على نسخة واحدة في كل مرة (ADR-0020) ──
        if (provider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase)) services.AddSingleton<IJobLock, InProcessJobLock>();
        else services.AddSingleton<IJobLock>(new PostgresAdvisoryJobLock(connectionString));
        services.AddHostedService<DatabaseInitializer>();
        services.AddHostedService<DevDataSeeder>(); // Development + DevSeed:Enabled فقط
        services.AddSingleton<OutboxProcessor>();
        services.AddHostedService(sp => sp.GetRequiredService<OutboxProcessor>());
        services.AddSingleton<VerificationExpiryCheckJob>();
        services.AddHostedService(sp => sp.GetRequiredService<VerificationExpiryCheckJob>());
        services.AddSingleton<AdhkarReminderJob>();
        services.AddHostedService(sp => sp.GetRequiredService<AdhkarReminderJob>());

        // ── فحوصات الصحة ──
        var health = services.AddHealthChecks().AddCheck<ObjectStorageHealthCheck>("object-storage", tags: ["ready"]);
        if (!provider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase)) health.AddNpgSql(connectionString, name: "postgres", tags: ["ready"]);
        else health.AddDbContextCheck<SanadDbContext>("database", tags: ["ready"]);
        if (!string.IsNullOrWhiteSpace(redis)) health.AddRedis(redis, name: "redis", tags: ["ready"]);

        return services;
    }
}

/// <summary>لأداة dotnet-ef: هجرات PostgreSQL بلا حاجة لاتصال فعلي.</summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<SanadDbContext>
{
    public SanadDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<SanadDbContext>()
            .UseNpgsql(Environment.GetEnvironmentVariable("SANAD_DESIGN_CONNECTION") ?? "Host=localhost;Database=sanad_design;Username=postgres")
            .Options;
        return new SanadDbContext(options);
    }
}
