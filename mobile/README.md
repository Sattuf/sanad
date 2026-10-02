# سند — تطبيق الجوال (Expo / React Native)

القرار والخطة: [ADR-0018](../docs/adr/0018-mobile-app-react-native.md) · [docs/mobile-app-plan.md](../docs/mobile-app-plan.md)

## التشغيل

المتطلبات: Node 22، وتطبيق **Expo Go** على جوالك (للتجربة السريعة) أو بناء تطوير.

```bash
cd mobile
npm install
cp .env.example .env.local      # عنوان الـ API — على جهاز حقيقي استخدم IP حاسوبك لا localhost
npm start                       # امسح رمز QR بتطبيق Expo Go
```

وأضف عنوان التطبيق للـ CORS في الخادم عند الحاجة (`Frontend:AllowedOrigins`).

## التجربة بحساب تجريبي (على جوالك، 10 دقائق)

جُرّبت هذه الخطوات كاملة على الخادم: الدخول، الدليل، الحجز، المحادثة، المكتبة، الورد، ودخول الهاتف برمز.

**1) شغّل الخادم على حاسوبك مفتوحاً للشبكة المحلية** (Windows PowerShell، من جذر المستودع):
```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-dev.ps1        # مرة واحدة فقط
$env:ASPNETCORE_ENVIRONMENT="Development"
dotnet run --project src/Sanad.Api --urls http://0.0.0.0:5080
```
- `0.0.0.0` لا `localhost`: الجوال جهاز آخر على الشبكة. إن سأل جدار حماية Windows، اسمح بالشبكات **الخاصة**.
- أول إقلاع يُنشئ البيانات التجريبية تلقائياً (مختصان، جهة، مواعيد، مقاطع صوتية).

**2) اعرف عنوان حاسوبك**: `ipconfig` ← «IPv4 Address» (مثل `192.168.1.20`). الجوال والحاسوب على شبكة Wi-Fi نفسها.

**3) شغّل التطبيق**:
```powershell
cd mobile
npm install
Set-Content -Encoding ascii .env.local "EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:5080"   # عنوانك أنت
npx expo start
```
ثبّت **Expo Go** من المتجر على جوالك، وامسح رمز QR (iPhone: بالكاميرا، Android: من داخل Expo Go).

**4) الحسابات التجريبية** — كلمة المرور لكلها `Demo-Pass-123`:

| الحساب | الدور |
|---|---|
| `beneficiary@sanad.local` | مستفيد — **هذا للتجربة في التطبيق** |
| `doctor@sanad.local` | طبيبة مرخّصة (بوابتها على الويب) |
| `sheikh@sanad.local` | راقٍ شرعي (بوابته على الويب) |

**الدخول برقم الهاتف**: أي رقم، والرمز يظهر في نافذة الخادم بسطر `[DEV ONLY] SMS to …` — لا تُرسل رسائل حقيقية.

**ماذا تجرّب**: الورد والعدّاد ← تذكير الأذكار (يصل والتطبيق مغلق؛ على iPhone فقط في Expo Go) ← الدليل ← احجز موعداً ← حجوزاتي ← المحادثة
← المكتبة (المقاطع التجريبية صامتة) ← حسابي: الخصوصية، تصدير بياناتي، حذف الحساب (جرّبه بحساب هاتف جديد لا بالحساب التجريبي).
لتجربة جهة المختص: ادخل `doctor@sanad.local` على الويب (`cd frontend; npm run dev`) واقبل الحجز أو أرسل توصية، فتظهر في التطبيق.

**لا يعمل في Expo Go**: الدخول بجوجل (يحتاج بناء تطوير EAS)، والدخول بأبل (يحتاج معرّف تطبيقك على أجهزة Apple)،
وتذكير الأذكار على Android (أزال Expo Go وحدة الإشعارات منه — تظهر رسالة توضيحية في شاشة التذكير). البقية كلها تعمل.

**لم يتصل التطبيق بالخادم؟** افتح `http://192.168.1.20:5080/health/live` من متصفح الجوال: إن لم تظهر `Healthy` فالمشكلة في الشبكة أو جدار الحماية، لا في التطبيق.

## الدخول

- **البريد والهاتف** يعملان في Expo Go مباشرة. رمز OTP في التطوير يُطبع في سجل الـ API.
- **أبل** على iPhone (يحتاج `Auth:Apple:ClientIds` في الخادم).
- **جوجل** يحتاج **بناء تطوير** (لا يعمل في Expo Go) ومعرّفات العملاء في `.env.local` — راجع
  [ADR-0019](../docs/adr/0019-native-mobile-sign-in.md).

## الفحوص

```bash
npm run typecheck
npm run lint
npm test
npm run bundle:check            # يحزم التطبيق للمنصتين — يثبت أن Metro يرى packages/shared
```

## البنية

```
src/app/            الشاشات (Expo Router) — (tabs)/ للتبويبات، ruqyah/[id] لقارئ الورد، emergency
src/components/     نظام التصميم (ui.tsx) وشريط الطوارئ
src/stores/         الجلسة (رمز التحديث في Keychain/Keystore) وحالة الطوارئ
src/lib/api.ts      ربط نواة العميل المشتركة بجلسة الجوال وشريط الطوارئ
src/lib/auth.ts     طرق الدخول (أبل بـ nonce، جوجل كسول التحميل) وإنهاء الجلسة والخروج
src/app/auth/       شاشات الدخول: الاختيار، البريد، الهاتف، 2FA، الموافقات
src/app/…           الدليل، المختص/الجهة، الحجز، حجوزاتي، المحادثات، توصياتي، التذكير، الأدلة
src/lib/player.ts   مشغّل صوت واحد للتطبيق (خلفية + شاشة القفل)
src/lib/wird.ts     عدّاد الورد (الجهاز أولاً ثم الحساب) — reminders.ts: إشعارات محلية يومية
src/components/Realtime.tsx  اتصال SignalR ما دام التطبيق في المقدّمة
```

## قواعد

- **المنطق والمحتوى في `packages/shared` فقط** (`@sanad/shared/...`): الأنواع، نواة العميل، كشف إشارة الطوارئ،
  نص القرآن والأدعية، النصوص العربية. ممنوع نسخ آية أو دعاء داخل `mobile/`.
- الشاشات لا تستدعي `fetch` مباشرة — كل طلب عبر `api` من `src/lib/api.ts` (قاعدة ESLint).
- المجلدان `ios/` و`android/` يولّدهما Expo ولا يُرفعان للمستودع؛ الإعداد الأصلي في `app.config.ts`.
- الواجهة عربية RTL دائماً (`forcesRTL` في `expo-localization`).
