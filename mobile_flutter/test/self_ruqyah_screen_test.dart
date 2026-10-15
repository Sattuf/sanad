import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sanad/content/arabic.dart';
import 'package:sanad/content/models.dart';
import 'package:sanad/core/audio.dart';
import 'package:sanad/features/companion/journal_queue.dart';

import 'today_screen_test.dart' show FakeAudio, pumpApp, reveal;
import 'vectors_test.dart' show loadContent;

void main() {
  final content = loadContent();

  Future<void> next(WidgetTester tester) async {
    await tester.tap(find.text('الخطوة التالية'));
    await tester.pumpAndSettle();
  }

  Future<void> chooseMode(WidgetTester tester, GuideMode mode) async {
    final card = find.byKey(ValueKey('mode-${mode.name}'));
    await reveal(tester, card);
    await tester.tap(card);
    await tester.pumpAndSettle();
  }

  testWidgets('اختيار من سترقي، ثم الخطوات كلها من المحتوى المشترك حتى الختام', (tester) async {
    await pumpApp(tester, location: '/self-ruqyah');
    expect(find.text('ارقِ نفسك وأهلك بنفسك'), findsOneWidget);
    for (final m in content.guideModes) {
      await reveal(tester, find.text(m.title));
    }

    await chooseMode(tester, GuideMode.self);
    final steps = content.guideSteps[GuideMode.self]!;
    expect(find.text('الخطوة ١ من ${arNum(steps.length)}'), findsOneWidget);
    for (final tip in content.intentionTips) {
      await reveal(tester, find.text(tip));
    }

    await next(tester);
    expect(find.text(steps[1].title), findsOneWidget);
    for (final p in content.handPhrases) {
      await reveal(tester, find.text(p.text));
      await reveal(tester, find.text('٠ / ${arNum(p.repeat)}'));
    }
    await reveal(tester, find.text('المصدر: ${content.item(content.handItemId).source}'));

    for (var i = 2; i < steps.length; i++) {
      await next(tester);
      expect(find.text(steps[i].title), findsOneWidget, reason: steps[i].id);
      for (final id in steps[i].items) {
        final it = content.item(id);
        if (it.kind == ItemKind.dhikr) await reveal(tester, find.text(it.text!));
      }
    }
    await reveal(tester, find.text(content.item(content.guideNafthItemId).text!));
    await tester.tap(find.text('أتممت الجلسة'));
    await tester.pumpAndSettle();
    expect(find.text('تقبّل الله منك'), findsOneWidget);
    expect(find.text('وما مستوى هدوئك الآن؟'), findsNothing); // لم يُسجَّل هدوء قبل الجلسة
  });

  testWidgets('رقية أحد الأهل: عناوين الخطوات بحسب الوضع', (tester) async {
    await pumpApp(tester, location: '/self-ruqyah');
    await chooseMode(tester, GuideMode.family);
    final steps = content.guideSteps[GuideMode.family]!;
    await next(tester);
    expect(find.text(steps[1].title), findsOneWidget);
    expect(steps[1].title, isNot(content.guideSteps[GuideMode.self]![1].title));
    final dua = steps.indexWhere((s) => s.id == 'dua');
    for (var i = 2; i <= dua; i++) {
      await next(tester);
    }
    expect(find.text(steps[dua].title), findsOneWidget);
    await reveal(tester, find.text(content.item('ruqyah-jibril').text!));
  });

  testWidgets('رجوع من الخطوة الأولى يعيد لاختيار الوضع', (tester) async {
    await pumpApp(tester, location: '/self-ruqyah');
    await chooseMode(tester, GuideMode.child);
    await tester.tap(find.text('→ رجوع'));
    await tester.pumpAndSettle();
    expect(find.text('ارقِ نفسك وأهلك بنفسك'), findsOneWidget);
  });

  testWidgets('الهدوء قبل وبعد يُحفظ للمذكّرة في الذاكرة فقط (لا يُكتب دون تشفير)', (tester) async {
    final prefs = await pumpApp(tester, location: '/self-ruqyah');
    await reveal(tester, find.text('٣'));
    await tester.tap(find.text('٣'));
    await tester.pumpAndSettle();
    await chooseMode(tester, GuideMode.self);
    for (var i = 1; i < content.guideSteps[GuideMode.self]!.length; i++) {
      await next(tester);
    }
    await tester.tap(find.text('أتممت الجلسة'));
    await tester.pumpAndSettle();
    await reveal(tester, find.text('٧'));
    await tester.tap(find.text('٧'));
    await tester.pumpAndSettle();
    await reveal(tester, find.text('احفظ في مذكّرتي'));
    await tester.tap(find.text('احفظ في مذكّرتي'));
    await tester.pumpAndSettle();
    await reveal(tester, find.text('سيُحفظ في مذكّرتك عند فتحها في هذه الجلسة.'));

    final queued = ProviderScope.containerOf(tester.element(find.byType(Scaffold).last)).read(journalQueueProvider);
    expect(queued.single.kind, 'ruqyah');
    expect((queued.single.before, queued.single.after), (3, 7));
    expect(prefs.getKeys().where((k) => k.contains('journal')), isEmpty);
  });

  testWidgets('الفاتحة: «استمع للتلاوة» يشغّل الآيات من خادم سند ويتابعها، و«إيقاف» يوقفها', (tester) async {
    final audio = FakeAudio();
    await pumpApp(tester, location: '/self-ruqyah', audio: audio);
    await chooseMode(tester, GuideMode.self);
    await next(tester);
    await next(tester); // الفاتحة

    await reveal(tester, find.text('استمع للتلاوة'));
    await tester.tap(find.text('استمع للتلاوة'));
    await tester.pumpAndSettle();
    expect(audio.played, [ayahAudioUrl(1, 1)]);
    expect(ayahAudioUrl(1, 1), endsWith('/api/v1/public/recitation/Alafasy_128kbps/1/1'));
    expect(audio.cached, contains(ayahAudioUrl(1, 1)));
    expect(find.text('إيقاف'), findsOneWidget);

    audio.finishCurrent();
    await tester.pumpAndSettle();
    expect(audio.played.last, ayahAudioUrl(1, 2));

    await tester.tap(find.text('إيقاف'));
    await tester.pumpAndSettle();
    expect(find.text('استمع للتلاوة'), findsOneWidget);
  });

  testWidgets('تعذّر الجلب: رسالة ودّية ولا تعلق', (tester) async {
    await pumpApp(tester, location: '/self-ruqyah', audio: FakeAudio(fail: true));
    await chooseMode(tester, GuideMode.self);
    await next(tester);
    await next(tester);
    await reveal(tester, find.text('استمع للتلاوة'));
    await tester.tap(find.text('استمع للتلاوة'));
    await tester.pumpAndSettle();
    await reveal(tester, find.text('تعذّر التشغيل — تحقق من الاتصال'));
    expect(find.text('استمع للتلاوة'), findsOneWidget);
  });
}
