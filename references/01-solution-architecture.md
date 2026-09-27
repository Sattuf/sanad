# المرحلة 1 — إعداد الحل والمعمارية

## 1.1 القرار المعماري

**Clean Architecture** منفَّذة داخل **Modular Monolith** واحد. أربع طبقات، واتجاه الاعتماد يذهب دائماً من الخارج إلى الداخل، أبداً العكس:

```
        ┌─────────────────────────────┐
        │   Sanad.Api  (العرض)        │  Controllers / Minimal APIs / Middleware
        └──────────────┬──────────────┘
                        │ يعتمد على
        ┌───────────────▼──────────────┐
        │ Sanad.Infrastructure         │  EF Core / Identity / SignalR / Storage / Cache / Encryption / OTP / Google
        └──────────────┬──────────────┘
                        │ ينفّذ واجهات
        ┌───────────────▼──────────────┐
        │ Sanad.Application  (حالات الاستخدام) │  Commands / Queries / DTOs / Validators
        └──────────────┬──────────────┘
                        │ يعتمد فقط على
        ┌───────────────▼──────────────┐
        │ Sanad.Domain  (القلب)        │  Entities / Value Objects / Domain Events
        └───────────────────────────────┘
```

القاعدة الصارمة: **Domain لا يعتمد على أي مشروع آخر**. **Application يعتمد على Domain فقط**. **Infrastructure وApi يعتمدان على Application**.

## 1.2 هيكل الحل

```
Sanad.sln
├── docs/adr/                       # Architecture Decision Records — إلزامي لكل قرار غير محسوم
│
├── src/
│   ├── Sanad.Domain/
│   │   ├── Common/               (BaseEntity, IAggregateRoot, DomainEvent, IFieldEncryptor)
│   │   ├── Identity/               (User, Role — لا FinanceOfficer في v2)
│   │   ├── Consent/                (ConsentRecord)
│   │   ├── Directory/              (Organization, ProviderProfile, ServiceOffering — بلا Price/IsFree في v2)
│   │   ├── Verification/           (VerificationRecord)
│   │   ├── Scheduling/             (AvailabilitySlot, BookingRequest — يحمل BeneficiaryNoteEncrypted)
│   │   ├── Messaging/              (Conversation, Message)
│   │   ├── PatientCare/            (ProviderCaseNote — خاص/إشرافي، وProviderRecommendation — موجَّه للمستفيد. راجع 02-domain-model.md §2.6–2.7)
│   │   ├── RuqyahLibrary/          (AudioTrack, UserFavoriteTrack, SharedContentLink — مشاركة عامة بلا مقابل مالي)
│   │   ├── Safety/                 (Report, EscalationCase)
│   │   ├── Audit/                  (AuditLogEntry)
│   │   └── Exceptions/
│   │
│   ├── Sanad.Application/
│   │   ├── Common/
│   │   │   ├── Interfaces/       (IApplicationDbContext, ICurrentUser, IDateTime, IFileStorage, INotificationDispatcher, IIdentityService, ICaptchaVerifier, IDirectorySearchCache)
│   │   │   ├── Behaviors/        (ValidationBehavior, AuthorizationBehavior, IdempotencyBehavior, AuditLoggingBehavior, SafetySignalBehavior, UnhandledExceptionBehavior)
│   │   │   └── Mappings/
│   │   └── Modules/
│   │       ├── Accounts/          (يشمل التسجيل والترقية وBootstrap الأدوار)
│   │       ├── Consent/
│   │       ├── Directory/
│   │       ├── Verification/
│   │       ├── Scheduling/
│   │       ├── Messaging/
│   │       ├── PatientCare/       (ProviderCaseNote الخاص + ProviderRecommendation الموجَّه للمستفيد)
│   │       ├── RuqyahLibrary/
│   │       └── Safety/
│   │
│   ├── Sanad.Infrastructure/
│   │   ├── Persistence/
│   │   │   ├── SanadDbContext.cs
│   │   │   ├── Configurations/
│   │   │   ├── Repositories/
│   │   │   ├── Outbox/
│   │   │   └── Migrations/
│   │   ├── Identity/                (ASP.NET Core Identity + JWT + Google External Login + IOtpService + AdminBootstrapSeeder)
│   │   ├── Encryption/               (تنفيذ IFieldEncryptor — AES مع مفتاح من Key Vault/User Secrets)
│   │   ├── Caching/                  (Redis)
│   │   ├── Storage/                   (تخزين مقاطع مكتبة الرقية ومستندات التوثيق)
│   │   ├── Realtime/                  (SignalR Hub، Redis Backplane)
│   │   ├── Notifications/            (FCM + واتساب اختياري)
│   │   ├── Captcha/
│   │   └── Security/
│   │
│   └── Sanad.Api/
│       ├── Endpoints/
│       ├── Middleware/
│       ├── Authorization/
│       ├── HealthChecks/
│       ├── Program.cs
│       └── appsettings.json
│
└── tests/
    ├── Sanad.Domain.UnitTests/
    ├── Sanad.Application.UnitTests/
    └── Sanad.Api.IntegrationTests/
```

