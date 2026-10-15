@Tags(['screenshot'])
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import '../today_screen_test.dart' show pumpApp;

/// تحميل خطوط التطبيق الحقيقية حتى تُشبه اللقطة الجهاز (الاختبارات تستخدم خطاً مربّعاً افتراضياً).
Future<void> loadFonts() async {
  final families = {
    'IBMPlexSansArabic': ['IBMPlexSansArabic-Regular', 'IBMPlexSansArabic-SemiBold', 'IBMPlexSansArabic-Bold'],
    'Amiri': ['Amiri-Regular', 'Amiri-Bold'],
    'AmiriQuran': ['AmiriQuran-Regular'],
    'MaterialIcons': [],
  };
  for (final e in families.entries) {
    final loader = FontLoader(e.key);
    for (final f in e.value) {
      loader.addFont(Future.value(ByteData.sublistView(File('assets/fonts/$f.ttf').readAsBytesSync())));
    }
    if (e.key == 'MaterialIcons') {
      final icons = File('${Platform.environment['FLUTTER_ROOT'] ?? r'C:\flutter'}/bin/cache/artifacts/material_fonts/materialicons-regular.otf');
      if (icons.existsSync()) loader.addFont(Future.value(ByteData.sublistView(icons.readAsBytesSync())));
    }
    await loader.load();
  }
}

void main() {
  setUpAll(loadFonts);
  final state = jsonEncode({
    'activeProgramId': 'foundation-7',
    'startedOn': '2026-10-13',
    'done': {'foundation-7:3:morning-bismillah-3': true, 'foundation-7:3:anytime-sayyid-istighfar': true, 'foundation-7:1:anytime-intention': true},
    'activeDays': {'2026-10-13': true, '2026-10-15': true},
    'finished': [],
  });

  shot('يومي — فاتح', (tester) async {
    await pumpApp(tester, prefs: {'sanad.companion.v1': state});
    await snap('today_light.png');
  });

  shot('يومي — مهمة مفتوحة', (tester) async {
    await pumpApp(tester, prefs: {'sanad.companion.v1': state});
    await tester.drag(find.byType(ListView).first, const Offset(0, -420));
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(of: find.byKey(const ValueKey('task-morning-muawwidhat')), matching: find.text('اقرأ')));
    await tester.pumpAndSettle();
    await snap('today_open.png');
  });

  shot('يومي — بلا برنامج', (tester) async {
    await pumpApp(tester);
    await snap('today_empty.png');
  });
}

/// الاختبارات ترسم حدّاً أسود بدل الظلال افتراضياً؛ اللقطات للمراجعة فنرسم الظل الحقيقي طوال الاختبار ثم نعيد الإعداد قبل نهايته.
void shot(String description, Future<void> Function(WidgetTester) body) {
  testWidgets(description, (tester) async {
    debugDisableShadows = false;
    try {
      await body(tester);
    } finally {
      debugDisableShadows = true;
    }
  });
}

Future<void> snap(String name) => expectLater(find.byType(MaterialApp), matchesGoldenFile(name));
