using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Sanad.Application.Common.Interfaces;
using Sanad.Domain.Common;
using Sanad.Domain.Consent;
using Sanad.Domain.Directory;
using Sanad.Domain.Identity;
using Sanad.Domain.RuqyahLibrary;
using Sanad.Domain.Scheduling;
using Sanad.Domain.Verification;
using Sanad.Infrastructure.Persistence;

namespace Sanad.Infrastructure.Identity;

/// <summary>
/// بيانات اصطناعية بالكامل للتطوير والعرض فقط (Development + DevSeed:Enabled=true). لا يعمل في أي بيئة أخرى إطلاقاً.
/// يمر عبر نفس قواعد Domain (توثيق ← اعتماد ← نشر) — لا اختصار لبوابة النشر.
/// الحسابات التجريبية أدوار غير حساسة، باستثناء مدير محتوى تجريبي واحد لتجربة مكتبة الرقية محلياً
/// (يُفرض عليه إعداد 2FA عند أول دخول كأي دور إداري). بقية الأدوار الإدارية تُمنح يدوياً من المدير الأول.
/// </summary>
public sealed class DevDataSeeder(IServiceScopeFactory scopes, IHostEnvironment env, IConfiguration config, ILogger<DevDataSeeder> logger) : IHostedService
{
    public const string DemoPassword = "Demo-Pass-123";

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (!env.IsDevelopment() || !config.GetValue("DevSeed:Enabled", false)) return;

        await using var scope = scopes.CreateAsyncScope();
        var sp = scope.ServiceProvider;
        var users = sp.GetRequiredService<UserManager<ApplicationUser>>();
        await EnsureContentManagerAsync(users, sp.GetRequiredService<SanadDbContext>(), cancellationToken);
        await DevCompanionSeed.SeedAsync(sp.GetRequiredService<SanadDbContext>(), sp.GetRequiredService<IContentPolicyChecker>(), cancellationToken);
        if (await users.FindByEmailAsync("beneficiary@sanad.local") is not null) return;

        var db = sp.GetRequiredService<SanadDbContext>();
        // معاملة واحدة: أي فشل لا يترك بيانات جزئية (UserManager يستخدم نفس السياق)
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var policy = sp.GetRequiredService<IContentPolicyChecker>();
        var storage = sp.GetRequiredService<IFileStorage>();
        var now = DateTimeOffset.UtcNow;
        var coordinatorStandIn = Guid.NewGuid();

        await CreateUserAsync(users, db, "beneficiary@sanad.local", "مستفيد تجريبي", SanadRoles.Beneficiary, now);

        var sheikh = await CreateUserAsync(users, db, "sheikh@sanad.local", "الشيخ عبدالله (تجريبي)", SanadRoles.Beneficiary, now);

        var org = Organization.Create("جمعية الطمأنينة الوقفية (تجريبية)", "الطمأنينة", OrganizationTrack.WaqfFree, "DEMO-0001", "جهة تنظيمية تجريبية",
            null, "جهة وقفية تجريبية تقدّم جلسات رقية وإرشاد ديني مجانية مع مشايخ موثّقين. بيانات اصطناعية للعرض فقط.", "الرياض", policy);
        var orgVerification = VerificationRecord.RequestForOrganization(org.Id, VerificationDocumentTypes.OrganizationRegistration, "جهة تنظيمية تجريبية", null, null, now);
        orgVerification.Approve(coordinatorStandIn, false, now.AddYears(1), now);
        org.Publish(orgVerification, now);
        db.Organizations.Add(org);
        db.VerificationRecords.Add(orgVerification);

        await SeedPractitionerAsync(users, db, policy, sheikh, PractitionerType.ReligiousPractitioner, VerificationDocumentTypes.ShariaIjazah,
            "راقٍ شرعي مجاز", "رقية شرعية بالقرآن والأدعية المأثورة، وإرشاد ديني عام.",
            "الرقية دعاء وسبب، والشفاء بيد الله وحده.", "جلسة رقية شرعية وإرشاد",
            org.Id, coordinatorStandIn, now);

        await SeedTracksAsync(db, storage, policy, sheikh.Id, now);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        logger.LogWarning("DEV SEED: synthetic demo data created. Accounts: beneficiary@ / sheikh@sanad.local (password: DevDataSeeder.DemoPassword).");
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    /// <summary>منفصل عن بقية البذور ليُضاف أيضاً إلى قواعد تطوير أُنشئت قبل وجوده.</summary>
    private async Task EnsureContentManagerAsync(UserManager<ApplicationUser> users, SanadDbContext db, CancellationToken ct)
    {
        const string email = "content@sanad.local";
        if (await users.FindByEmailAsync(email) is not null) return;
        await CreateUserAsync(users, db, email, "مدير محتوى (تجريبي)", SanadRoles.ContentManager, DateTimeOffset.UtcNow);
        await db.SaveChangesAsync(ct);
        logger.LogWarning("DEV SEED: content manager account created (see EnsureContentManagerAsync; password: DevDataSeeder.DemoPassword); 2FA setup is required on first sign-in.");
    }

