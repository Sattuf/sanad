# المرحلة 2 — طبقة Domain

هذه الطبقة تصف **قواعد العمل والكيانات فقط**. ممنوع أي مرجع إلى EF Core أو ASP.NET أو أي مكتبة بنية تحتية هنا.

## 2.1 عناصر أساسية مشتركة

```csharp
public abstract class BaseEntity
{
    public Guid Id { get; protected set; } = Guid.NewGuid();
    public DateTimeOffset CreatedAtUtc { get; protected set; }
    public DateTimeOffset? UpdatedAtUtc { get; protected set; }
    private readonly List<IDomainEvent> _domainEvents = new();
    public IReadOnlyCollection<IDomainEvent> DomainEvents => _domainEvents.AsReadOnly();
    protected void Raise(IDomainEvent e) => _domainEvents.Add(e);
}

public interface IDomainEvent { }
public interface IAggregateRoot { }

public interface IFieldEncryptor
{
    string Encrypt(string plainText);
    string Decrypt(string cipherText);
}
```

## 2.2 وحدة الهوية (Identity)

```csharp
public enum SanadRole
{
    Beneficiary, OrganizationRepresentative, Practitioner,
    Coordinator, ContentManager, PrivacySecurityOfficer, ClinicalSupervisor, SystemAdmin
}

// v3 — جديد: تصنيف مهني، مستقل تماماً عن SanadRole وعن OrganizationTrack.
// يُختار من مقدّم الطلب نفسه عند طلب الترقية (RequestProviderUpgradeCommand)، ويتحقق منه Coordinator
// بمطابقة نوع المستند المرفوع (شهادة طبية مقابل إجازة/تزكية شرعية) قبل أي اعتماد.
public enum PractitionerType { ReligiousPractitioner, LicensedPhysician }
```

## 2.3 وحدة الدليل (Directory)

```csharp
public class Organization : BaseEntity, IAggregateRoot
{
    public string LegalName { get; private set; }
    public string? TradeName { get; private set; }
    public OrganizationTrack Track { get; private set; }
    public string? RegistrationNumber { get; private set; }
    public string? IssuingAuthorityName { get; private set; }
    public string? VerificationSourceUrl { get; private set; }
    public PublicationStatus Status { get; private set; } = PublicationStatus.Draft;

    public void Publish(VerificationRecord approvedVerification)
    {
        if (approvedVerification.Status != VerificationStatus.Approved &&
            approvedVerification.Status != VerificationStatus.ConditionallyApproved)
            throw new DomainException("لا يمكن نشر جهة بلا توثيق معتمد أو مشروط.");
        Status = PublicationStatus.Published;
        Raise(new OrganizationPublishedEvent(Id));
    }

    public void Suspend(string reason)
    {
        Status = PublicationStatus.Suspended;
        Raise(new OrganizationSuspendedEvent(Id, reason));
    }
}

public enum OrganizationTrack { WaqfFree, DawahGuidance, LicensedHealth, IndependentConsultant }
public enum PublicationStatus { Draft, ConditionallyApproved, Published, Suspended, Rejected }

public class ProviderProfile : BaseEntity, IAggregateRoot
{
    public Guid UserId { get; private set; }
    public Guid? OrganizationId { get; private set; }
    public PractitionerType Type { get; private set; }      // v3 — طبيب أو شيخ/راقٍ
    public string DeclaredTitle { get; private set; }         // مثال: "أخصائي نفسي مرخّص"، "راقٍ شرعي مجاز"
    public string PracticeScope { get; private set; }
    public IReadOnlyList<string> Languages { get; private set; }
    public ServiceDeliveryMode DeliveryMode { get; private set; }
    public PublicationStatus Status { get; private set; } = PublicationStatus.Draft;
    public string ProfessionalBoundariesNote { get; private set; }
    // ترتيب البحث من مطابقة الطلب وStatus فقط — Type لا يمنح أفضلية عرض لأي من النوعين على الآخر (كلاهما مسار شرعي متكافئ، راجع SKILL.md البند 9)
}

public enum ServiceDeliveryMode { InPerson, Remote, Both }

public class ServiceOffering : BaseEntity, IAggregateRoot
{
    public Guid ProviderProfileId { get; private set; }
    public string Category { get; private set; }
    public string Description { get; private set; }
    public string CancellationPolicy { get; private set; }
    public IReadOnlyList<string> ExplicitExclusions { get; private set; }

    public static ServiceOffering Create(Guid providerId, string category, string description, IContentPolicyChecker policyChecker)
    {
        var violation = policyChecker.FindProhibitedClaim(description);
        if (violation is not null) throw new DomainException($"وصف الخدمة يحتوي ادعاءً غير مسموح: {violation}");
        throw new NotImplementedException();
    }
}
```

