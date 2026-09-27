# المرحلة 4 — طبقة Infrastructure

هذه الطبقة تنفّذ واجهات Application بتقنيات حقيقية. **لا منطق عمل هنا** — فقط تنفيذ تقني.

## 4.1 EF Core وPostgreSQL

```csharp
public class SanadDbContext : IdentityDbContext<ApplicationUser, ApplicationRole, Guid>, IApplicationDbContext
{
    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<ProviderProfile> ProviderProfiles => Set<ProviderProfile>();
    public DbSet<ServiceOffering> ServiceOfferings => Set<ServiceOffering>();
    public DbSet<VerificationRecord> VerificationRecords => Set<VerificationRecord>();
    public DbSet<AvailabilitySlot> AvailabilitySlots => Set<AvailabilitySlot>();
    public DbSet<BookingRequest> BookingRequests => Set<BookingRequest>();
    public DbSet<Conversation> Conversations => Set<Conversation>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<ProviderCaseNote> ProviderCaseNotes => Set<ProviderCaseNote>();
    public DbSet<AudioTrack> AudioTracks => Set<AudioTrack>();
    public DbSet<UserFavoriteTrack> UserFavoriteTracks => Set<UserFavoriteTrack>();
    public DbSet<ConsentRecord> ConsentRecords => Set<ConsentRecord>();
    public DbSet<Report> Reports => Set<Report>();
    public DbSet<EscalationCase> EscalationCases => Set<EscalationCase>();
    public DbSet<AuditLogEntry> AuditLogEntries => Set<AuditLogEntry>();
    public DbSet<OutboxMessage> OutboxMessages => Set<OutboxMessage>();
    // لا DbSet لأي كيان دفع أو اشتراك — بحث نصي عن "Payment"/"Subscription" في هذا الملف يجب أن يعيد صفر نتائج

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.ApplyConfigurationsFromAssembly(typeof(SanadDbContext).Assembly);
        builder.Entity<BookingRequest>().HasQueryFilter(b => !b.IsDeleted);
    }
}
```

### إعدادات الكيانات الحساسة

```csharp
public class BookingRequestConfiguration : IEntityTypeConfiguration<BookingRequest>
{
    public void Configure(EntityTypeBuilder<BookingRequest> b)
    {
        b.ToTable("BookingRequests");
        b.HasKey(x => x.Id);
        b.Property(x => x.Status).HasConversion<string>().HasMaxLength(40);
        b.Property(x => x.IdempotencyKey).HasMaxLength(100);
        b.HasIndex(x => x.IdempotencyKey).IsUnique();
        // النص هنا مشفّر بالفعل عند وصوله من Domain (IFieldEncryptor.Encrypt استُدعي قبل الإسناد) —
        // العمود يخزّن نص التشفير كما هو، بلا أي ValueConverter إضافي يعيد فك التشفير تلقائياً عند القراءة
        b.Property(x => x.BeneficiaryNoteEncrypted).HasColumnType("text");
        b.Property<uint>("RowVersion").IsRowVersion();
        b.HasQueryFilter(x => !x.IsDeleted);
    }
}

public class ProviderCaseNoteConfiguration : IEntityTypeConfiguration<ProviderCaseNote>
{
    public void Configure(EntityTypeBuilder<ProviderCaseNote> b)
    {
        b.ToTable("ProviderCaseNotes");
        b.Property(x => x.NoteEncrypted).HasColumnType("text").IsRequired();
        b.HasIndex(x => x.BookingRequestId);
        // لا فهرس نصي كامل (Full Text) على هذا العمود أبداً — هو نص مشفّر، بحث نصي عليه بلا معنى وقد يوحي خطأً بإمكانية استعلام محتواه
    }
}
```

### الفهارس الضرورية دنيا

- `AvailabilitySlots(ProviderProfileId, StartUtc, EndUtc)`
- `VerificationRecords(SubjectId, Status, ExpiresAtUtc)`
- `Messages(ConversationId, CreatedAtUtc)`
- `BookingRequests(IdempotencyKey)` فريد
- `AudioTracks(Category, IsPublished)` — لدعم `GetLibraryQuery` المفلترة
- فهرس بحث نصي كامل على أعمدة الدليل العلنية القابلة للبحث فقط (اسم الجهة، الوصف، نوع الخدمة) — **لا يشمل أي عمود مشفّر أبداً**.

## 4.2 التخزين (FileStorage)

