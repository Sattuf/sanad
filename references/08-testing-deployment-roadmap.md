# المرحلة 8 — الاختبار والنشر وخارطة الطريق

## 8.1 استراتيجية الاختبار

| المستوى | يغطي | أدوات |
|---|---|---|
| Domain.UnitTests | آلة حالة الحجز، قواعد التوثيق، حساب مستوى التصعيد، `ProviderCaseNote.Create` (تحقق الإسناد + فلتر المحتوى)، `BookingRequest.SetBeneficiaryNote` (التشفير + إطلاق إشارة الخطر) | xUnit + FluentAssertions، بلا Mock |
| Application.UnitTests | كل Handler مع `IApplicationDbContext` وهمي، Pipeline Behaviors منفردة، `IIdentityService` وهمي لاختبار تدفّقات التسجيل الثلاثة | xUnit + Moq/NSubstitute |
| Api.IntegrationTests | بوابة النشر، دورة الحجز الكاملة مع ملاحظة، تصعيد البلاغات، تدفّق التسجيل ثم الترقية الكامل، Bootstrap Seeder | `WebApplicationFactory` + Testcontainers (PostgreSQL، Redis) |

### حالات اختبار إلزامية لا تُختصر (v2، محدَّثة)

1. لا نشر بلا توثيق ساري.
2. لا تعارض حجز على نفس الفترة عند طلبين متزامنين.
3. لا تراجع تلقائي لمستوى تصعيد بدون `reviewedByCoordinatorId`.
4. أي نص يحتوي مؤشر خطر عاجل ينتج `emergencyReferral`، **بما فيه "ملاحظتي للمختص" عند إنشاء الحجز**، بصرف النظر عن نجاح إنشاء الحجز نفسه.
5. أي وصف خدمة أو مقطع مكتبة أو **ملاحظة مختص خاصة** يحتوي عبارة من فلتر §7.2 يُرفض بـ 400، لا يُحفظ صامتاً.
6. مستخدم بدور `Beneficiary` لا يستطيع قراءة `ProviderCaseNote` تحت أي ظرف (اختبار Policy سلبي صريح).
7. إعادة إرسال نفس طلب `POST /bookings` بنفس `Idempotency-Key` يعيد نفس النتيجة.
8. **تسجيل جديد بأي من الطرق الثلاث (بريد/جوجل/OTP) ينتج دوراً `Beneficiary` فوراً بلا أي حاجة لمستند** — اختبار تكامل صريح لكل طريقة.
9. **`POST /me/provider-upgrade-request` لا يغيّر الدور فوراً** — الدور يتغيّر فقط بعد `Approve` من `Coordinator`.
10. **`AdminBootstrapSeeder` يعمل مرة واحدة فقط**: تشغيله مرتين على نفس قاعدة البيانات ينتج `SystemAdmin` واحداً فقط، لا اثنين.
11. **فحص مباشر لعمود `BeneficiaryNoteEncrypted`/`NoteEncrypted` في قاعدة بيانات الاختبار** يؤكد عدم وجود نص صريح قابل للقراءة بعد أي حفظ.
12. **بحث نصي آلي في CI عن "Payment"/"Subscription"/"FinanceOfficer"** في `src/` يعيد صفر نتائج (راجع §8.3).
13. **(v3) `SendProviderRecommendationCommand` برسالة تحتوي عبارة جرعة دوائية محدَّدة يُرفض** بنفس الرسالة التي يُرفض بها وصف خدمة مشابه — اختبار صريح يثبت أن فلتر §7.2 لا يُستثنى أبداً لهذا الحقل.
14. **(v3) توصية تقترح `AudioTrackId` غير منشور تُرفض فوراً** بـ `DomainException`.
15. **(v3) طلب ترقية بـ `RequestedType = LicensedPhysician` ومستند من نوع "تزكية شرعية" يُرفض إدارياً** بسبب `DocumentTypeMismatch`، ولا يُعتمد شرطياً.
16. **(v3) `GET /public/shared/{shortCode}` لا يتطلب مصادقة، ويعمل حتى لمستخدم مجهول تماماً**، بينما `POST /library/tracks/{id}/share-link` يتطلبها.
17. **(v3) فحص مباشر لعمود `GuidanceTextEncrypted`** في قاعدة بيانات اختبار يؤكد عدم وجود نص صريح بعد أي `SendProviderRecommendationCommand` ناجح.

