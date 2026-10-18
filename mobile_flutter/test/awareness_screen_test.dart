import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sanad/content/arabic.dart';
import 'package:sanad/ui/components.dart';

import 'today_screen_test.dart' show pumpApp, reveal, toTop;
import 'vectors_test.dart' show loadContent;

void main() {
  final content = loadContent();

  testWidgets('الميزان: كل الممارسات، والتصفية بالحكم', (tester) async {
    await pumpApp(tester, location: '/awareness');
    expect(find.text('ميزان الوعي: هل هذا صحيح؟'), findsOneWidget);
    for (final m in content.myths) {
      await reveal(tester, find.text(m.title));
    }

    await toTop(tester);
    await reveal(tester, find.text(content.verdictLabel['legit']!).first);
    await tester.tap(find.text(content.verdictLabel['legit']!).first);
    await tester.pumpAndSettle();
    final legit = content.myths.where((m) => m.verdict == 'legit').toList();
    expect(find.byType(MythCard, skipOffstage: false), findsNWidgets(legit.length));
    for (final m in legit) {
      expect(find.text(m.title, skipOffstage: false), findsOneWidget);
    }
  });

  testWidgets('اقتراح البحث: النتيجة الأولى مفتوحة بحكمها ودليلها وبديلها', (tester) async {
    await pumpApp(tester, location: '/awareness');
    await tester.tap(find.text(content.mythSuggestions.first));
    await tester.pumpAndSettle();
    final m = content.searchMyths(content.mythSuggestions.first).first;
    await reveal(tester, find.text(m.title));
    await reveal(tester, find.text('الحكم الشرعي'));
    await reveal(tester, find.text(m.shariah));
    if (m.evidenceText != null) await reveal(tester, find.text(m.evidenceText!));
    await reveal(tester, find.text(m.science));
    await reveal(tester, find.text(m.alternative));
    expect(find.byType(VerdictBadge, skipOffstage: false), findsWidgets);

    // البطاقة تنطوي باللمس
    await toTop(tester);
    await reveal(tester, find.text(m.title));
    await tester.tap(find.text(m.title));
    await tester.pumpAndSettle();
    expect(find.text('الحكم الشرعي', skipOffstage: false), findsNothing);
  });

  testWidgets('لا نتيجة: القاعدة العامة بدل قائمة فارغة', (tester) async {
    await pumpApp(tester, location: '/awareness');
    await tester.enterText(find.byType(TextField), 'كلمة لا علاقة لها إطلاقاً xyz');
    await tester.pumpAndSettle();
    expect(find.byType(MythCard, skipOffstage: false), findsNothing);
    await reveal(tester, find.text('لم نجد هذه الممارسة في الميزان بعد'));
  });

  testWidgets('الاختبار: إجابة كل سؤال تُظهر تعقيباً، والنتيجة تقترح برنامجاً وتُحفظ', (tester) async {
    final prefs = await pumpApp(tester, location: '/awareness/quiz');
    final answers = <String, int>{};
    for (var i = 0; i < content.quizQuestions.length; i++) {
      final q = content.quizQuestions[i];
      expect(find.text('السؤال ${arNum(i + 1)} من ${arNum(content.quizQuestions.length)}'), findsOneWidget);
      expect(find.text(q.question), findsOneWidget);
      final o = q.options.first;
      answers[q.id] = o.score;
      await reveal(tester, find.text(o.label));
      await tester.tap(find.text(o.label));
      await tester.pumpAndSettle();
      final myth = content.mythById(q.mythId);
      if (myth != null) await reveal(tester, find.text('${content.verdictLabel[myth.verdict]}: ${myth.title}'));
      final next = find.text(i + 1 == content.quizQuestions.length ? 'اعرض نتيجتي' : 'التالي');
      await reveal(tester, next);
      await tester.tap(next);
      await tester.pumpAndSettle();
    }

    final r = content.evaluateQuiz(answers);
    final program = content.programById(r.programId)!;
    expect(find.text(r.tierTitle), findsOneWidget);
    expect(find.text('${arNum(r.score)} من ${arNum(content.quizMaxScore)}'), findsOneWidget);
    await reveal(tester, find.text(program.title));
    await reveal(tester, find.text(r.reason));
    final saved = jsonDecode(prefs.getString('sanad.companion.v1')!) as Map<String, dynamic>;
    expect(saved['quiz'], {'score': r.score, 'programId': r.programId, 'at': '2026-10-15'});

    await reveal(tester, find.text('اطّلع على البرنامج وابدأ'));
    await tester.tap(find.text('اطّلع على البرنامج وابدأ'));
    await tester.pumpAndSettle();
    expect(find.text(program.description), findsOneWidget);
  });

  testWidgets('خيار الاختبار يُقفل بعد الإجابة', (tester) async {
    await pumpApp(tester, location: '/awareness/quiz');
    final q = content.quizQuestions.first;
    await tester.tap(find.text(q.options.first.label));
    await tester.pumpAndSettle();
    await tester.tap(find.text(q.options.last.label), warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(find.text('السؤال ١ من ${arNum(content.quizQuestions.length)}'), findsOneWidget);
    await reveal(tester, find.text('التالي'));
  });
}