بلا تغيير عن النسخة السابقة — يُستخدم الآن لغرضين: مستندات التوثيق (خاص، روابط موقّعة قصيرة الأجل)، ومقاطع مكتبة الرقية (عام، `IsPublished` فقط قابل للوصول المباشر).

```csharp
public class ObjectStorageFileStorage : IFileStorage
{
    // قائمة سماح صريحة للامتدادات: pdf/jpg/png لمستندات التوثيق، mp3/m4a لمقاطع المكتبة فقط
    // فحص التوقيع الثنائي الفعلي (Magic Bytes)، لا الامتداد المُدَّعى فقط
    // حد أقصى للحجم يُرفض على مستوى الخادم قبل اكتمال الرفع
}
```

## 4.3 الوقت الفعلي (SignalR) — بلا تغيير

```csharp
[Authorize]
public class ChatHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"user:{Context.UserIdentifier}");
        await base.OnConnectedAsync();
    }
}

services.AddSignalR().AddStackExchangeRedis(redisConnectionString);
```

الرسائل تُحفظ في قاعدة البيانات أولاً، ثم تُبَث عبر Outbox (§4.7)، بلا تغيير عن النسخة السابقة.

## 4.4 الإشعارات (FCM + واتساب اختياري) — بلا تغيير

```csharp
public class FcmNotificationDispatcher : INotificationDispatcher { /* كما سابقاً */ }
public class WhatsAppNotificationDispatcher : INotificationDispatcher { /* خلف Feature Flag اختياري */ }
```

### مهمة `VerificationExpiryCheckJob` — بلا تغيير في المنطق

## 4.5 التشفير (Encryption) — جديد، إلزامي لكل نص حساس

```csharp
public class AesFieldEncryptor : IFieldEncryptor
{
    private readonly byte[] _key; // من Key Vault في الإنتاج، من User Secrets محلياً — أبداً Hardcoded

    public string Encrypt(string plainText)
    {
        using var aes = Aes.Create();
        aes.Key = _key;
        aes.GenerateIV();
        using var encryptor = aes.CreateEncryptor();
        var plainBytes = Encoding.UTF8.GetBytes(plainText);
        var cipherBytes = encryptor.TransformFinalBlock(plainBytes, 0, plainBytes.Length);
        // IV يُخزَّن ملحقاً بالنص المشفّر (غير سري بذاته)، لا في عمود منفصل يُنسى عند النسخ الاحتياطي
        return Convert.ToBase64String(aes.IV.Concat(cipherBytes).ToArray());
    }

    public string Decrypt(string cipherText)
    {
        var fullBytes = Convert.FromBase64String(cipherText);
        using var aes = Aes.Create();
        aes.Key = _key;
        aes.IV = fullBytes[..16];
        using var decryptor = aes.CreateDecryptor();
        var cipherBytes = fullBytes[16..];
        var plainBytes = decryptor.TransformFinalBlock(cipherBytes, 0, cipherBytes.Length);
        return Encoding.UTF8.GetString(plainBytes);
    }
}
```

**قواعد إلزامية:**
- مفتاح التشفير **منفصل تماماً** عن مفتاح توقيع JWT، ومُدار عبر Key Vault في الإنتاج (§4.11) بدوران دوري.
- فك التشفير يحدث **فقط عند نقطة القراءة المصرَّح بها** (`GetBookingNoteQuery`, `GetCaseNoteForBookingQuery`) بعد اجتياز `AuthorizationBehavior` — لا يُفك تلقائياً عند أي استعلام عام يجلب `BookingRequest`.
- اختبار وحدة إلزامي: فحص القيمة الخام في عمود `BeneficiaryNoteEncrypted`/`NoteEncrypted` مباشرة في قاعدة بيانات اختبار، والتأكد أنها **لا تحتوي النص الصريح بأي شكل** — لا تكتفِ باختبار أن `Decrypt(Encrypt(x)) == x` فقط.

## 4.6 التخزين المؤقت (Caching) — Redis، بلا تغيير جوهري

استخدامات Redis: Cache لـ `GET /directory` وResults`GET /library`، Backplane لـ SignalR، قائمة إبطال JWT. راجع `11-security-hardening-and-scalability.md` §11.8 للتفاصيل والترتيب.

## 4.7 نمط Outbox — بلا تغيير

