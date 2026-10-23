# خريطة توثيق سند

دليل لكل ملف توثيق في المستودع: ماذا يشرح، ولمن، وهل ما زال مطابقاً للكود. ابدأ من [README الرئيسي](../README.md) للتعريف والتشغيل، ثم عُد هنا.

> **قاعدة الأسبقية:** عند أي تعارض، **سجلّ القرارات (ADR)** هو المرجع، ثم README كل تطبيق، ثم الحزمة المرجعية الأصلية في `references/`.

## ابدأ من هنا

| أنت… | اقرأ بهذا الترتيب |
|---|---|
| مطوّر جديد | [README الرئيسي](../README.md) ← [ADR-0001](adr/0001-architecture-and-adr-process.md) ← README التطبيق الذي ستعمل عليه (الجدول التالي) |
| تعمل على تطبيق الجوال | [mobile_flutter/README.md](../mobile_flutter/README.md) ← [ADR-0023](adr/0023-mobile-app-flutter.md) ← [خطة Flutter](flutter-app-plan.md) |
| تكتب محتوى أو تراجعه | [ADR-0016](adr/0016-ruqyah-written-content.md) ← [ADR-0022](adr/0022-local-first-daily-companion.md) ← [ضوابط المحتوى](../.claude/skills/sanad-ruqyah-app/references/content-guardrails.md) ← [ضوابط السلامة](../references/07-safety-guardrails.md) |
| تراجع الأمان والخصوصية | [ADR-0004](adr/0004-field-encryption.md)، [0010](adr/0010-staff-mfa-and-signin-tickets.md)، [0012](adr/0012-sensitive-access-rules.md)، [0013](adr/0013-safety-filters.md) ← [تحصين الأمان](../references/11-security-hardening-and-scalability.md) |
| تجهّز للنشر | [README الرئيسي — الإنتاج](../README.md#الإنتاج) ← [ADR-0020](adr/0020-horizontal-scaling.md) ← [بوابات الإطلاق](../references/08-testing-deployment-roadmap.md) |

## التطبيقات والمكوّنات

| المجلد | ما هو | الحالة | توثيقه |
|---|---|---|---|
| `src/`، `tests/` | الخادم: ‎.NET 10 (LTS)، Clean Architecture داخل Modular Monolith | فعّال | [README الرئيسي](../README.md)، [ADR-0001](adr/0001-architecture-and-adr-process.md)، `references/01`–`06` |
| `frontend/` | الويب: React 18 + TypeScript + Vite، عربي RTL، ورفيق السكينة اليومي | فعّال | [README الرئيسي](../README.md#رفيق-السكينة-اليومي-على-الويب)، [ADR-0014](adr/0014-frontend-client-and-session.md)، [ADR-0022](adr/0022-local-first-daily-companion.md) |
| `mobile_flutter/` | تطبيق الجوال بـ Flutter (Android وiOS) بواجهة الويب نفسها | قيد البناء (الأسابيع 1–7 منجزة) | [mobile_flutter/README.md](../mobile_flutter/README.md) |
| `packages/shared/` | المحتوى والمنطق المشترك: المصحف والأذكار والبرامج وعميل الـ API، ومولّدات Dart ومتجهات التطابق | فعّال | [ADR-0023](adr/0023-mobile-app-flutter.md) §3–4 |
| `ruqyah-app/` | «سند» للرقية الذاتية: PWA محلية أولاً بخطط يعدّها شيوخ | فعّال | [ruqyah-app/README.md](../ruqyah-app/README.md)، [ADR-0021](adr/0021-self-ruqyah-companion-app.md) |
| `tools/Sanad.LibraryImport/` | أداة سطر أوامر لاستيراد مقاطع المكتبة الصوتية دفعة واحدة | فعّال | [README الأداة](../tools/Sanad.LibraryImport/README.md) |

## سجلّ القرارات (ADR)

| # | القرار | الحالة |
|---|---|---|
| [0001](adr/0001-architecture-and-adr-process.md) | Clean Architecture داخل Modular Monolith، وتوثيق كل قرار غير محسوم | مقبول |
| [0002](adr/0002-database-providers.md) | PostgreSQL للإنتاج، SQLite للتطوير والاختبار فقط | مقبول |
| [0003](adr/0003-admin-bootstrap-no-direct-injection.md) | لا حقن مباشر في قاعدة البيانات لأي حساب إداري، حتى الأول | مقبول |
| [0004](adr/0004-field-encryption.md) | تشفير الحقول الحساسة بـ AES-256-GCM مع حلقة مفاتيح | مقبول |
| [0005](adr/0005-account-deletion-anonymize.md) | حذف الحساب: تجريد لا حذف للسجلات المرتبطة | مقبول |
| [0006](adr/0006-booking-withdrawal.md) | سحب طلب الحجز قبل القبول | مقبول |
| [0007](adr/0007-encrypt-messages-and-reports.md) | تشفير نص الرسائل ووصف البلاغات أيضاً | مقبول |
| [0008](adr/0008-document-mismatch-rejection.md) | رفض فوري عند عدم تطابق نوع المستند مع نوع الممارسة | مقبول — عُدِّل جزئياً بـ 0024 |
| [0009](adr/0009-notifications.md) | الإشعارات: داخل التطبيق أولاً، والقنوات الخارجية خلف Feature Flags | مقبول |
| [0010](adr/0010-staff-mfa-and-signin-tickets.md) | 2FA إلزامي للأدوار الإدارية، ومراحل دخول بتذاكر قصيرة الأجل | مقبول — عُدِّل جزئياً بـ 0024 |
| [0011](adr/0011-rate-limiting-and-captcha.md) | محدِّد المعدل المدمج في ASP.NET Core، وCAPTCHA | مقبول |
| [0012](adr/0012-sensitive-access-rules.md) | قواعد الوصول للنصوص الحساسة والموافقة عليها | مقبول — عُدِّل جزئياً بـ 0024 |
| [0013](adr/0013-safety-filters.md) | فلتر العبارات المحظورة وكاشف الخطر بعد توحيد النص العربي | مقبول — يتطلب مراجعة مراجع شرعي قبل الإطلاق — عُدِّل جزئياً بـ 0024 |
| [0014](adr/0014-frontend-client-and-session.md) | الواجهة: عميل API يدوي، وتخزين الجلسة، وتقليم الأدوات | مقبول — عُدِّل جزئياً بـ 0024 |
| [0015](adr/0015-trusted-library-sources.md) | محتوى المكتبة من مصادر قرآنية معتمدة وقناة YouTube معتمدة | مقبول — القوائم تتطلب مراجعة مراجع شرعي قبل الإطلاق |
| [0016](adr/0016-ruqyah-written-content.md) | «الرقية والتحصين»: النص الثابت، التلاوة، الورد، والأدعية المراجَعة | مقبول — عُدِّل جزئياً بـ 0024 |
| [0017](adr/0017-pwa-and-adhkar-push-reminders.md) | PWA وتذكير الأذكار بإشعارات Web Push | مقبول |
| [0018](adr/0018-mobile-app-react-native.md) | تطبيق الجوال بـ React Native (Expo) | **مُستبدَل بـ 0023** |
| [0019](adr/0019-native-mobile-sign-in.md) | الدخول الأصلي من الجوال (جوجل، أبل) والحد الأدنى للإصدار | مقبول |
| [0020](adr/0020-horizontal-scaling.md) | جاهزية التوسّع الأفقي لـ 100 ألف مستخدم | مقبول |
| [0021](adr/0021-self-ruqyah-companion-app.md) | تطبيق «سند» للرقية الذاتية وخلفيته | مقبول — عُدِّل جزئياً بـ 0024 |
| [0022](adr/0022-local-first-daily-companion.md) | «رفيق السكينة اليومي»: ميزات محلية أولاً على الويب | مقبول — عُدِّل جزئياً بـ 0024 |
| [0023](adr/0023-mobile-app-flutter.md) | تطبيق الجوال بـ Flutter بدل React Native | مقبول — يحلّ محلّ 0018 |
| [0024](adr/0024-sharia-only-scope.md) | نطاق شرعي فقط: حذف الطبيب والمحتوى الطبي والإحالة العاجلة | مقبول — يعدّل 0008 و0010 و0012 و0013 و0014 و0016 و0021 و0022 |

قرار جديد؟ انسخ بنية أي ADR (السياق، القرار، البدائل، الأثر)، وأعطه الرقم التالي، وأضفه إلى هذا الجدول.

## الخطط والمنتج

| الملف | المحتوى | الحالة |
|---|---|---|
| [flutter-app-plan.md](flutter-app-plan.md) | خطة تطبيق Flutter: النطاق، الجدول بالأسابيع، معايير القبول | فعّالة — الأسابيع 1–7 منجزة |
| [growth/positioning.md](growth/positioning.md) | التموضع والرسالة والتسويق | فعّالة |
| [production-readiness.md](production-readiness.md) | جاهزية الخادم للإنتاج (100 ألف مستخدم): المشاكل المحلولة وما بقي قبل الإطلاق | فعّالة |

## الحزمة المرجعية الأصلية (`references/`)

وثائق التصميم الأولى للمنصة (2026-09-27): المعمارية، نموذج النطاق، الطبقات، الأمان، الاختبار والنشر، الواجهة، والأخلاقيات. ما زالت أساس الخادم وضوابطه، لكن **قرارات ADR اللاحقة تعدّلها** حيث تتعارض. مثلاً: §10.1 في `10-frontend-architecture.md` عدّلته ADR-0017 ثم 0018 ثم 0023، والجانب الطبي والإحالة العاجلة في `07-safety-guardrails.md` ألغتهما ADR-0024.

| الملف | الموضوع |
|---|---|
| [SKILL.md](../references/SKILL.md) | البنود غير القابلة للتفاوض وترتيب البناء |
| [01](../references/01-solution-architecture.md) · [02](../references/02-domain-model.md) · [03](../references/03-application-layer.md) · [04](../references/04-infrastructure-layer.md) · [05](../references/05-api-layer-and-security.md) | المعمارية، النطاق، التطبيق، البنية التحتية، الـ API والأمان |
| [06](../references/06-core-modules-workflows.md) · [07](../references/07-safety-guardrails.md) · [08](../references/08-testing-deployment-roadmap.md) · [09](../references/09-project-scaffold-commands.md) | سير العمل، ضوابط السلامة، الاختبار والنشر، أوامر الإنشاء |
| [10](../references/10-frontend-architecture.md) · [11](../references/11-security-hardening-and-scalability.md) · [12](../references/12-ethics-and-future-roadmap.md) · [13](../references/13-visual-motion-design.md) | الواجهة، التحصين والتوسّع، الأخلاقيات والمستقبل، التصميم والحركة |

## مهارة «سند» للرقية الذاتية (`.claude/skills/sanad-ruqyah-app/`)

نطاق `ruqyah-app/` وضوابطه لأدوات البناء: [SKILL.md](../.claude/skills/sanad-ruqyah-app/SKILL.md)، [مواصفات المنتج](../.claude/skills/sanad-ruqyah-app/references/product-spec.md)، [ضوابط المحتوى](../.claude/skills/sanad-ruqyah-app/references/content-guardrails.md)، [نظام التصميم «المخطوطة المُذهَّبة»](../.claude/skills/sanad-ruqyah-app/references/design-system.md).

## جرد التوثيق (2026-10-18)

✅ مطابق للكود · ⚠️ صحيح في جوهره وينقصه تحديث · ⛔ مُستبدَل، يبقى للتاريخ

| الملف | الحالة | الملاحظة |
|---|---|---|
| `README.md` | ✅ | أعيدت كتابته في هذا التحديث: الصور، خريطة المكوّنات، Flutter، الدخول عبر Google |
| `docs/README.md` | ✅ | هذه الخريطة |
| `docs/adr/0001`–`0024` | ✅ | سجلّ تاريخي؛ لا يُعدَّل القرار القديم بل يُستبدل بجديد |
| `docs/flutter-app-plan.md` | ⚠️ | الخطة صحيحة؛ ينقصها تسجيل ما أُنجز من الأسابيع 1–7 |
| `docs/production-readiness.md` | ✅ | نُقلت من خطة React Native المحذوفة |
| `docs/growth/positioning.md` | ✅ | |
| `mobile_flutter/README.md` | ⚠️ | التشغيل وإعدادات البناء صحيحة؛ ينقصها شرح البنية والاختبارات واللقطات والتحقق على المحاكي |
| `ruqyah-app/README.md` | ✅ | |
| `frontend/public/library/README.md` | ✅ | مصدر صور المشاهد وأحجامها |
| `tools/Sanad.LibraryImport/README.md` | ✅ | |
| `references/*` | ⚠️ | المرجع الأصلي؛ لم يُراجَع سطراً سطراً، وADRs تحكمه عند التعارض. ما فيه عن الطبيب والإحالة العاجلة ملغى بـ ADR-0024 |
| `.claude/skills/sanad-ruqyah-app/*` | ✅ | خاص بـ `ruqyah-app/` |

**فجوات تُسدّ في المرحلة التالية:** لا README لكلٍّ من `frontend/` و`packages/shared/` والخادم في `src/`، ولا دليل واحد للاختبارات وCI.

## صور التطبيق

صور [README الرئيسي](../README.md) في `docs/images/`، وتُعاد بأمر واحد بعد أي تغيير بصري:

```bash
cd frontend
npm run dev                              # في طرفية أخرى
node scripts/docs-screenshots.mjs        # web/*.jpg من الويب، وapp/*.png من لقطات Flutter المعتمدة
```

صور الويب من صفحات تعمل بلا خادم. صور الجوال مصغّرة من لقطات المراجعة في `mobile_flutter/test/screenshots/` (`flutter test --tags screenshot --update-goldens`)، فتبقى مطابقة لما تتحقق منه الاختبارات.
