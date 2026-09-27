# المرحلة 6 — تدفقات الوحدات الجوهرية

## 6.1 التسجيل ثم طلب الترقية (v3 — المستخدم يختار نوعه عند الترقية)

```
① التسجيل الأساسي — بلا أي مستند، ثلاث طرق متكافئة (بريد / جوجل / هاتف OTP)
        ↓
   ApplicationUser جديد، دور Beneficiary تلقائياً وفوراً
        ↓ (لاحقاً، عند رغبة المستخدم أن يصبح مقدّم خدمة)

② طلب الترقية — المستخدم يختار نوعه صراحة الآن
   POST /api/v1/me/provider-upgrade-request { RequestedType: LicensedPhysician | ReligiousPractitioner, ... }
        ↓  RequestProviderUpgradeCommand
   VerificationRecord.PendingReview  (DeclaredPractitionerType = RequestedType)
        ↓  POST /admin/verifications/{id}/review     (Coordinator فقط)
        ├─ يتحقق: هل نوع المستند المرفوع يطابق RequestedType؟
        │     ├─ لا → Reject(reasonCode: DocumentTypeMismatch)  — رفض فوري، لا اعتماد شرطي "على أمل التصحيح"
        │     └─ نعم → Approve(conditional?, expiresAtUtc)
        │              → IIdentityService.AssignRoleAsync(userId, SanadRole.Practitioner, coordinatorId)
        │              → إنشاء ProviderProfile { Type = RequestedType, ... }
        └─ RequireCompletion → طلب مستندات إضافية، الحساب يبقى Beneficiary حتى الاعتماد
```

**لماذا الاختيار الصريح مهم:** يمنع التباس لاحق بين "طبيب" و"شيخ/راقٍ" في نفس مسار المراجعة — لكل نوع مستندات توثيق مختلفة تماماً (شهادة طبية رسمية مقابل إجازة/تزكية شرعية)، ومراجعة مختلطة تزيد احتمال قبول مستند لا يطابق الادعاء المهني الفعلي.

## 6.2 دورة الاعتماد (Verification) — بلا تغيير جوهري

## 6.3 دورة الحجز مع ملاحظة المستفيد — بلا تغيير عن v2

راجع النسخة السابقة: `SetBeneficiaryNote` يشفّر فوراً، يفحص مؤشر الخطر، لا يمنع الحفظ أبداً.

## 6.4 ملاحظة المختص الخاصة (إشرافية) — بلا تغيير عن v2

`POST /bookings/{id}/provider-note` — لا تظهر للمستفيد أبداً. راجع `02-domain-model.md` §2.6.

## 6.5 توصية المختص للمستفيد (v3 — جديد بالكامل)

هذا التدفّق هو الأداة الفعلية التي يستخدمها الطبيب أو الشيخ/الراقي لتوجيه المستفيد مباشرة — بخطوات، أو باقتراح مقاطع استماع من مكتبة الرقية، أو كليهما معاً.

```
BookingRequest.Status = Accepted (أو AdministrativelyCompleted بعد انتهاء الموعد)
        ↓
POST /bookings/{id}/recommendations { GuidanceText, RecommendedAudioTrackIds[] }   (المختص المُسنَد فقط)
        ↓  SendProviderRecommendationCommandHandler
ProviderRecommendation.Create(booking, providerId, guidanceText, tracks, encryptor, policyChecker)   [Domain — 02 §2.7]
        ├─ يتحقق أن الحجز مُسنَد فعلياً لهذا المختص، وأن حالته Accepted أو أحدث
        ├─ GuidanceText يمر على IContentPolicyChecker بنفس صرامة وصف الخدمة — أي محاولة كتابة جرعة دوائية محدَّدة تُرفض هنا (راجع 07 §7.2)
        ├─ كل RecommendedAudioTrackIds يُتحقَّق أنها منشورة (IsPublished) فعلاً
        └─ يشفّر GuidanceText فوراً
        ↓
SaveChangesAsync → OutboxMessage لحدث ProviderRecommendationSentEvent
        ↓  الناشر الدوري
إشعار للمستفيد (FCM/واتساب): "لديك توصية جديدة من مختصك" — بلا نص التوصية نفسه في الإشعار (04-infrastructure-layer.md §4.4)
        ↓
المستفيد: GET /me/recommendations   → قائمة توصياته، بعد فك تشفير كل نص داخل الـ Query المحمي فقط
        ↓ (اختياري)
المستفيد يفتح التوصية → MarkAcknowledged() → AcknowledgedByBeneficiaryAtUtc يُسجَّل (إيصال اطّلاع، لا إقرار قانوني)
```

