import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sanad/app/router.dart';
import 'package:sanad/features/companion/companion_store.dart';
import 'package:sanad/theme/theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'vectors_test.dart' show loadContent;

Future<SharedPreferences> pumpApp(WidgetTester tester, {Map<String, Object> prefs = const {}, String today = '2026-10-15'}) async {
  SharedPreferences.setMockInitialValues(prefs);
  final p = await SharedPreferences.getInstance();
  tester.view.physicalSize = const Size(1170, 2532);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [prefsProvider.overrideWithValue(p), contentProvider.overrideWithValue(loadContent()), todayProvider.overrideWithValue(today)],
      child: MaterialApp.router(
        debugShowCheckedModeBanner: false,
        locale: const Locale('ar'),
        theme: buildTheme(Brightness.light),
        routerConfig: router,
        builder: (context, child) => Directionality(textDirection: TextDirection.rtl, child: child!),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return p;
}

void main() {
  testWidgets('بلا برنامج: دعوة للبدء، والبدء يعرض مهام اليوم الأول', (tester) async {
    await pumpApp(tester);
    expect(find.text('ابدأ رحلتك بخطوة صغيرة'), findsOneWidget);

    await tester.tap(find.text('ابدأ بـ«أساس التحصين» (٧ أيام)'));
    await tester.pumpAndSettle();
    expect(find.text('النية قبل العمل'), findsOneWidget);
    expect(find.textContaining('أساس التحصين · اليوم ١ من ٧'), findsOneWidget);
    expect(find.text('الصباح'), findsOneWidget);
    expect(find.text('ذكر الحفظ'), findsOneWidget);
  });

  testWidgets('إنجاز مهمة يُحفظ بصيغة الويب نفسها (sanad.companion.v1)', (tester) async {
    final p = await pumpApp(tester, prefs: {
      'sanad.companion.v1': jsonEncode({'activeProgramId': 'foundation-7', 'startedOn': '2026-10-14', 'done': {}, 'activeDays': {}, 'finished': []}),
    });
    expect(find.textContaining('اليوم ٢ من ٧'), findsOneWidget);

    await tester.tap(find.descendant(of: find.byKey(const ValueKey('task-morning-bismillah-3')), matching: find.byKey(const ValueKey('check'))));
    await tester.pumpAndSettle();

    final saved = jsonDecode(p.getString('sanad.companion.v1')!) as Map<String, dynamic>;
    expect((saved['done'] as Map).keys, contains('foundation-7:2:morning-bismillah-3'));
    expect((saved['activeDays'] as Map).keys, ['2026-10-15']);
    expect(find.text('١'), findsWidgets); // أيام الالتزام
  });

  testWidgets('«اقرأ» يعرض نص الذكر ومصدره من المحتوى المولَّد', (tester) async {
    await pumpApp(tester, prefs: {
      'sanad.companion.v1': jsonEncode({'activeProgramId': 'foundation-7', 'startedOn': '2026-10-15', 'done': {}, 'activeDays': {}, 'finished': []}),
    });
    await tester.drag(find.byType(ListView).first, const Offset(0, -300)); // بعيداً عن زر السكينة العائم
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(of: find.byKey(const ValueKey('task-morning-bismillah-3')), matching: find.text('اقرأ')));
    await tester.pumpAndSettle();
    expect(find.text(loadContent().item('bismillah-3').text!), findsOneWidget);
    expect(find.textContaining('سنن أبي داود (5088)'), findsOneWidget);
  });
}
