import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sanad/core/audio.dart';

import 'today_screen_test.dart' show FakeAudio, pumpApp, reveal, toTop;
import 'vectors_test.dart' show loadContent;

void main() {
  final content = loadContent();
  final allAudio = {
    for (final n in content.sakinaNeeds)
      for (final r in n.verses)
        for (final a in content.expandRef(r)) ayahAudioUrl(a.surah, a.ayah),
  };

  testWidgets('ذكر بتمهّل لا تمرين تنفّس: العدّ بلمسة، وتبديل الذكر يصفّر العدّ', (tester) async {
    await pumpApp(tester, location: '/sakina', reduceMotion: true);
    final first = content.pacedDhikr.first;
    expect(find.text(first.text), findsWidgets);
    expect(find.text(first.source), findsOneWidget);
    expect(find.textContaining('تنفّس', skipOffstage: false), findsNothing);
    expect(find.textContaining('شهيق', skipOffstage: false), findsNothing);

    for (var i = 0; i < 3; i++) {
      await tester.tap(find.byKey(const ValueKey('paced-dhikr')));
    }
    await tester.pumpAndSettle();
    final semantics = tester.ensureSemantics();
    await tester.pump();
    expect(find.bySemanticsLabel('${first.text} — اضغط مع كل مرة، العدد 3'), findsOneWidget);
    expect(find.text('٣'), findsOneWidget);

    final second = content.pacedDhikr[1];
    await tester.tap(find.text(second.text));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('${second.text} — اضغط مع كل مرة، العدد 0'), findsOneWidget);
    expect(find.text(second.source), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('الدائرة تنبض بلا توقف حين لا يُطلب تقليل الحركة، والخروج يعيد للتطبيق', (tester) async {
    await pumpApp(tester, location: '/today');
    // pumpAndSettle لا يستقر مع نبض دائم، فننتقل بإطارات محددة
    await tester.tap(find.text('سكينة').first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    expect(tester.hasRunningAnimations, isTrue);
    await tester.tap(find.text('→ خروج'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('ابدأ رحلتك بخطوة صغيرة'), findsOneWidget);
  });

  testWidgets('الحالات: الأذكار من المحتوى المشترك، والمس للذكر التالي', (tester) async {
    await pumpApp(tester, location: '/sakina?for=night', reduceMotion: true);
    final night = content.sakinaNeeds.firstWhere((n) => n.id == 'night');
    await reveal(tester, find.text(content.item(night.items[0]).text!));
    await reveal(tester, find.text('استمع لآيات التحصين'));

    await tester.tap(find.byKey(const ValueKey('next-dhikr')));
    await tester.pumpAndSettle();
    await reveal(tester, find.text(content.item(night.items[1]).text!));

    final distress = content.sakinaNeeds.firstWhere((n) => n.id == 'distress');
    await toTop(tester);
    await tester.tap(find.text(distress.label));
    await tester.pumpAndSettle();
    await reveal(tester, find.text(content.item(distress.items[0]).text!));
    await reveal(tester, find.text('استمع لآيات السكينة'));
  });

  testWidgets('الاستماع: آيات الحالة بالترتيب، بعدد الجولات، والإيقاف', (tester) async {
    final audio = FakeAudio();
    await pumpApp(tester, location: '/sakina?for=sleep', audio: audio, reduceMotion: true);
    final sleep = content.sakinaNeeds.firstWhere((n) => n.id == 'sleep');
    final urls = [
      for (final r in sleep.verses)
        for (final a in content.expandRef(r)) ayahAudioUrl(a.surah, a.ayah),
    ];

    await reveal(tester, find.text('استمع لآيات التحصين'));
    await tester.tap(find.text('استمع لآيات التحصين'));
    await tester.pumpAndSettle();
    expect(find.text('إيقاف التلاوة'), findsOneWidget);
    for (var i = 1; i < urls.length * content.sakinaRepeat; i++) {
      audio.finishCurrent();
      await tester.pumpAndSettle();
    }
    expect(audio.played, [for (var r = 0; r < content.sakinaRepeat; r++) ...urls]);

    await tester.tap(find.text('إيقاف التلاوة'));
    await tester.pumpAndSettle();
    expect(find.text('استمع لآيات التحصين'), findsOneWidget);
  });

  testWidgets('للعمل دون إنترنت: حفظ كل التلاوات مرة واحدة', (tester) async {
    final audio = FakeAudio();
    await pumpApp(tester, location: '/sakina', audio: audio, reduceMotion: true);
    await reveal(tester, find.text('احفظ التلاوات للاستخدام دون إنترنت'));
    await tester.tap(find.text('احفظ التلاوات للاستخدام دون إنترنت'));
    await tester.pumpAndSettle();
    expect(audio.cached, allAudio);
    expect(find.text('التلاوات محفوظة على جهازك ✓ تعمل دون إنترنت'), findsOneWidget);
  });

  testWidgets('تلاوات محفوظة سابقاً: لا زر حفظ', (tester) async {
    await pumpApp(tester, location: '/sakina', audio: FakeAudio(cached: {...allAudio}), reduceMotion: true);
    await reveal(tester, find.text('التلاوات محفوظة على جهازك ✓ تعمل دون إنترنت'));
    expect(find.text('احفظ التلاوات للاستخدام دون إنترنت'), findsNothing);
  });

  testWidgets('تعذّر التشغيل بلا اتصال ولا حفظ: رسالة ودّية', (tester) async {
    await pumpApp(tester, location: '/sakina', audio: FakeAudio(fail: true), reduceMotion: true);
    await reveal(tester, find.text('استمع لآيات السكينة'));
    await tester.tap(find.text('استمع لآيات السكينة'));
    await tester.pumpAndSettle();
    await reveal(tester, find.text('تعذّر تشغيل التلاوة — احفظها للاستخدام دون إنترنت حين يتوفر الاتصال.'));
  });
}