**الفرق البنيوي عن §6.4 (مهم جداً، لا يُخلَط بينهما أبداً):** ملاحظة §6.4 لا تُغادر أبداً نطاق المختص/الإشراف. توصية §6.5 مصمَّمة خصيصاً لتصل للمستفيد — وهي الأداة الوحيدة في كامل النظام التي تفعل ذلك، ومحكومة بنفس فلتر المحتوى والتشفير بلا أي تساهل إضافي لأن "الكاتب موثّق" أو لأن "النص خاص بشخص واحد".

## 6.6 مكتبة الرقية ومشاركة المحتوى (v3 — يوسّع v2)

```
ContentManager:  POST /admin/library/tracks → AudioTrack (IsPublished = false)  → .../publish → IsPublished = true
        ↓
GET /library?category=Dua   (أي مستخدم مصادَق) → منشور فقط
        ↓
POST /me/favorites { audioTrackId }   → قائمة شخصية، لا تُعرض لأي طرف آخر
        ↓ (جديد v3 — نمو عضوي بلا مقابل مالي)
POST /library/tracks/{id}/share-link   (مستخدم مصادَق، مقطع منشور فقط)
        ↓  SharedContentLink.Create(track, userId)
رابط قصير عام: /public/shared/{shortCode}
        ↓
أي زائر (بلا حساب) يفتح الرابط → GET /public/shared/{shortCode}   → RegisterView() فقط، بلا أي بيانات مستخدم مطلوبة
        ↓ صفحة استماع عامة بسيطة، بذلك المقطع فقط، مع دعوة لطيفة لتصفح المكتبة الكاملة عبر تسجيل مجاني
```

هذا التدفّق هو المحرك الرئيسي المقترح للنمو العضوي (راجع `12-ethics-and-future-roadmap.md` §12.4 للمبرر والتفاصيل الكاملة) — مشاركة تلاوة أو دعاء محدد سلوك طبيعي ومتوقَّع لمحتوى كهذا، ولا يكشف أي بيانات شخصية لأنه مقطع عام أصلاً.

## 6.7 المحادثة الإدارية — بلا تغيير

## 6.8 البلاغات والتصعيد التدريجي — بلا تغيير

## 6.9 الإحالة الآمنة والطوارئ (v3 — موسَّعة لتشمل نقطتين جديدتين)

يُطلَق الآن من: رسالة محادثة، بلاغ، "ملاحظتي للمختص" عند الحجز (v2)، **أو "التوصية" الواردة من المختص نفسها إن تضمّن نصها — نظرياً — إشارة تستدعي تدخل ClinicalSupervisor مسبقاً في مراجعته الدورية للفلتر (راجع 07-safety-guardrails.md §7.3).** الفحص التلقائي `ISafeReferralEvaluator` لا يُشغَّل عملياً على نص المختص نفسه (المختص طرف موثّق لا مصدر خطر متوقَّع)، لكن أي مؤشر ضمن ذلك النص يُترك لمراجعة `ClinicalSupervisor` الدورية للمحتوى المرسَل، لا لفحص آلي فوري يعيق عمل المختص.

## 6.10 Bootstrap أول حساب إدارة — بلا تغيير عن v2

راجع `04-infrastructure-layer.md` §4.12 و`SKILL.md` للمبدأ الكامل: لا حقن مباشر في قاعدة البيانات أبداً، Seeding آمن مرة واحدة فقط، وكل حساب إداري لاحق عبر `AssignRoleCommand` حصراً.
