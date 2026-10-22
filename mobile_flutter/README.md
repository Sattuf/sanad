# سند — تطبيق Flutter

تطبيق المستفيد على Android وiOS بواجهة الويب نفسها ([ADR-0023](../docs/adr/0023-mobile-app-flutter.md)، الخطة: [docs/flutter-app-plan.md](../docs/flutter-app-plan.md)).

## التشغيل

```bash
flutter pub get
flutter run
```

### إعدادات البناء (`--dart-define`)

| المتغيّر | الغرض | الافتراضي |
|---|---|---|
| `SANAD_API_BASE` | عنوان خادم سند (الحساب، المكتبة، التلاوات) | `http://localhost:5080` |
| `SANAD_SITE_HOST` | نطاق الموقع في بطاقات المشاركة وروابط الشروط والخصوصية | `sanad.app` |
| `GOOGLE_SERVER_CLIENT_ID` | معرّف **عميل الويب** في Google Cloud — جمهور رمز الهوية الذي يقبله الخادم (`Auth:Google:ClientId` أو `Auth:Google:NativeClientIds`). بدونه يظهر «الدخول بجوجل غير مُفعّل» | فارغ |
| `GOOGLE_IOS_CLIENT_ID` | معرّف عميل iOS | فارغ |

```bash
flutter run --dart-define=SANAD_API_BASE=https://api.example --dart-define=GOOGLE_SERVER_CLIENT_ID=xxxx.apps.googleusercontent.com
```

الدخول الأصلي يحتاج أيضاً (خارج المستودع — من حسابات المشروع):
- **أندرويد:** عميل OAuth من نوع Android في Google Cloud بالحزمة `app.sanad` وبصمة SHA-1 لمفتاح التوقيع (ومفتاح debug للتطوير).
- **iOS (لم يُبنَ بعد على macOS):** مخطط URL بمعرّف عميل iOS معكوساً (`com.googleusercontent.apps.…`) في `CFBundleURLTypes` بـ `Info.plist`، وقدرة «Sign in with Apple» في Xcode، ومعرّف الحزمة في `Auth:Apple:ClientIds` بالخادم.

## مصدر واحد — لا يُكتب محتوى أو لون يدوياً هنا

| ما في التطبيق | مصدره | أمر التوليد |
|---|---|---|
| `assets/content/*.json` (المصحف، الأذكار، البرامج، الميزان، الاختبار، أنماط الخطر) | `packages/shared/src` | `node packages/shared/scripts/export-dart.mjs` |
| `lib/theme/tokens.g.dart` (ألوان «سكينة الفجر» فاتح/ليلي) | `frontend/src/styles/index.css` | `node frontend/scripts/export-tokens.mjs` |

يحتاج المولّدان Node 24 (أو 22.18+). CI يعيد التوليد بـ `--check` ويفشل إن لم يطابق المصدر.

## الاختبارات

```bash
flutter test --exclude-tags screenshot
```

- `test/vectors_test.dart`: متجهات التطابق في `packages/shared/test-vectors` — نفسها يشغّلها Vitest على TypeScript.
- `test/today_screen_test.dart`: سلوك «يومي»، والحفظ بصيغة الويب نفسها (`sanad.companion.v1`).
- لقطات المراجعة البصرية بالخطوط الحقيقية (لا تُقارن في CI):

```bash
flutter test --tags screenshot --update-goldens
```

### رحلات المستخدم على جهاز حقيقي (`integration_test/`)

السيناريوهات السبعة في [خطة Flutter §9](../docs/flutter-app-plan.md): التطبيق الحقيقي بإضافاته الأصلية على محاكٍ أو جهاز،
وخادم حقيقي في Development (حسابات العرض). الدخول يتم عبر الـ API ثم يُفتح التطبيق بالجلسة، فيمر بمسار استعادة الجلسة الحقيقي
(دخول جوجل نفسه لا يعمل داخل اختبار).

```bash
# 1) الخادم (في مجلد المستودع) — المحاكي يصل إلى حاسوبك عبر 10.0.2.2
$env:ASPNETCORE_ENVIRONMENT="Development"; dotnet run --project src/Sanad.Api --urls http://localhost:5080
# 2) المحاكي مشغَّل، ثم من mobile_flutter (من PowerShell: Gradle يحتاج الكتابة في %USERPROFILE%\.gradle)
flutter test integration_test -d emulator-5554 --dart-define=SANAD_API_BASE=http://10.0.2.2:5080
```

- **التطبيق لا يُفتح والاختبار ينتظر بلا نهاية** (وفي `adb logcat`: `START ... DefaultLauncher ... result code=-92`): بقي الوضع المتحفّظ
  مفعّلاً من تجربة يدوية، فأيقونة التطبيق الأساسية معطّلة. أعِدها:
  `adb root; adb shell pm enable app.sanad/app.sanad.DefaultLauncher; adb shell pm disable app.sanad/app.sanad.NotesLauncher; adb unroot`.
- بيانات العرض تحتاج موعداً متاحاً للشيخ (رحلة الحجز)؛ كل تشغيل يحجز واحداً.

## الخطوط
IBM Plex Sans Arabic وAmiri وAmiri Quran في `assets/fonts` برخصة SIL OFL 1.1 (نصوصها مع الملفات).