## 8.2 الأداء

اختبار حمل تدريجي (k6 أو Gatling) على `GET /directory` و`GET /library` (المئين 95 أقل من 2.5 ثانية)، وعلى `POST /auth/phone/request-otp` تحديداً تحت معدل مرتفع للتأكد أن حدود المعدل وCAPTCHA تمنع استنزاف رصيد مزود الرسائل فعلياً لا نظرياً فقط. كرر اختبار `POST /bookings` تحت تزامن مرتفع لقياس أثر القفل التفاؤلي.

## 8.3 CI/CD

```yaml
on: [push, pull_request]
jobs:
  secret-scan:
    steps:
      - uses: gitleaks/gitleaks-action@v2

  no-payment-code-check:              # v2 — جديد، يفشل البناء إن وُجدت بقايا كود دفع
    steps:
      - run: |
          ! grep -riE "payment|subscription|FinanceOfficer" --include="*.cs" -r src/

  build-and-test:
    needs: [secret-scan, no-payment-code-check]
    steps:
      - run: dotnet build --configuration Release
      - run: dotnet test --no-build --collect:"XPlat Code Coverage"
      - run: dotnet format --verify-no-changes
      - run: dotnet list package --vulnerable --include-transitive
      - run: npm audit --audit-level=high
```

## 8.4 خريطة طريق مرحلية (v2)

| المرحلة الزمنية | ما يُنجز |
|---|---|
| الأسابيع 1–3 | المرحلة 1 + المرحلة 2 (Domain كاملة، بما فيها CaseNotes وRuqyahLibrary) |
| الأسابيع 4–6 | المرحلة 3 + المرحلة 4 لوحدتي Directory وVerification، **ومصادقة متعددة الطرق كاملة (بريد/جوجل/OTP) + Bootstrap Seeder** — هذه أولوية مبكرة لأن كل شيء آخر يعتمد عليها |
| الأسابيع 7–9 | Scheduling (بما فيها ملاحظة المستفيد المشفّرة) وMessaging |
| الأسبوعان 10–11 | وحدة Safety كاملة + CaseNotes (ملاحظة المختص) |
| الأسبوع 12 | مكتبة الرقية (RuqyahLibrary) كاملة |
| الأسبوع 13 | توحيد API، الأمان، رؤوس الأمان، CAPTCHA على كل النماذج العامة |
| الأسبوع 14 | اختبارات التكامل الكاملة + اختبار الأداء |
| الأسبوعان 15–16 | مراجعة أمنية ذاتية (تشمل فحص التشفير الفعلي للحقول الحساسة)، توثيق نهائي، عرض تقديمي |
| بعد الأسبوع 16 (اختياري) | المرحلة 11: Redis، طابور رسائل، Key Vault للإنتاج |

## 8.5 بوابات ما قبل أي إطلاق فعلي (v2 — بلا بند مزود الدفع، مضافة بنود جديدة)

- [ ] مراجعة قانونية محلية لمتطلبات الترخيص والبيانات الصحية في بلد التشغيل الفعلي.
- [ ] مراجعة مشرف سريري محلي لمسار السلامة وقائمة مؤشرات الخطر تحديداً، **بما فيها مؤشرات "ملاحظتي للمختص"**.
- [ ] مراجعة أمنية مستقلة (Penetration Test)، تشمل تحديداً: تجاوز فلتر العبارات المحظورة، تجاوز CAPTCHA/OTP بالقوة الغاشمة، ومحاولة قراءة `BeneficiaryNoteEncrypted`/`NoteEncrypted` دون صلاحية.
- [ ] موافقة أخلاقية/مؤسسية إن كان المشروع سيُختبر مع مستخدمين حقيقيين.
- [ ] **مراجعة قانونية لمزوّد رسائل OTP** (اتفاقية معالجة بيانات، بلد استضافة البيانات) قبل أي استخدام حقيقي لأرقام هواتف فعلية.
- [ ] التأكد أن كل بيانات الاختبار الحالية اصطناعية بالكامل.
- [ ] **لا حاجة لبند مزوّد دفع في v2** — لا توجد أي بوابة دفع في هذا النظام.

هذا المشروع كما هو مبني بهذه الحزمة **مُعَدّ ليبقى في نطاق أكاديمي/MVP تجريبي** إلى أن تُستوفى هذه البوابات جميعها.
