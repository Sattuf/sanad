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
