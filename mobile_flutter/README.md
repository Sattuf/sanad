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

## الخطوط
IBM Plex Sans Arabic وAmiri وAmiri Quran في `assets/fonts` برخصة SIL OFL 1.1 (نصوصها مع الملفات).