## 2.4 وحدة التوثيق الإداري (Verification)

```csharp
public class VerificationRecord : BaseEntity, IAggregateRoot
{
    public Guid SubjectId { get; private set; }
    public VerificationSubjectType SubjectType { get; private set; }
    public PractitionerType? DeclaredPractitionerType { get; private set; }  // v3 — يُملأ فقط لطلبات ProviderProfile
    public string DocumentType { get; private set; }
    public string IssuingAuthority { get; private set; }
    public string? VerificationSourceUrl { get; private set; }
    public VerificationStatus Status { get; private set; } = VerificationStatus.PendingReview;
    public DateTimeOffset? LastCheckedAtUtc { get; private set; }
    public DateTimeOffset? ExpiresAtUtc { get; private set; }
    public Guid? ReviewedByCoordinatorId { get; private set; }

    public void Approve(Guid coordinatorId, bool conditional, DateTimeOffset expiresAtUtc)
    {
        Status = conditional ? VerificationStatus.ConditionallyApproved : VerificationStatus.Approved;
        ReviewedByCoordinatorId = coordinatorId;
        LastCheckedAtUtc = DateTimeOffset.UtcNow;
        ExpiresAtUtc = expiresAtUtc;
        Raise(new VerificationDecidedEvent(Id, Status));
    }

    public void ExpireIfPastDue(DateTimeOffset nowUtc)
    {
        if (ExpiresAtUtc.HasValue && nowUtc > ExpiresAtUtc && Status is VerificationStatus.Approved or VerificationStatus.ConditionallyApproved)
        {
            Status = VerificationStatus.Expired;
            Raise(new VerificationExpiredEvent(Id, SubjectId));
        }
    }
}

public enum VerificationSubjectType { Organization, ProviderProfile }
public enum VerificationStatus { PendingReview, ConditionallyApproved, Approved, RequiresCompletion, Rejected, Suspended, Expired }
```

**قاعدة v3 جديدة وغير قابلة للتفاوض:** عند المراجعة، `Coordinator` يتحقق أن نوع المستند المرفوع يطابق `DeclaredPractitionerType` — شهادة طبية رسمية لـ `LicensedPhysician`، إجازة/تزكية من جهة شرعية معروفة لـ `ReligiousPractitioner`. طلب يعلن نفسه `LicensedPhysician` برفع تزكية شرعية فقط (أو العكس) يُرفض إدارياً بسبب `DocumentTypeMismatch`، لا يُعتمد شرطياً "على أمل التصحيح لاحقاً".

## 2.5 وحدة الجدولة والحجز (Scheduling)

