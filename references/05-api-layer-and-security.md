# المرحلة 5 — طبقة API والأمان

## 5.1 Minimal API مجمّعة حسب الوحدة

```csharp
public static class PatientCareEndpoints
{
    public static IEndpointRouteBuilder MapPatientCareEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1").WithTags("PatientCare").RequireAuthorization();

        group.MapPost("/bookings/{id:guid}/provider-note", async (Guid id, RecordProviderCaseNoteCommand cmd, ISender sender) =>
            Results.Ok(await sender.Send(cmd with { BookingRequestId = id })))
            .RequireAuthorization(Policies.ActOnOwnServiceOffering);

        group.MapGet("/bookings/{id:guid}/provider-note", async (Guid id, ISender sender) =>
            Results.Ok(await sender.Send(new GetCaseNoteForBookingQuery(id))))
            .RequireAuthorization(Policies.ReadCaseNoteWithSupervisionOnly);

        group.MapPost("/bookings/{id:guid}/recommendations", async (Guid id, SendProviderRecommendationCommand cmd, ISender sender) =>
            Results.Ok(await sender.Send(cmd with { BookingRequestId = id })))
            .RequireAuthorization(Policies.ActOnOwnServiceOffering);

        group.MapGet("/me/recommendations", async (ISender sender) =>
            Results.Ok(await sender.Send(new GetMyRecommendationsQuery())));

        return app;
    }
}
```

سجّل كل مجموعة في `Program.cs`:

```csharp
app.MapGroup("").MapAuthEndpoints();
app.MapGroup("").MapAccountsEndpoints();
app.MapGroup("").MapConsentEndpoints();
app.MapGroup("").MapDirectoryEndpoints();
app.MapGroup("").MapVerificationEndpoints();
app.MapGroup("").MapSchedulingEndpoints();
app.MapGroup("").MapMessagingEndpoints();
app.MapGroup("").MapPatientCareEndpoints();      // v3 — يستبدل MapCaseNotesEndpoints
app.MapGroup("").MapRuqyahLibraryEndpoints();
app.MapGroup("").MapSafetyEndpoints();
app.MapGroup("").MapAdminUsersEndpoints();
app.MapHub<ChatHub>("/hubs/chat");
app.MapHealthChecks("/health/live");
app.MapHealthChecks("/health/ready");
```

## 5.2 جدول Endpoints الكامل (v3)

### المصادقة والتسجيل

| Method | Path | Policy |
|---|---|---|
| POST | `/api/v1/auth/register/email` | عام، خلف CAPTCHA |
| POST | `/api/v1/auth/login/email` | عام |
| GET | `/api/v1/auth/google/challenge` \| `/callback` | عام |
| POST | `/api/v1/auth/phone/request-otp` \| `/verify-otp` | عام، خلف CAPTCHA + حد معدل صارم |
| POST | `/api/v1/auth/refresh` \| `/revoke` | مستخدم مصادَق |

### الحساب والترقية

| Method | Path | Policy |
|---|---|---|
| GET/PATCH | `/api/v1/me` | صاحب الحساب |
| POST | `/api/v1/me/export` \| `DELETE /api/v1/me` | صاحب الحساب |
| GET/POST | `/api/v1/me/consent` | صاحب الحساب |
| POST | `/api/v1/me/provider-upgrade-request` | Beneficiary، خلف CAPTCHA — يحمل `RequestedType` (طبيب/شيخ راقٍ)، راجع `03-application-layer.md` §3.2 |
| POST | `/api/v1/admin/users/{id}/roles` | `SystemAdmin` فقط |

### الدليل والاعتماد

| Method | Path | Policy |
|---|---|---|
| GET | `/api/v1/directory` | عام (منشور فقط، Cache عبر Redis) |
| GET | `/api/v1/organizations/{id}` \| `/api/v1/providers/{id}` | عام (Published فقط) — يعرض `PractitionerType` كحقل واضح (طبيب/شيخ راقٍ) |
| POST | `/api/v1/admin/verifications/{id}/review` \| `/recheck` | `Coordinator` — يتحقق تطابق نوع المستند مع `RequestedType` قبل أي اعتماد |
| POST | `/api/v1/admin/profiles/{id}/suspend` | `Coordinator` |
| GET/POST | `/api/v1/admin/reports` \| `/api/v1/reports` | `Coordinator` / مستخدم مصادَق، خلف CAPTCHA |

### الحجز، الملاحظات، والتوصيات (v3)

| Method | Path | Policy |
|---|---|---|
| GET | `/api/v1/providers/{id}/availability` | مستخدم مصادَق |
| POST | `/api/v1/bookings` | مستخدم مصادَق، `Idempotency-Key` إلزامي، `BeneficiaryNote` اختياري |
| POST | `/api/v1/bookings/{id}/accept` \| `/propose-alternative` \| `/cancel` | حسب الفعل |
| GET | `/api/v1/bookings/{id}/note` | صاحب الحجز، أو المختص المُسنَد، أو Coordinator عند تصعيد مرتبط |
| POST/GET | `/api/v1/bookings/{id}/provider-note` | **إشرافي خاص** — POST: المختص المُسنَد فقط. GET: نفسه، أو Coordinator/ClinicalSupervisor بصلاحية إشراف |
| POST | `/api/v1/bookings/{id}/recommendations` | **موجَّه للمستفيد** — المختص المُسنَد فقط، `Policies.ActOnOwnServiceOffering` |
| GET | `/api/v1/me/recommendations` | صاحب الحساب (المستفيد) فقط |

