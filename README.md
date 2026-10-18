# سند (Sanad)

دليل جهات ومستشارين **موثّق إدارياً**، مجاني بالكامل: حجز، تواصل إداري، إحالة آمنة، ومكتبة رقية.
سند **لا تشخّص ولا تعالج ولا تعد بنتيجة**. هي طبقة توثيق ووساطة وحجز وإحالة فقط.

> نطاق أكاديمي/MVP ببيانات اصطناعية. لا إطلاق فعلي قبل اجتياز بوابات `references/08-testing-deployment-roadmap.md` §8.5.

## البنية

```
src/
  Sanad.Domain          الكيانات والقواعد (بلا أي اعتماد خارجي)
  Sanad.Application     أوامر/استعلامات MediatR + Pipeline (تحقق، صلاحيات، Idempotency، تدقيق، إحالة عاجلة)
  Sanad.Infrastructure  EF Core (PostgreSQL/SQLite)، Identity + JWT + 2FA، تشفير AES-GCM، Outbox، SignalR، تخزين
  Sanad.Api             Minimal APIs، Policies، Middleware أمني، OpenAPI
tests/                  Domain / Application / Api.IntegrationTests
frontend/               React 18 + TypeScript + Vite + Tailwind، عربي RTL، Framer Motion
mobile/                 تطبيق الجوال: Expo (React Native) — راجع mobile/README.md
ruqyah-app/             «سند» للرقية الذاتية: PWA محلية أولاً، وحساب اختياري للمزامنة والختمة الجماعية — ADR-0021
packages/shared/        منطق ومحتوى مشترك بين الويب والجوال (أنواع، عميل الـ API، الطوارئ، القرآن والأدعية)
docs/adr/               سجل قرارات المعمارية (21 قراراً)
references/             الحزمة المرجعية الأصلية
.claude/skills/         مهارة sanad-ruqyah-app: نطاق التطبيق وضوابطه ونظام تصميم «المخطوطة المُذهَّبة»
```

## التشغيل المحلي (Windows)

المتطلبات: .NET SDK 9، وNode 22. لا حاجة لـ Docker: التطوير يعمل على SQLite وذاكرة محلية بدل Redis.

```powershell
# 1) الأسرار المحلية (مفاتيح عشوائية + المدير الأول) — تُطبع كلمة المرور المؤقتة للمدير
powershell -ExecutionPolicy Bypass -File scripts/setup-dev.ps1

# 2) الـ API على http://localhost:5080 (Swagger: /swagger)
$env:ASPNETCORE_ENVIRONMENT="Development"; dotnet run --project src/Sanad.Api --urls http://localhost:5080

# 3) الواجهة على http://localhost:5173
cd frontend; npm install; npm run dev

# 4) تطبيق «سند» للرقية الذاتية (اختياري) على http://localhost:5174
cd ruqyah-app; copy .env.example .env.local; npm install; npm run dev

# 5) تطبيق الجوال (اختياري) — امسح رمز QR بتطبيق Expo Go
cd mobile; npm install; npm start
```

**حسابات تجريبية** (تُنشأ تلقائياً في Development، كلمة المرور `Demo-Pass-123`):
`beneficiary@sanad.local` (مستفيد)، `doctor@sanad.local` (طبيبة مرخّصة)، `sheikh@sanad.local` (راقٍ شرعي).

**المدير الأول**: `admin@sanad.local` بكلمة المرور المؤقتة من الخطوة 1. عند أول دخول يُفرض تغيير كلمة المرور وإعداد تطبيق مصادقة (2FA). بعدها يمنح المدير أدوار المنسق ومدير المحتوى من «الإدارة ← الأدوار».

رمز OTP للهاتف في التطوير يُطبع في سجل الـ API. لا يوجد مزود SMS حقيقي، وذلك مقصود (ADR-0011).

## الاختبارات

```powershell
dotnet test                                  # Domain + Application + تكامل (23 سيناريو إلزامي على الـ API الحقيقي)
cd frontend; npm test; npm run lint; npm run build
cd packages/shared; npm test; npm run check:pure    # نص القرآن مطابق، ولا اعتمادات خارجية
cd mobile; npm run typecheck; npm run lint; npm test
cd ruqyah-app; npm run check:guardrails; npm run typecheck; npm test; npm run build
npx playwright test                          # E2E — يتطلب تشغيل الـ API والواجهة أولاً
```

اختبار هجرات PostgreSQL عبر Testcontainers يُفعَّل بـ `SANAD_TEST_POSTGRES=1` (يحتاج Docker، ومفعّل في CI).

## الإنتاج

- `Database:Provider=Postgres`. الهجرات: `dotnet tool run dotnet-ef database update -p src/Sanad.Infrastructure -s src/Sanad.Api`.
- الأسرار عبر Key Vault (`KeyVault:Uri`). **الإقلاع يُرفض** إن غاب مفتاح التشفير أو مفتاح JWT أو تطابقا، أو إن عُطّل CAPTCHA، أو استُخدم SQLite (`StartupGuards`).
- **Redis وتخزين S3 إلزاميان في الإنتاج** (Cache، إبطال الرموز، Backplane لـ SignalR؛ والملفات مشتركة بين النسخ والصوت عبر CDN)،
  إلا لنشر بنسخة واحدة مع `Deployment:SingleInstance=true`. المهام الخلفية تعمل على نسخة واحدة بقفل PostgreSQL — راجع ADR-0020.

## الضوابط غير القابلة للتفاوض (مطبّقة ومختبرة)

لا تشخيص ولا تصنيف لحالة المستفيد · فلتر ادعاءات علاجية على كل نص عام وعلى التوصية (حتى من طبيب) · إحالة طوارئ فورية مستقلة عن نجاح العملية · تشفير الملاحظات والتوصيات والرسائل · فصل تام بين الملاحظة الخاصة والتوصية · لا أي كود دفع (فحص آلي في CI) · الهوية منفصلة عن الاعتماد المهني · الطبيب والشيخ مساران متكافئان · 2FA إلزامي لكل دور إداري.

## رفيق السكينة اليومي (الويب) — ADR-0022

ميزات تعمل بلا حساب، ومحلية على الجهاز بالكامل:

| المسار | الميزة |
|---|---|
| `/today` | يومي: مهام البرنامج حسب الوقت، تقدّم، أيام التزام، تذكير يومي (.ics) |
| `/programs` | برامج الالتزام (٧ / ١٠ / ١٤ / ٢١ يوماً) — أذكار وآيات مأثورة بمصادرها |
| `/self-ruqyah` | المرشد التفاعلي للرقية الذاتية (لنفسي / لأهلي / لطفلي) بتلاوة وتكرار |
| `/journal` | مذكّرتي: متابعة الحالة مشفّرة محلياً (رمز + بصمة WebAuthn PRF) ورسم ١٤ يوماً |
| `/awareness`، `/awareness/quiz` | ميزان الوعي (هل هذا صحيح شرعاً؟) واختبار «اختبر وعيك» |
| `/sakina` | وضع السكينة: ذكر بتمهّل وآيات بصوت هادئ، يعمل دون إنترنت |
| `/privacy-mode` | الوضع المتحفّظ، الخروج السريع، مسح البيانات المحلية |

النص القرآني من المصحف المدقّق المشترك (`packages/shared/src/content/quran.ts`، يُولَّد بـ `frontend/scripts/gen-quran.py`). التموضع والتسويق في `docs/growth/positioning.md`.
