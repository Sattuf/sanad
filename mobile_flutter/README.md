# سند — تطبيق Flutter

تطبيق المستفيد على Android وiOS بواجهة الويب نفسها ([ADR-0023](../docs/adr/0023-mobile-app-flutter.md)، الخطة: [docs/flutter-app-plan.md](../docs/flutter-app-plan.md)).
يحلّ محل تطبيق React Native في `mobile/` عند الإطلاق.

## التشغيل

```bash
flutter pub get
flutter run
```

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
