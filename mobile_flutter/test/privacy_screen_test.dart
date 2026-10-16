import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sanad/app/router.dart';
import 'package:sanad/core/vault.dart';
import 'package:sanad/features/journal/journal_store.dart';

import 'today_screen_test.dart' show FakeAudio, FakeDevice, pumpApp, reveal;

void main() {
  testWidgets('الوضع المتحفّظ: أيقونة «ملاحظاتي» وتسميات محايدة وزر الخروج السريع، ويُحفظ بمفتاح الويب', (tester) async {
    final device = FakeDevice();
    final prefs = await pumpApp(tester, location: '/privacy-mode', device: device);
    expect(find.text('الخصوصية والتمويه'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('discreet')));
    await tester.pumpAndSettle();
    expect(device.privacy.calls, contains(('setNeutralIcon', true)));
    expect(prefs.getString('sanad.discreet'), 'true');

    router.go('/today');
    await tester.pumpAndSettle();
    expect(find.text('الأذكار'), findsOneWidget);
    expect(find.text('الرقية'), findsNothing);
    await reveal(tester, find.text('جلسة'));
    expect(find.byKey(const ValueKey('quick-exit')), findsOneWidget);
  });

  testWidgets('الخروج السريع يقفل المذكّرة ويعود لـ«يومي» ويغلق التطبيق', (tester) async {
    final calls = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      calls.add(call.method);
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    await pumpApp(tester, location: '/awareness', prefs: {'sanad.discreet': 'true'});
    final container = ProviderScope.containerOf(tester.element(find.byType(MaterialApp)));
    await tester.runAsync(() => container.read(journalProvider.notifier).create('1234'));
    expect(container.read(journalProvider).unlocked, isTrue);

    await tester.tap(find.byKey(const ValueKey('quick-exit')));
    await tester.pumpAndSettle();
    expect(container.read(journalProvider).unlocked, isFalse);
    expect(find.text('ابدأ رحلتك بخطوة صغيرة'), findsOneWidget);
    expect(calls, contains('SystemNavigator.pop'));
  });

  testWidgets('خارج الوضع المتحفّظ لا زر خروج والتسميات كما هي', (tester) async {
    await pumpApp(tester);
    expect(find.byKey(const ValueKey('quick-exit')), findsNothing);
    expect(find.text('الرقية'), findsOneWidget);
  });

  testWidgets('مسح كل البيانات: المذكّرة والتقدّم والتذكير والتلاوات والوضع المتحفّظ', (tester) async {
    final device = FakeDevice();
    final audio = FakeAudio(cached: {'a'});
    device.reminders.scheduled[1] = (6, 30);
    final prefs = await pumpApp(tester, location: '/privacy-mode', device: device, audio: audio, prefs: {
      'sanad.discreet': 'true',
      'sanad.reminders': jsonEncode(['morning']),
      'sanad.companion.v1': jsonEncode({'activeProgramId': 'foundation-7', 'startedOn': '2026-10-14', 'done': {}, 'activeDays': {}, 'finished': []}),
    });
    final container = ProviderScope.containerOf(tester.element(find.byType(MaterialApp)));
    await tester.runAsync(() => container.read(journalProvider.notifier).create('1234'));

    await reveal(tester, find.text('مسح…'));
    await tester.tap(find.text('مسح…'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('تأكيد المسح النهائي'));
    await tester.pump();
    await tester.pump();
    expect(find.text('مُسحت البيانات المحلية.'), findsOneWidget);
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();

    expect(prefs.getString(vaultKey), isNull);
    expect(prefs.getString('sanad.companion.v1'), isNull);
    expect(prefs.getString('sanad.discreet'), 'false');
    expect(device.reminders.scheduled, isEmpty);
    expect(device.privacy.calls, contains(('setNeutralIcon', false)));
    expect(audio.cached, isEmpty);
    expect(find.text('ابدأ رحلتك بخطوة صغيرة'), findsOneWidget);
  });

  testWidgets('حسابي يربط المذكّرة والخصوصية حتى تُبنى بقية الصفحة', (tester) async {
    await pumpApp(tester, location: '/account');
    await tester.tap(find.text('الخصوصية والتمويه'));
    await tester.pumpAndSettle();
    expect(find.text('أين تُحفظ بياناتك؟'), findsOneWidget);
  });
}