راجع النسخة السابقة: كل حدث Domain (بما فيه `EmergencyReferralTriggeredEvent` الناتج عن `BeneficiaryNote`) يُكتب كسجل `OutboxMessage` ضمن نفس المعاملة، ويُنشَر عبر عملية خلفية دورية.

## 4.8 طابور الرسائل — اختياري، بلا تغيير

## 4.9 CAPTCHA وحماية النماذج العامة

```csharp
public class TurnstileCaptchaVerifier : ICaptchaVerifier { /* كما سابقاً */ }
```

**تحديث v2:** يُستدعى إلزامياً أيضاً على `POST /auth/phone/request-otp` — بدونه، طلب OTP متكرر آلياً يستنزف رصيد مزود الرسائل النصية بسرعة (هجوم استنزاف تكلفة، لا فقط إزعاج).

## 4.10 تسجيل الدخول متعدد الطرق (v2 — يستبدل §4.10 من النسخة السابقة بالكامل)

```csharp
public class AspNetIdentityService : IIdentityService
{
    // البريد الإلكتروني — ASP.NET Core Identity القياسي
    public async Task<AuthResult> RegisterWithEmailAsync(string email, string password, CancellationToken ct)
    {
        var user = new ApplicationUser { Email = email, UserName = email };
        var result = await _userManager.CreateAsync(user, password);
        if (!result.Succeeded) throw new ValidationException(/* ... */);
        await _userManager.AddToRoleAsync(user, nameof(SanadRole.Beneficiary)); // دور افتراضي فوري، بلا أي مستند
        return await IssueTokensAsync(user, isNewUser: true, ct);
    }

    // جوجل — External Login القياسي في ASP.NET Core
    public Task<string> GetGoogleChallengeUrlAsync(string returnUrl, CancellationToken ct)
        => Task.FromResult(_signInManager.ConfigureExternalAuthenticationProperties("Google", returnUrl).RedirectUri);

    public async Task<AuthResult> CompleteGoogleLoginAsync(string externalProviderKey, string verifiedEmail, CancellationToken ct)
    {
        var user = await _userManager.FindByLoginAsync("Google", externalProviderKey)
            ?? await CreateFromExternalLoginAsync(verifiedEmail, "Google", externalProviderKey, ct); // ربط أو إنشاء تلقائي
        return await IssueTokensAsync(user, isNewUser: /* ... */ false, ct);
    }

    // الهاتف — مزود OTP مخصص
    public async Task RequestPhoneOtpAsync(string phoneNumberE164, CancellationToken ct)
        => await _otpService.SendOtpAsync(phoneNumberE164, ct); // يُستدعى بعد التحقق من CAPTCHA في الـ Endpoint (§4.9)

    public async Task<AuthResult> VerifyPhoneOtpAsync(string phoneNumberE164, string code, CancellationToken ct)
    {
        if (!await _otpService.VerifyOtpAsync(phoneNumberE164, code, ct))
            throw new ValidationException("رمز التحقق غير صحيح أو منتهي الصلاحية.");
        var user = await _userManager.Users.FirstOrDefaultAsync(u => u.PhoneNumber == phoneNumberE164, ct)
            ?? await CreateFromPhoneAsync(phoneNumberE164, ct);
        return await IssueTokensAsync(user, isNewUser: /* ... */ false, ct);
    }

    // منح الأدوار — الآلية الرسمية الوحيدة، تُستدعى فقط من SystemAdmin (راجع 06-core-modules-workflows.md §6.4)
    public async Task AssignRoleAsync(Guid userId, SanadRole role, Guid assignedByUserId, CancellationToken ct)
    {
        var user = await _userManager.FindByIdAsync(userId.ToString())
            ?? throw new NotFoundException(nameof(ApplicationUser), userId);
        await _userManager.AddToRoleAsync(user, role.ToString());
        await _auditLogger.LogAsync("Identity.RoleAssigned", userId,
            metadata: new { Role = role.ToString(), AssignedBy = assignedByUserId }, ct);
        // إن كان الدور من الأدوار الحساسة (Coordinator, PrivacySecurityOfficer, ClinicalSupervisor, SystemAdmin):
        // فعّل شرط 2FA إلزامي على الحساب فوراً، ولا تسمح بأي عملية إدارية قبل تفعيله فعلياً من المستخدم
    }
}

public interface IOtpService
{
    Task SendOtpAsync(string phoneNumberE164, CancellationToken ct);   // صلاحية قصيرة (5 دقائق)، محاولات محدودة (5 كحد أقصى)
    Task<bool> VerifyOtpAsync(string phoneNumberE164, string code, CancellationToken ct);
}
```

