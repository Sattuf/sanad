import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sanad/ui/share_card.dart';

import 'today_screen_test.dart' show FakeDevice, pumpApp, reveal;
import 'vectors_test.dart' show loadContent;

final _active = jsonEncode({'activeProgramId': 'foundation-7', 'startedOn': '2026-10-14', 'done': {}, 'activeDays': {}, 'finished': []});

void main() {
  final content = loadContent();

  testWidgets('التذكير: يُجدول بعنوان محايد في الأوقات نفسها، ويُلغى بلمسة، ويُحفظ اختياره', (tester) async {
    final device = FakeDevice();
    final prefs = await pumpApp(tester, device: device, prefs: {'sanad.companion.v1': _active});
    await reveal(tester, find.text('ذكّرني كل يوم'));
    await reveal(tester, find.byKey(const ValueKey('reminder-morning')));
    await tester.tap(find.byKey(const ValueKey('reminder-morning')));
    await tester.pumpAndSettle();
    expect(device.reminders.scheduled, {1: (6, 30)});
    expect(find.text('✓ صباحاً ٦:٣٠'), findsOneWidget);
    expect(jsonDecode(prefs.getString('sanad.reminders')!), ['morning']);

    await tester.tap(find.byKey(const ValueKey('reminder-night')));
    await tester.pumpAndSettle();
    expect(device.reminders.scheduled, {1: (6, 30), 3: (22, 0)});

    await tester.tap(find.byKey(const ValueKey('reminder-morning')));
    await tester.pumpAndSettle();
    expect(device.reminders.scheduled, {3: (22, 0)});
  });

  testWidgets('رفض إذن الإشعارات: لا جدولة ورسالة تشرح', (tester) async {
    final device = FakeDevice()..reminders.grant = false;
    await pumpApp(tester, device: device, prefs: {'sanad.companion.v1': _active});
    await reveal(tester, find.byKey(const ValueKey('reminder-evening')));
    await tester.tap(find.byKey(const ValueKey('reminder-evening')));
    await tester.pumpAndSettle();
    expect(device.reminders.scheduled, isEmpty);
    await reveal(tester, find.text('لم يُسمح بالإشعارات — فعّلها لسند من إعدادات الجهاز.'));
  });

  testWidgets('بلا برنامج لا بطاقة تذكير (كالويب)', (tester) async {
    await pumpApp(tester);
    expect(find.text('ذكّرني كل يوم', skipOffstage: false), findsNothing);
  });

  testWidgets('بطاقة المشاركة: من نتيجة الاختبار، بالقالب والمقاس المختارين، صورة PNG محلية', (tester) async {
    final device = FakeDevice();
    await pumpApp(tester, location: '/awareness/quiz', device: device);
    for (var i = 0; i < content.quizQuestions.length; i++) {
      await tester.tap(find.byType(InkWell).first);
      await tester.pumpAndSettle();
      final next = find.text(i + 1 == content.quizQuestions.length ? 'اعرض نتيجتي' : 'التالي');
      await reveal(tester, next);
      await tester.tap(next);
      await tester.pumpAndSettle();
    }
    await reveal(tester, find.text('بطاقة'));
    await tester.tap(find.text('بطاقة'));
    await tester.pumpAndSettle();
    expect(find.text('بطاقة للمشاركة'), findsOneWidget);
    expect(find.byType(CustomPaint), findsWidgets);

    await tester.tap(find.text('سَحَر'));
    await tester.tap(find.text('حالة / ستوري'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('مشاركة أو حفظ الصورة'));
    // الرسم إلى صورة عمل حقيقي خارج الوقت الوهمي
    await tester.runAsync(() => Future<void>.delayed(const Duration(seconds: 2)));
    await tester.pumpAndSettle();
    final shared = device.outbound.shared.single;
    expect((shared.name, shared.mimeType), ('sanad-card.png', 'image/png'));
    expect(shared.bytes.sublist(1, 4), utf8.encode('PNG'));
  });

  testWidgets('زر البطاقة على الذكر وعلى الممارسة في الميزان', (tester) async {
    await pumpApp(tester, location: '/awareness');
    await tester.tap(find.text(content.mythSuggestions.first));
    await tester.pumpAndSettle();
    await reveal(tester, find.text('بطاقة'));
    expect(find.byType(ShareButton), findsOneWidget);
  });
}
