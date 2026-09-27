# المرحلة 3 — طبقة Application (حالات الاستخدام)

## 3.1 الواجهات المشتركة (Common/Interfaces)

```csharp
public interface IApplicationDbContext
{
    DbSet<Organization> Organizations { get; }
    DbSet<ProviderProfile> ProviderProfiles { get; }
    DbSet<VerificationRecord> VerificationRecords { get; }
    DbSet<BookingRequest> BookingRequests { get; }
    DbSet<ProviderCaseNote> ProviderCaseNotes { get; }
    DbSet<ProviderRecommendation> ProviderRecommendations { get; }   // v3
    DbSet<AudioTrack> AudioTracks { get; }
    DbSet<UserFavoriteTrack> UserFavoriteTracks { get; }
    DbSet<SharedContentLink> SharedContentLinks { get; }              // v3
    DbSet<ConsentRecord> ConsentRecords { get; }
    Task<int> SaveChangesAsync(CancellationToken ct);
}

public interface ICurrentUser { Guid? UserId { get; } IReadOnlyList<string> Roles { get; } bool IsInRole(string role); }
public interface IDateTime { DateTimeOffset UtcNow { get; } }
public interface IFileStorage
{
    Task<string> GenerateUploadUrlAsync(string objectKey, string contentType, CancellationToken ct);
    Task<string> GenerateShortLivedDownloadUrlAsync(string objectKey, TimeSpan ttl, CancellationToken ct);
}
public interface INotificationDispatcher { Task DispatchAsync(NotificationMessage message, CancellationToken ct); }
public interface IContentPolicyChecker { string? FindProhibitedClaim(string text); }
public interface ISafeReferralEvaluator { bool RequiresImmediateEmergencyReferral(SafetySignal signal); }
public interface ICaptchaVerifier { Task<bool> VerifyAsync(string token, CancellationToken ct); }
public interface IDirectorySearchCache
{
    Task<T?> GetAsync<T>(string key, CancellationToken ct);
    Task SetAsync<T>(string key, T value, TimeSpan ttl, CancellationToken ct);
    Task InvalidateAsync(string keyPrefix, CancellationToken ct);
}

public interface IIdentityService
{
    Task<AuthResult> RegisterWithEmailAsync(string email, string password, CancellationToken ct);
    Task<AuthResult> LoginWithEmailAsync(string email, string password, CancellationToken ct);
    Task<string> GetGoogleChallengeUrlAsync(string returnUrl, CancellationToken ct);
    Task<AuthResult> CompleteGoogleLoginAsync(string externalProviderKey, string verifiedEmail, CancellationToken ct);
    Task RequestPhoneOtpAsync(string phoneNumberE164, CancellationToken ct);
    Task<AuthResult> VerifyPhoneOtpAsync(string phoneNumberE164, string code, CancellationToken ct);
    Task AssignRoleAsync(Guid userId, SanadRole role, Guid assignedByUserId, CancellationToken ct);
}
public record AuthResult(Guid UserId, string AccessToken, string RefreshToken, bool IsNewUser);
```

## 3.2 تنظيم الوحدات (Modules)

```
Modules/PatientCare/                          # v3 — يجمع الوحدتين المرتبطتين بمحتوى موجَّه لحجز بعينه
├── Commands/
│   ├── RecordProviderCaseNote/               # إشرافي خاص — §2.6
│   └── SendProviderRecommendation/           # موجَّه للمستفيد — §2.7
└── Queries/
    ├── GetCaseNoteForBooking/                 # كاتبها أو Coordinator/ClinicalSupervisor فقط
    ├── GetMyRecommendations/                   # المستفيد نفسه فقط
    └── GetBookingNote/                          # "ملاحظتي للمختص" — صاحب الحجز أو المختص المُسنَد

Modules/RuqyahLibrary/
├── Commands/
│   ├── PublishTrack/ | UnpublishTrack/        # ContentManager فقط
│   ├── AddFavoriteTrack/ | RemoveFavoriteTrack/
│   └── CreateSharedLink/                       # v3 — أي مستخدم مصادَق، لمقطع منشور فقط
└── Queries/
    ├── GetLibrary/
    ├── GetMyFavorites/
    └── ResolveSharedLink/                       # عام بالكامل، بلا مصادقة — لعرض صفحة المشاركة
```

### مثال — إرسال توصية للمستفيد (v3)

```csharp
public record SendProviderRecommendationCommand(
    Guid BookingRequestId, string GuidanceText, IReadOnlyList<Guid> RecommendedAudioTrackIds
) : IRequest<Unit>;

public class SendProviderRecommendationCommandHandler : IRequestHandler<SendProviderRecommendationCommand, Unit>
{
    // AuthorizationBehavior تحقق مسبقاً من Policies.ActOnOwnServiceOffering
    public async Task<Unit> Handle(SendProviderRecommendationCommand cmd, CancellationToken ct)
    {
        var booking = await _db.BookingRequests.FindAsync(new object[] { cmd.BookingRequestId }, ct)
            ?? throw new NotFoundException(nameof(BookingRequest), cmd.BookingRequestId);
        var tracks = await _db.AudioTracks.Where(t => cmd.RecommendedAudioTrackIds.Contains(t.Id)).ToListAsync(ct);

        var recommendation = ProviderRecommendation.Create(
            booking, _currentUser.UserId!.Value, cmd.GuidanceText, tracks, _encryptor, _policyChecker);

        _db.ProviderRecommendations.Add(recommendation);
        await _db.SaveChangesAsync(ct);
        // OutboxMessage يُكتب تلقائياً من ProviderRecommendationSentEvent → إشعار للمستفيد (بلا نص التوصية، فقط "لديك توصية جديدة")
        return Unit.Value;
    }
}
```