**تمييز حاسم:** `/provider-note` (خاص، إشرافي) و`/recommendations` (يصل فعلياً للمستفيد) مساران منفصلان تماماً بـ Policies مختلفة — لا خلط بينهما أبداً في أي إصدار مستقبلي.

### مكتبة الرقية والمشاركة (v3)

| Method | Path | Policy |
|---|---|---|
| GET | `/api/v1/library` | مستخدم مصادَق، فلترة `category` — منشور فقط |
| GET/POST/DELETE | `/api/v1/me/favorites` | صاحب الحساب فقط |
| POST | `/api/v1/admin/library/tracks` \| `/{id}/publish` \| `/{id}/unpublish` | `ContentManager` |
| POST | `/api/v1/library/tracks/{id}/share-link` | مستخدم مصادَق — ينشئ `SharedContentLink` لمقطع منشور فقط |
| GET | `/api/v1/public/shared/{shortCode}` | **عام بالكامل، بلا مصادقة** — صفحة استماع مشاركة، تُسجّل `ViewCount` فقط |

### المحادثة

بلا تغيير — SignalR Hub على `/hubs/chat`.

**لا يوجد أي مسار `/payments/*` أو `/provider/subscription*` في v3.**

## 5.3 RBAC + Policy-Based Authorization (v3)

```csharp
public static class Policies
{
    public const string ReviewVerification = nameof(ReviewVerification);
    public const string ActOnOwnServiceOffering = nameof(ActOnOwnServiceOffering);
    public const string ReadAssignedConversationOnly = nameof(ReadAssignedConversationOnly);
    public const string ManageOwnAccountOnly = nameof(ManageOwnAccountOnly);
    public const string ReadOwnBeneficiaryNoteOnly = nameof(ReadOwnBeneficiaryNoteOnly);
    public const string ReadCaseNoteWithSupervisionOnly = nameof(ReadCaseNoteWithSupervisionOnly); // v3
    public const string ManageContentLibrary = nameof(ManageContentLibrary);
    public const string AssignSystemRoles = nameof(AssignSystemRoles);
}

services.AddAuthorization(options =>
{
    options.AddPolicy(Policies.ReviewVerification, p => p.RequireRole(nameof(SanadRole.Coordinator)));

    options.AddPolicy(Policies.ActOnOwnServiceOffering, p =>
        p.RequireAssertion(ctx => /* المستخدم = صاحب ProviderProfile المرتبط بالحجز/الخدمة المطلوبة */ true));

    // v3 — Policy منفصلة صراحة لملاحظة المختص الخاصة، لا تُدمَج مع أي Policy عامة أخرى
    options.AddPolicy(Policies.ReadCaseNoteWithSupervisionOnly, p =>
        p.RequireAssertion(ctx => /* كاتب الملاحظة نفسه، أو Coordinator/ClinicalSupervisor بصلاحية إشراف موثّقة صراحة */ true));

    options.AddPolicy(Policies.ManageContentLibrary, p => p.RequireRole(nameof(SanadRole.ContentManager)));
    options.AddPolicy(Policies.AssignSystemRoles, p => p.RequireRole(nameof(SanadRole.SystemAdmin)));
});
```

### مصفوفة الأدوار → الوحدات (v3)

| الدور | يملك صلاحية كتابة على | ممنوع عنه |
|---|---|---|
| Beneficiary | حسابه، طلباته، ملاحظته الخاصة عند الحجز، مفضلته، **اطّلاع على توصيات مُرسَلة له** | أي بيانات مستخدم آخر، **ملاحظة المختص الخاصة (§2.6) — لا يراها أبداً** |
| Practitioner (طبيب أو شيخ/راقٍ) | ملفه، مواعيده، **ملاحظته الخاصة**، **إرسال توصيات للمستفيدين المُسنَدين له** | أي حجز غير مُسنَد له، تصنيف حالة المستفيد (لا يوجد حقل أصلاً) |
| Coordinator | التوثيق (بما فيه تطابق نوع المستند)، البلاغات، التصعيد، التعليق، قراءة ملاحظة/توصية عند تصعيد موثّق فقط | إصدار حكم طبي/ديني، منح الأدوار |
| ContentManager | مكتبة الرقية | أي بيانات مستخدم حساسة |
| ClinicalSupervisor | الاطلاع الإشرافي على ملاحظات المختصين الخاصة عند الحاجة | منح ترخيص |
| SystemAdmin | الأدوار (عبر `AssignRoleCommand` فقط) | أقل امتياز خارج هذا النطاق |

## 5.4 JWT — بلا تغيير

## 5.5 Middleware — بلا تغيير جوهري

`UseExceptionHandler` → HTTPS/HSTS → `SecurityHeadersMiddleware` → `UseRateLimiter` (صارم على `/auth/phone/request-otp`) → Correlation-Id → `IdempotencyKeyMiddleware` → `UseAuthentication`/`UseAuthorization` → `EmergencySignalShortCircuit`.

## 5.6 CAPTCHA — بلا تغيير

## 5.7 OpenAPI — بلا تغيير