```csharp
public class AvailabilitySlot : BaseEntity
{
    public Guid ProviderProfileId { get; private set; }
    public DateTimeOffset StartUtc { get; private set; }
    public DateTimeOffset EndUtc { get; private set; }
    public SlotStatus Status { get; private set; } = SlotStatus.Open;
}
public enum SlotStatus { Open, Held, Booked, Cancelled }

public class BookingRequest : BaseEntity, IAggregateRoot
{
    public Guid BeneficiaryUserId { get; private set; }
    public Guid ServiceOfferingId { get; private set; }
    public Guid AvailabilitySlotId { get; private set; }
    public Guid ProviderProfileIdOfAssignedService { get; private set; }
    public BookingStatus Status { get; private set; } = BookingStatus.Draft;
    public string? AdministrativeReasonForRejection { get; private set; }
    public string? IdempotencyKey { get; private set; }
    public string? BeneficiaryNoteEncrypted { get; private set; }   // "ملاحظتي للمختص" — يكتبه المستفيد

    private static readonly Dictionary<BookingStatus, BookingStatus[]> AllowedTransitions = new()
    {
        [BookingStatus.Draft]               = new[] { BookingStatus.Submitted },
        [BookingStatus.Submitted]           = new[] { BookingStatus.UnderReview },
        [BookingStatus.UnderReview]         = new[] { BookingStatus.Accepted, BookingStatus.AlternativeProposed, BookingStatus.Rejected },
        [BookingStatus.AlternativeProposed] = new[] { BookingStatus.Accepted, BookingStatus.Cancelled },
        [BookingStatus.Accepted]            = new[] { BookingStatus.AdministrativelyCompleted, BookingStatus.Cancelled, BookingStatus.UnderDispute },
        [BookingStatus.AdministrativelyCompleted] = new[] { BookingStatus.UnderDispute },
        [BookingStatus.UnderDispute]        = Array.Empty<BookingStatus>(),
    };

    public void TransitionTo(BookingStatus target)
    {
        if (!AllowedTransitions.TryGetValue(Status, out var allowed) || !allowed.Contains(target))
            throw new DomainException($"انتقال حالة غير مسموح: {Status} → {target}");
        Status = target;
        Raise(new BookingStatusChangedEvent(Id, target));
    }

    public void SetBeneficiaryNote(string? plainNote, IFieldEncryptor encryptor, ISafeReferralEvaluator riskEvaluator)
    {
        if (string.IsNullOrWhiteSpace(plainNote)) { BeneficiaryNoteEncrypted = null; return; }
        BeneficiaryNoteEncrypted = encryptor.Encrypt(plainNote);
        if (riskEvaluator.RequiresImmediateEmergencyReferral(new SafetySignal(plainNote)))
            Raise(new EmergencyReferralTriggeredEvent(BeneficiaryUserId, "BookingRequest.BeneficiaryNote"));
    }
}

public enum BookingStatus { Draft, Submitted, UnderReview, Accepted, AlternativeProposed, Rejected, Cancelled, AdministrativelyCompleted, UnderDispute }
```

## 2.6 ملاحظة المختص الخاصة (CaseNotes) — إشرافية، غير مرئية للمستفيد أبداً

```csharp
public class ProviderCaseNote : BaseEntity, IAggregateRoot
{
    public Guid BookingRequestId { get; private set; }
    public Guid AuthoredByProviderProfileId { get; private set; }
    public string NoteEncrypted { get; private set; }
    public DateTimeOffset RecordedAtUtc { get; private set; }

    public static ProviderCaseNote Create(BookingRequest booking, Guid providerId, string plainText,
        IFieldEncryptor encryptor, IContentPolicyChecker policyChecker)
    {
        if (booking.ProviderProfileIdOfAssignedService != providerId)
            throw new DomainException("لا يمكن كتابة ملاحظة على حجز غير مُسنَد لهذا المختص.");
        var violation = policyChecker.FindProhibitedClaim(plainText);
        if (violation is not null) throw new DomainException($"الملاحظة تحتوي ادعاءً غير مسموح حتى في سياق خاص: {violation}");
        return new ProviderCaseNote { BookingRequestId = booking.Id, AuthoredByProviderProfileId = providerId,
            NoteEncrypted = encryptor.Encrypt(plainText), RecordedAtUtc = DateTimeOffset.UtcNow };
    }
}
```

**هذا الكيان لغرض إشرافي/مهني بحت — لا يظهر للمستفيد أبداً تحت أي ظرف.** إن أراد المختص إيصال توجيه فعلي للمستفيد، الأداة الصحيحة هي §2.7 أدناه، لا هذا الكيان. التمييز بين الاثنين مقصود ومُحكَم بنيوياً (لا Endpoint واحد يخلط بينهما).