لا يوجد مجلد `Payments` في هذه النسخة إطلاقاً — لا في Domain ولا في Infrastructure ولا في Application. أي بقايا كود من نسخة سابقة تحمل هذا الاسم يجب حذفها بالكامل (راجع قائمة التحقق في `07-safety-guardrails.md`).

استخدم **Minimal APIs** مجمّعة بـ `MapGroup` لكل وحدة.

## 1.3 خطوات التنفيذ

1. أنشئ الحل والمشاريع الأربعة بالإحالات الصحيحة فقط.
2. أضف الحزم الأساسية:
   - `MediatR`, `FluentValidation` + `FluentValidation.DependencyInjectionExtensions`
   - `Microsoft.EntityFrameworkCore` + `Npgsql.EntityFrameworkCore.PostgreSQL`
   - `Microsoft.AspNetCore.Identity.EntityFrameworkCore`
   - `Microsoft.AspNetCore.Authentication.JwtBearer`
   - `Microsoft.AspNetCore.Authentication.Google` (تسجيل الدخول بجوجل — راجع `04-infrastructure-layer.md` §4.10)
   - `Microsoft.AspNetCore.SignalR` + `Microsoft.AspNetCore.SignalR.StackExchangeRedis`
   - `Serilog.AspNetCore` + `Serilog.Sinks.Console`
   - `Swashbuckle.AspNetCore`
   - `AspNetCoreRateLimit`
   - `Microsoft.FeatureManagement.AspNetCore` (لتفعيل ميزات مثل واتساب تدريجياً)
   - `AspNetCore.HealthChecks.NpgSql` + `AspNetCore.HealthChecks.Redis`
   - `StackExchange.Redis`
   - `Azure.Security.KeyVault.Secrets` (لإدارة مفتاح التشفير ومفاتيح JWT في الإنتاج)
3. فعّل `Nullable` و`ImplicitUsings`، وفعّل `TreatWarningsAsErrors` في Domain وApplication.
4. أضف حزمة تحليل ثابت (`Microsoft.CodeAnalysis.NetAnalyzers`).
5. اضبط `Directory.Build.props` مشترك.

## 1.4 قرار: لا Microservices الآن

بلا تغيير عن القرار الأصلي — Modular Monolith، مع Redis وOutbox وطابور رسائل كنقاط نمو أولى عند إثبات الحاجة فعلياً (راجع `11-security-hardening-and-scalability.md`).

## 1.5 سجل قرارات المعمارية (ADR) — إلزامي لكل قرار غير محسوم

أنشئ `docs/adr/0001-<slug>.md` بقالب ثابت:

```markdown
# ADR-0001: <عنوان القرار>
التاريخ: <YYYY-MM-DD>
الحالة: مقترَح | مقبول | متجاوَز

## السياق
<الغموض، ولماذا يحتاج قراراً الآن>

## القرار
<الافتراض الأكثر تحفظاً من ناحية الخصوصية والسلامة>

## الأثر
<ما يتغيّر في الكود، وما يبقى قابلاً للتعديل لاحقاً>
```

اكتب ADR صريحاً لقرار "لا حقن مباشر في قاعدة البيانات لأي حساب إداري، حتى الأول" (راجع `06-core-modules-workflows.md` §6.4) — هذا بالضبط النوع من القرارات التي يجب توثيقها هنا لا شفهياً فقط.