```csharp
// Program.cs — تسجيل Google كمزود مصادقة خارجي
services.AddAuthentication()
    .AddGoogle(options =>
    {
        options.ClientId = configuration["Auth:Google:ClientId"]!;      // من Key Vault/User Secrets
        options.ClientSecret = configuration["Auth:Google:ClientSecret"]!;
    });
```

**قاعدة جوهرية (v2):** **`IdentityVerified ≠ AdministrativelyApproved`**. نجاح أي من طرق §4.10 الثلاث يعني فقط "نعرف أن هذا بريد/حساب جوجل/رقم هاتف حقيقي يملكه صاحبه"، ويمنح دور `Beneficiary` فوراً بلا أي مستند. الاعتماد كمقدّم خدمة موثّق (`VerificationRecord.Approved`) قرار إداري منفصل تماماً، لا علاقة تقنية مباشرة بينهما سوى أن كليهما يخصّان نفس `ApplicationUser` — راجع `06-core-modules-workflows.md` §6.1 للتدفّق الكامل.

## 4.11 إدارة الأسرار

بلا تغيير جوهري عن النسخة السابقة: `dotnet user-secrets` محلياً، Key Vault/Vault في الإنتاج، دوران دوري. **أُضيف الآن**: مفتاح تشفير الحقول الحساسة (§4.5) يُدار بنفس الصرامة، منفصلاً عن مفتاح JWT.

## 4.12 Bootstrap أول حساب إدارة — آلية Seeding آمنة، لا حقن مباشر أبداً

```csharp
public class AdminBootstrapSeeder : IHostedService
{
    public async Task StartAsync(CancellationToken ct)
    {
        if (await _userManager.Users.AnyAsync(u => u.Roles.Contains(nameof(SanadRole.SystemAdmin)), ct))
            return; // لا تُنشئ حساباً ثانياً أبداً إن وُجد واحد بالفعل — يعمل مرة واحدة فقط في عمر النظام

        var email = _config["Bootstrap:AdminEmail"];           // من User Secrets محلياً / Key Vault في الإنتاج فقط
        var tempPassword = _config["Bootstrap:AdminTempPassword"];
        if (email is null || tempPassword is null) return;      // لا يعمل بصمت بلا إعداد صريح

        var admin = new ApplicationUser { Email = email, UserName = email, MustChangePassword = true };
        var result = await _userManager.CreateAsync(admin, tempPassword); // عبر Identity API → تجزئة صحيحة، لا نص صريح أبداً
        if (!result.Succeeded) throw new InvalidOperationException("فشل Bootstrap — راجع سجل الإقلاع.");

        await _userManager.AddToRoleAsync(admin, nameof(SanadRole.SystemAdmin));
        await _userManager.SetTwoFactorEnabledAsync(admin, true); // إلزامي فوراً، لا اختياري لاحقاً
        await _auditLogger.LogAsync("System.AdminBootstrapped", admin.Id, ct: ct);
    }

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;
}
```

سجّله في `Program.cs`: `services.AddHostedService<AdminBootstrapSeeder>();`

**لماذا ليس حقناً مباشراً في قاعدة البيانات:** الحقن اليدوي (`INSERT` مباشر) يتجاوز تجزئة كلمة المرور الصحيحة عبر Identity، لا يُنشئ سجل تدقيق، ولا يضمن اتساق باقي القيود (الأدوار، الـ Claims، شرط 2FA الإلزامي). هذا الـ Seeder يحل المشكلة الحقيقية — "من يعتمد أول مدير قبل وجود أي مدير أصلاً" — عبر مسار Identity الرسمي نفسه، مرة واحدة فقط، بإعداد صريح لا افتراضي. **كل مدير/منسق لاحق بعد هذا الأول يُنشأ حصراً عبر `AssignRoleCommand`** من `SystemAdmin` موجود فعلاً (§4.10)، لا عبر هذا الـ Seeder ولا عبر أي اختصار آخر.

## 4.13 فحوصات الصحة (Health Checks) — بلا تغيير

```csharp
services.AddHealthChecks()
    .AddNpgSql(connectionString, name: "postgres")
    .AddRedis(redisConnectionString, name: "redis")
    .AddCheck<ObjectStorageHealthCheck>("object-storage");

app.MapHealthChecks("/health/live");
app.MapHealthChecks("/health/ready");
```
