import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:sanad/content/arabic.dart';

import 'today_screen_test.dart' show pumpApp, reveal;
import 'vectors_test.dart' show loadContent;

String state({String? active, String? startedOn, Map<String, bool> done = const {}, List<String> finished = const [], Object? quiz}) => jsonEncode({
      'activeProgramId': active,
      'startedOn': startedOn,
      'done': done,
      'activeDays': {},
      'finished': finished,
      'quiz': quiz,
    });

void main() {
  final content = loadContent();

  testWidgets('القائمة: كل البرامج من المحتوى، ودعوة الاختبار قبل إجرائه', (tester) async {
    await pumpApp(tester, location: '/programs');
    expect(find.text('برامج الالتزام'), findsWidgets);
    expect(find.text('لا تعرف من أين تبدأ؟'), findsOneWidget);
    expect(find.textContaining('اختبار وعي من ${arNum(content.quizQuestions.length)} أسئلة'), findsOneWidget);
    for (final p in content.programs) {
      await reveal(tester, find.text(p.tagline));
      expect(find.text(p.title), findsWidgets);
    }
  });

  testWidgets('القائمة: شارة البرنامج الحالي وما أُتمّ، ولا دعوة للاختبار بعد إجرائه', (tester) async {
    await pumpApp(tester, location: '/programs', prefs: {
      'sanad.companion.v1': state(
        active: 'foundation-7',
        startedOn: '2026-10-15',
        finished: [content.programs.last.id],
        quiz: {'score': 12, 'programId': 'foundation-7', 'at': '2026-10-14'},
      ),
    });
    expect(find.text('لا تعرف من أين تبدأ؟'), findsNothing);
    expect(find.text('برنامجك الحالي'), findsOneWidget);
    final semantics = tester.ensureSemantics();
    await tester.pump();
    expect(find.bySemanticsLabel(RegExp('تقدّم ${content.programById('foundation-7')!.title}')), findsOneWidget);
    semantics.dispose();
    await reveal(tester, find.text('أتممته ✓'));
  });

  testWidgets('التفاصيل ثم البدء: يُحفظ البرنامج بصيغة الويب ويُفتح «يومي»', (tester) async {
    final p = content.programs[1];
    final prefs = await pumpApp(tester, location: '/programs');
    await reveal(tester, find.text(p.tagline));
    await tester.tap(find.text(p.tagline));
    await tester.pumpAndSettle();

    expect(find.text(p.description), findsOneWidget);
    await reveal(tester, find.text('${arNum(p.days)} يوماً'));
    expect(find.text('يُحفظ تقدّمك على جهازك فقط — بلا حساب ولا تسجيل.'), findsOneWidget);
    await reveal(tester, find.text('نموذج من اليوم الأول: ${p.plan.first.title}'));
    await reveal(tester, find.text(content.item(p.plan.first.tasks.last.itemId).title));

    await tester.tap(find.text('ابدأ البرنامج اليوم'));
    await tester.pumpAndSettle();
    final saved = jsonDecode(prefs.getString('sanad.companion.v1')!) as Map<String, dynamic>;
    expect(saved['activeProgramId'], p.id);
    expect(saved['startedOn'], '2026-10-15');
    expect(find.textContaining('${p.title} · اليوم ١ من ${arNum(p.days)}'), findsOneWidget);
  });

  testWidgets('برنامج قائم آخر: يُطلب التأكيد قبل التبديل', (tester) async {
    final other = content.programs[2];
    await pumpApp(tester, location: '/programs/${other.id}', prefs: {'sanad.companion.v1': state(active: 'foundation-7', startedOn: '2026-10-13')});
    expect(find.textContaining('لديك برنامج قائم: ${content.programById('foundation-7')!.title}'), findsOneWidget);
    expect(find.text('ابدأ البرنامج اليوم'), findsNothing);
    await tester.tap(find.text('بدّل إلى هذا البرنامج'));
    await tester.pumpAndSettle();
    expect(find.text('ابدأ البرنامج اليوم'), findsOneWidget);
  });

  testWidgets('البرنامج الحالي: اليوم والنسبة ومتابعة اليوم، وخريطة الأيام تعلّم المكتمل', (tester) async {
    final f = content.programById('foundation-7')!;
    final day1 = {for (final t in f.plan.first.tasks) 'foundation-7:1:${t.id}': true};
    await pumpApp(tester, location: '/programs/foundation-7', prefs: {'sanad.companion.v1': state(active: 'foundation-7', startedOn: '2026-10-13', done: day1)});
    expect(find.text('أنت في اليوم ٣ من ٧.'), findsOneWidget);
    final semantics = tester.ensureSemantics();
    await reveal(tester, find.text('خريطة الأيام'));
    expect(find.bySemanticsLabel(RegExp('اليوم 1: ${f.plan.first.title} — مكتمل')), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('اليوم 2: ${f.plan[1].title}\$')), findsOneWidget);
    semantics.dispose();
    await tester.tap(find.text('متابعة اليوم'));
    await tester.pumpAndSettle();
    expect(find.textContaining('اليوم ٣ من ٧'), findsOneWidget);
  });

  testWidgets('معرّف غير موجود: صفحة «غير موجودة»', (tester) async {
    await pumpApp(tester, location: '/programs/nope');
    expect(find.text('الصفحة غير موجودة'), findsOneWidget);
  });
}