## 2.7 توصية المختص للمستفيد (ProviderRecommendation) — جديد في v3، الأداة الوحيدة لتوجيه المستفيد مباشرة

هذا الكيان يمثّل "ملاحظة يكتبها المختص الموثّق ويرسلها للمستفيد" — مثل توجيه بخطوات، أو اقتراح مقاطع استماع من مكتبة الرقية. **هذا الملف لا يحدد أي محتوى فعلي لأي توصية** — فقط البنية التي تتيح لمختص موثّق وحده كتابة نص حر وإرساله؛ محتوى كل توصية قرار مهني للمختص نفسه بالكامل.

```csharp
public class ProviderRecommendation : BaseEntity, IAggregateRoot
{
    public Guid BookingRequestId { get; private set; }
    public Guid AuthoredByProviderProfileId { get; private set; }
    public Guid RecipientBeneficiaryUserId { get; private set; }
    public string GuidanceTextEncrypted { get; private set; }              // النص الحر — يكتبه المختص فقط
    private readonly List<Guid> _recommendedAudioTrackIds = new();          // مقاطع مقترحة من المكتبة المنشورة فقط
    public IReadOnlyCollection<Guid> RecommendedAudioTrackIds => _recommendedAudioTrackIds.AsReadOnly();
    public DateTimeOffset RecordedAtUtc { get; private set; }
    public DateTimeOffset? AcknowledgedByBeneficiaryAtUtc { get; private set; }   // إيصال اطّلاع، اختياري

    public static ProviderRecommendation Create(BookingRequest booking, Guid providerId, string plainGuidanceText,
        IReadOnlyList<AudioTrack> proposedTracks, IFieldEncryptor encryptor, IContentPolicyChecker policyChecker)
    {
        if (booking.ProviderProfileIdOfAssignedService != providerId)
            throw new DomainException("لا يمكن إرسال توصية على حجز غير مُسنَد لهذا المختص.");
        if (booking.Status is not (BookingStatus.Accepted or BookingStatus.AdministrativelyCompleted))
            throw new DomainException("لا تُرسَل توصية قبل قبول الحجز فعلياً.");

        // نفس صرامة فلتر العبارات المحظورة تماماً — بلا استثناء لأن الكاتب موثّق أو لأن النص "خاص بمستفيد واحد فقط"
        var violation = policyChecker.FindProhibitedClaim(plainGuidanceText);
        if (violation is not null) throw new DomainException($"التوصية تحتوي ادعاءً غير مسموح: {violation}");

        if (proposedTracks.Any(t => !t.IsPublished))
            throw new DomainException("لا يمكن اقتراح مقطع غير منشور من المكتبة.");

        var rec = new ProviderRecommendation
        {
            BookingRequestId = booking.Id,
            AuthoredByProviderProfileId = providerId,
            RecipientBeneficiaryUserId = booking.BeneficiaryUserId,
            GuidanceTextEncrypted = encryptor.Encrypt(plainGuidanceText),
            RecordedAtUtc = DateTimeOffset.UtcNow
        };
        rec._recommendedAudioTrackIds.AddRange(proposedTracks.Select(t => t.Id));
        rec.Raise(new ProviderRecommendationSentEvent(rec.Id, booking.BeneficiaryUserId));
        return rec;
    }

    public void MarkAcknowledged() => AcknowledgedByBeneficiaryAtUtc ??= DateTimeOffset.UtcNow;
}
```

