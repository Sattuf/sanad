@Tags(['screenshot'])
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../today_screen_test.dart' show pumpApp, reveal;
import 'today_screenshot_test.dart' show loadFonts, shot, snap;

/// لقطات مراجعة لشاشات الرفيق (الأسبوعان 2–3) — تُقارن جنباً إلى جنب مع صفحات الويب بعرض الجوال.
void main() {
  setUpAll(loadFonts);
  final active = jsonEncode({
    'activeProgramId': 'foundation-7',
    'startedOn': '2026-10-13',
    'done': {'foundation-7:1:anytime-intention': true, 'foundation-7:1:morning-bismillah-3': true},
    'activeDays': {'2026-10-13': true},
    'finished': ['calm-heart-10'],
  });

  Future<void> next(WidgetTester tester) async {
    await tester.tap(find.text('الخطوة التالية'));
    await tester.pumpAndSettle();
  }

  shot('البرامج — فاتح', (tester) async {
    await pumpApp(tester, location: '/programs', prefs: {'sanad.companion.v1': active});
    await snap('programs_light.png');
  });

  shot('البرامج — ليلي', (tester) async {
    await pumpApp(tester, location: '/programs', dark: true);
    await snap('programs_dark.png');
  });

  shot('صفحة البرنامج — قبل البدء', (tester) async {
    await pumpApp(tester, location: '/programs/self-ruqyah-21');
    await snap('program_detail.png');
  });

  shot('صفحة البرنامج — الجاري مع خريطة الأيام', (tester) async {
    await pumpApp(tester, location: '/programs/foundation-7', prefs: {'sanad.companion.v1': active});
    await reveal(tester, find.text('خريطة الأيام'));
    await snap('program_detail_active.png');
  });

  shot('المرشد — اختيار الوضع', (tester) async {
    await pumpApp(tester, location: '/self-ruqyah');
    await snap('self_ruqyah_modes.png');
  });

  shot('المرشد — وضع اليد', (tester) async {
    await pumpApp(tester, location: '/self-ruqyah');
    await reveal(tester, find.byKey(const ValueKey('mode-self')));
    await tester.tap(find.byKey(const ValueKey('mode-self')));
    await tester.pumpAndSettle();
    await next(tester);
    await snap('self_ruqyah_hand.png');
  });

  shot('المرشد — الفاتحة بالتلاوة', (tester) async {
    await pumpApp(tester, location: '/self-ruqyah');
    await reveal(tester, find.byKey(const ValueKey('mode-self')));
    await tester.tap(find.byKey(const ValueKey('mode-self')));
    await tester.pumpAndSettle();
    await next(tester);
    await next(tester);
    await snap('self_ruqyah_fatiha.png');
  });

  shot('الميزان — نتيجة بحث مفتوحة', (tester) async {
    await pumpApp(tester, location: '/awareness');
    await tester.tap(find.text('ملح الهملايا'));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -330));
    await tester.pumpAndSettle();
    await snap('awareness_search.png');
  });

  shot('الاختبار — تعقيب بعد الإجابة', (tester) async {
    await pumpApp(tester, location: '/awareness/quiz');
    await tester.tap(find.byType(InkWell).at(1));
    await tester.pumpAndSettle();
    await snap('quiz_feedback.png');
  });

  shot('الاختبار — النتيجة', (tester) async {
    await pumpApp(tester, location: '/awareness/quiz');
    for (var i = 0; i < 9; i++) {
      await tester.tap(find.byType(InkWell).first);
      await tester.pumpAndSettle();
      final next = find.text(i == 8 ? 'اعرض نتيجتي' : 'التالي');
      await reveal(tester, next);
      await tester.tap(next);
      await tester.pumpAndSettle();
    }
    await snap('quiz_result.png');
  });

  shot('السكينة', (tester) async {
    await pumpApp(tester, location: '/sakina', reduceMotion: true);
    await tester.tap(find.byKey(const ValueKey('paced-dhikr')));
    await tester.tap(find.byKey(const ValueKey('paced-dhikr')));
    await tester.pumpAndSettle();
    await snap('sakina.png');
  });

  shot('السكينة — أسفل الشاشة', (tester) async {
    await pumpApp(tester, location: '/sakina?for=sleep', reduceMotion: true);
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -600));
    await tester.pumpAndSettle();
    await snap('sakina_sleep.png');
  });
}