### مثال — طلب الترقية بنوع مُختار (v3)

```csharp
public record RequestProviderUpgradeCommand(
    PractitionerType RequestedType,           // v3 — المستخدم يختار: طبيب أم شيخ/راقٍ
    string DeclaredTitle,
    string DocumentType,
    string IssuingAuthority,
    Guid UploadedDocumentFileId
) : IRequest<VerificationSummaryDto>;

public class RequestProviderUpgradeCommandValidator : AbstractValidator<RequestProviderUpgradeCommand>
{
    public RequestProviderUpgradeCommandValidator()
    {
        RuleFor(x => x.RequestedType).IsInEnum();
        RuleFor(x => x.DeclaredTitle).NotEmpty().MaximumLength(200);
        RuleFor(x => x.DocumentType).NotEmpty();
        // تحقق تكميلي في الـ Handler: نوع المستند يجب أن يطابق قائمة مسموحة لكل RequestedType
        // (مثال: RequestedType = LicensedPhysician يتطلب DocumentType من فئة "شهادة طبية رسمية" لا "تزكية شرعية")
    }
}
```

## 3.3 Pipeline Behaviors (بالترتيب) — بلا تغيير جوهري

`UnhandledExceptionBehavior` → `ValidationBehavior` → `AuthorizationBehavior` (يتحقق الآن أيضاً من ملكية `ProviderRecommendation` وقراءة `GetMyRecommendations` لصاحبها فقط) → `IdempotencyBehavior` → `AuditLoggingBehavior` (لا يكتب أبداً `GuidanceText` الخام) → `SafetySignalBehavior`.

## 3.4 DTOs والتعيين (Mapping)

```csharp
public record BookingSummaryDto(Guid Id, string Status, DateTimeOffset SlotStartUtc, string ProviderDisplayName)
{
    public static BookingSummaryDto FromEntity(BookingRequest b) => new(b.Id, b.Status.ToString(), b.Slot.StartUtc, b.Provider.DisplayName);
    // لا BeneficiaryNote ولا أي إشارة لوجود توصية هنا — تُقرأ فقط عبر Query محمي منفصل
}

public record RecommendationDto(Guid Id, string GuidanceText, IReadOnlyList<AudioTrackSummaryDto> RecommendedTracks, DateTimeOffset RecordedAtUtc)
{
    // GuidanceText هنا هو النص بعد فك التشفير — يُبنى فقط داخل GetMyRecommendationsQueryHandler
    // بعد اجتياز Policy، لا في أي مسار تعيين عام آخر
}
```

## 3.5 قائمة الوحدات ومسؤوليات كل منها (v3، ملخّص تنفيذي)

| الوحدة | Commands رئيسية | Queries رئيسية |
|---|---|---|
| Accounts | RegisterWithEmail, LoginWithEmail, RequestPhoneOtp, VerifyPhoneOtp, CompleteGoogleLogin, **RequestProviderUpgrade (مع PractitionerType)**, AssignRole, RequestDataExport, RequestAccountDeletion | GetMyProfile |
| Consent | RecordConsent, RevokeMarketingConsent | GetMyConsentStatus |
| Directory | CreateServiceOffering | SearchDirectory, GetOrganizationById, GetProviderById, CompareProviders |
| Verification | ReviewVerification (يتحقق تطابق نوع المستند مع PractitionerType)، RecheckVerification, SuspendProfile | GetVerificationQueue, GetVerificationHistory |
| Scheduling | CreateAvailabilitySlot, CreateBookingRequest (BeneficiaryNote)، AcceptBooking, ProposeAlternativeTime, CancelBooking | GetProviderAvailability, GetBookingStatus, GetMyBookings, GetBookingNote |
| Messaging | OpenConversation, PostMessage, ReportConversation | GetConversationMessages |
| **PatientCare (v3)** | **RecordProviderCaseNote (خاص)**، **SendProviderRecommendation (للمستفيد)** | **GetCaseNoteForBooking، GetMyRecommendations** |
| RuqyahLibrary | PublishTrack, UnpublishTrack, AddFavoriteTrack, RemoveFavoriteTrack, **CreateSharedLink** | GetLibrary, GetMyFavorites, **ResolveSharedLink (عام)** |
| Safety | SubmitReport, ReviewReport, RecomputeEscalation | GetReportsQueue, GetEmergencyReferralInfo |

لا توجد وحدة `Payments` في هذا الجدول إطلاقاً.