**قواعد إلزامية غير قابلة للتفاوض:**
1. **لا يُنشئها إلا المختص المُسنَد للحجز تحديداً** (نفس تحقق الملكية في §2.6)، وبعد قبول الحجز فعلياً — لا توصية على حجز لم يُقبل بعد.
2. **النص الحر يمر على `IContentPolicyChecker` بنفس صرامة وصف الخدمة العام، بلا أي استثناء لكون الكاتب طبيباً مرخّصاً أو راقياً مجازاً.** هذا يعني تحديداً أن فلتر "جرعة/وصفة دوائية" (راجع `07-safety-guardrails.md` §7.2) يمنع أي توصية دوائية محدَّدة داخل هذا الحقل — سند نظام توجيه إداري ومحتوى محايد، لا نظام وصفات طبية إلكترونية؛ أي وصفة دوائية فعلية تبقى مسؤولية القناة الطبية الرسمية للمختص خارج المنصة، لا داخل حقل نص حر في تطبيق دليل. هذا قيد تصميمي مقصود يحمي المنصة والمختص والمستفيد معاً.
3. **المقاطع المقترحة (`RecommendedAudioTrackIds`) يجب أن تكون منشورة فعلاً (`IsPublished == true`)** — لا اقتراح مقطع لم يراجعه `ContentManager` بعد.
4. **`AcknowledgedByBeneficiaryAtUtc` مجرد إيصال اطّلاع، لا موافقة أو إقرار قانوني** — لا تُبنى عليه أي قاعدة عمل أخرى.
5. **لا حقل تصنيف مُقفَل هنا أيضاً** — نفس مبدأ §2.6 وSKILL.md البند 2: لا تصنيف تلقائي أو ظاهر لحالة المستفيد، حتى في توصية موجَّهة له مباشرة.
6. **تُشفَّر فوراً بنفس آلية `IFieldEncryptor`** المستخدمة في §2.5 و§2.6 — لا استثناء لكونها "موجَّهة للمستفيد نفسه"؛ لا تزال بيانات صحية/دينية حساسة يجب ألا تظهر كنص صريح في قاعدة البيانات أو السجلات.

## 2.8 وحدة المحادثة (Messaging) — بلا تغيير

```csharp
public class Conversation : BaseEntity, IAggregateRoot
{
    public ConversationStatus Status { get; private set; } = ConversationStatus.Active;
    public DateTimeOffset? LastMessageAtUtc { get; private set; }
    private readonly List<Guid> _memberUserIds = new();

    public Message PostMessage(Guid senderId, string body)
    {
        if (!_memberUserIds.Contains(senderId)) throw new DomainException("المرسل ليس عضواً في هذه المحادثة.");
        if (Status != ConversationStatus.Active) throw new DomainException("لا يمكن الإرسال في محادثة غير نشطة.");
        var message = new Message(Id, senderId, body);
        LastMessageAtUtc = DateTimeOffset.UtcNow;
        Raise(new MessagePostedEvent(Id, message.Id));
        return message;
    }
}
public enum ConversationStatus { Active, Restricted, Suspended, Closed }

public class Message : BaseEntity
{
    public Guid ConversationId { get; }
    public Guid SenderUserId { get; }
    public string Body { get; }
    public MessageStatus Status { get; private set; } = MessageStatus.Sent;
}
public enum MessageStatus { Sent, Delivered, Read, Reported }
```

## 2.9 وحدة السلامة والتصعيد (Safety) — بلا تغيير

```csharp
public class Report : BaseEntity, IAggregateRoot
{
    public Guid ReporterUserId { get; private set; }
    public Guid TargetSubjectId { get; private set; }
    public ReportCategory Category { get; private set; }
    public ReportSeverity Severity { get; private set; }
    public ReportStatus Status { get; private set; } = ReportStatus.Open;
}
public enum ReportCategory { Impersonation, FinancialExploitation, Harassment, UnauthorizedClaim, PrivacyViolation, Other }
public enum ReportSeverity { Low, Medium, High, Critical }
public enum ReportStatus { Open, UnderInvestigation, Resolved, Escalated }

public class EscalationCase : BaseEntity, IAggregateRoot
{
    public Guid SubjectAccountId { get; private set; }
    public EscalationLevel Level { get; private set; } = EscalationLevel.Warning;
    public int DocumentedReportsCount { get; private set; }

    public void Recompute(int documentedReportsInWindow, bool hasSevereSingleViolation, bool possibleCrimeOrMinorRisk)
    {
        DocumentedReportsCount = documentedReportsInWindow;
        Level = possibleCrimeOrMinorRisk ? EscalationLevel.RegulatoryReferral
              : hasSevereSingleViolation || documentedReportsInWindow >= 3 ? EscalationLevel.Suspension
              : documentedReportsInWindow >= 2 ? EscalationLevel.Restriction
              : EscalationLevel.Warning;
        Raise(new EscalationLevelChangedEvent(SubjectAccountId, Level));
    }
}
public enum EscalationLevel { Warning, Restriction, Suspension, RegulatoryReferral }
```