    private static async Task<ApplicationUser> CreateUserAsync(UserManager<ApplicationUser> users, SanadDbContext db, string email, string name, string role, DateTimeOffset now)
    {
        var user = new ApplicationUser { Email = email, UserName = email, EmailConfirmed = true, DisplayName = name, CreatedAtUtc = now };
        var result = await users.CreateAsync(user, DemoPassword);
        if (!result.Succeeded) throw new InvalidOperationException("DEV SEED failed: " + string.Join(", ", result.Errors.Select(e => e.Code)));
        await users.AddToRoleAsync(user, role);
        db.ConsentRecords.Add(ConsentRecord.Accept(user.Id, ConsentType.TermsOfService, "1.0", now));
        db.ConsentRecords.Add(ConsentRecord.Accept(user.Id, ConsentType.PrivacyPolicy, "1.0", now));
        return user;
    }

    private static async Task SeedPractitionerAsync(UserManager<ApplicationUser> users, SanadDbContext db, IContentPolicyChecker policy, ApplicationUser user,
        PractitionerType type, string documentType, string title, string scope, string boundaries, string offeringCategory, Guid? organizationId,
        Guid coordinatorStandIn, DateTimeOffset now)
    {
        var verification = VerificationRecord.RequestProviderUpgrade(user.Id, type, title, documentType, "جهة إصدار تجريبية", Guid.NewGuid(), now);
        verification.Approve(coordinatorStandIn, false, now.AddYears(1), now);
        var profile = ProviderProfile.CreateFromApprovedUpgrade(verification, user.DisplayName, now);
        profile.UpdateProfile(user.DisplayName, title, scope, ["ar"], ServiceDeliveryMode.Both, "الرياض", boundaries, policy);
        profile.AttachToOrganization(organizationId);
        profile.Publish(verification, now);
        await users.AddToRoleAsync(user, SanadRoles.Practitioner);

        db.VerificationRecords.Add(verification);
        db.ProviderProfiles.Add(profile);
        db.ServiceOfferings.Add(ServiceOffering.Create(profile, offeringCategory, "جلسة فردية عن بعد أو حضورياً لتنسيق الاحتياج وتوجيه عام، مجانية بالكامل.",
            "يمكن الإلغاء قبل 24 ساعة من الموعد.", ["لا وعد بنتيجة", "لا تشخيص عبر المنصة"], 45, policy));

        var day = now.UtcDateTime.Date.AddDays(1);
        for (var d = 0; d < 10; d++)
            for (var h = 0; h < 3; h++)
            {
                var start = new DateTimeOffset(day.AddDays(d).AddHours(14 + h * 2), TimeSpan.Zero);
                db.AvailabilitySlots.Add(AvailabilitySlot.Create(profile.Id, start, start.AddMinutes(45), now));
            }
    }

    private static async Task SeedTracksAsync(SanadDbContext db, IFileStorage storage, IContentPolicyChecker policy, Guid createdBy, DateTimeOffset now)
    {
        (string Title, string Source, AudioTrackCategory Category, string Description)[] tracks =
        [
            ("آية الكرسي", "تلاوة — مقطع تجريبي صامت", AudioTrackCategory.QuranRecitation, "مقطع تجريبي صامت لعرض المكتبة؛ يُستبدل بتلاوة موثوقة المصدر قبل أي تشغيل فعلي."),
            ("المعوذات", "تلاوة — مقطع تجريبي صامت", AudioTrackCategory.QuranRecitation, "مقطع تجريبي صامت."),
            ("دعاء الكرب", "من السنة — مقطع تجريبي صامت", AudioTrackCategory.Dua, "مقطع تجريبي صامت."),
            ("أذكار المساء", "من السنة — مقطع تجريبي صامت", AudioTrackCategory.Adhkar, "مقطع تجريبي صامت."),
        ];
        foreach (var (title, source, category, description) in tracks)
        {
            var key = $"library-audio/demo/{Guid.NewGuid():N}.mp3";
            var bytes = SilentMp3(seconds: 12);
            await using (var stream = new MemoryStream(bytes)) await storage.SaveAsync(key, stream, "audio/mpeg", CancellationToken.None);
            db.StoredFiles.Add(StoredFile.Register(createdBy, StoredFilePurpose.LibraryAudio, key, "audio/mpeg", bytes.Length, "demo", now));
            var track = AudioTrack.Create(title, source, description, category, key, "audio/mpeg", 12, createdBy, policy);
            track.Publish(policy, now);
            db.AudioTracks.Add(track);
        }
    }

    /// <summary>ملف MP3 صامت صالح: إطارات MPEG-1 Layer III بمعدل 128kbps/44.1kHz بمحتوى صفري.</summary>
    private static byte[] SilentMp3(int seconds)
    {
        const int frameLength = 417;
        var frames = (int)Math.Ceiling(seconds * 44100.0 / 1152);
        var data = new byte[frames * frameLength];
        for (var i = 0; i < frames; i++)
        {
            var o = i * frameLength;
            data[o] = 0xFF;
            data[o + 1] = 0xFB;
            data[o + 2] = 0x90;
            data[o + 3] = 0x64;
        }
        return data;
    }
}