## 2.10 مكتبة الرقية (RuqyahLibrary) — بلا تغيير + نمو عضوي غير مالي (v3)

```csharp
public class AudioTrack : BaseEntity, IAggregateRoot
{
    public string Title { get; private set; }
    public string SourceLabel { get; private set; }
    public AudioTrackCategory Category { get; private set; }
    public string AudioUrl { get; private set; }
    public int DurationSeconds { get; private set; }
    public bool IsPublished { get; private set; } = false;

    public void Publish() => IsPublished = true;
    public void Unpublish() => IsPublished = false;
}
public enum AudioTrackCategory { QuranRecitation, Dua, Adhkar }

public class UserFavoriteTrack : BaseEntity
{
    public Guid UserId { get; private set; }
    public Guid AudioTrackId { get; private set; }
    public DateTimeOffset AddedAtUtc { get; private set; }
}

// v3 — نمو عضوي بلا أي مقابل مالي: رابط مشاركة عام للاستماع لمقطع منشور، بلا حاجة لحساب.
// راجع 12-ethics-and-future-roadmap.md §12.4 للمبرر الكامل — هذا محتوى ديني عام أصلاً (تلاوات وأدعية معروفة)، مشاركته لا تكشف أي بيانات مستخدم.
public class SharedContentLink : BaseEntity, IAggregateRoot
{
    public Guid AudioTrackId { get; private set; }
    public string ShortCode { get; private set; }     // مُولَّد عشوائياً، لا معنى متسلسلاً يكشف عدد الروابط
    public int ViewCount { get; private set; }
    public Guid? CreatedByUserId { get; private set; } // اختياري — لمن أنشأ الرابط، لا يظهر لزائر الرابط نفسه

    public static SharedContentLink Create(AudioTrack track, Guid? createdByUserId)
    {
        if (!track.IsPublished) throw new DomainException("لا يمكن إنشاء رابط مشاركة لمقطع غير منشور.");
        return new SharedContentLink { AudioTrackId = track.Id, ShortCode = Guid.NewGuid().ToString("N")[..8], CreatedByUserId = createdByUserId };
    }

    public void RegisterView() => ViewCount++;
}
```

## 2.11 وحدة الموافقات (Consent) — بلا تغيير

```csharp
public class ConsentRecord : BaseEntity
{
    public Guid UserId { get; private set; }
    public ConsentType Type { get; private set; }
    public string PolicyVersion { get; private set; }
    public DateTimeOffset AcceptedAtUtc { get; private set; }
    public string? RevokedAtUtcJson { get; private set; }
}
public enum ConsentType { TermsOfService, PrivacyPolicy, SensitiveDataProcessing, MarketingCommunication }
```

## 2.12 وحدة التدقيق (Audit) — بلا تغيير

```csharp
public class AuditLogEntry : BaseEntity
{
    public Guid? ActorUserId { get; private set; }
    public string Action { get; private set; }
    public string EntityType { get; private set; }
    public Guid EntityId { get; private set; }
    public string? MetadataJson { get; private set; }   // بيانات وصفية فقط — ممنوع أي نص خام من §2.5/§2.6/§2.7
}
```

## 2.13 Domain Exceptions

```csharp
public class DomainException : Exception { public DomainException(string message) : base(message) { } }
```
