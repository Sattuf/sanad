// متجهات التطابق المشتركة مع الويب (packages/shared/test-vectors) — ADR-0023.
// يشغّل Vitest الملف نفسه على TypeScript؛ أي اختلاف بين الطرفين = اختبار فاشل.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sanad/content/arabic.dart';
import 'package:sanad/content/content_repository.dart';
import 'package:sanad/content/journal.dart';

ContentRepository loadContent() => ContentRepository.fromJson(
      quranJson: File('assets/content/quran.json').readAsStringSync(),
      companionJson: File('assets/content/companion.json').readAsStringSync(),
      safetyJson: File('assets/content/safety.json').readAsStringSync(),
    );

void main() {
  final v = jsonDecode(File('../packages/shared/test-vectors/companion.json').readAsStringSync()) as Map<String, dynamic>;
  final content = loadContent();

  group('توحيد العربية', () {
    for (final pair in (v['normalize'] as List).cast<List>()) {
      test(pair[0] as String, () => expect(normalizeArabic(pair[0] as String), pair[1]));
    }
  });

  group('كشف الخطر (البند 5)', () {
    final risk = v['risk'] as Map<String, dynamic>;
    for (final t in (risk['positive'] as List).cast<String>()) {
      test('خطر: $t', () => expect(content.requiresEmergencyReferral(t), isTrue));
    }
    for (final t in (risk['negative'] as List).cast<String>()) {
      test('آمن: $t', () => expect(content.requiresEmergencyReferral(t), isFalse));
    }
  });

  group('ميزان الوعي', () {
    for (final c in (v['mythSearch'] as List).cast<Map<String, dynamic>>()) {
      test(c['query'] as String, () {
        final r = content.searchMyths(c['query'] as String);
        expect(r.isEmpty ? null : r.first.id, c['first']);
      });
    }
  });

  group('اختبر وعيك', () {
    Map<String, int> expand(Object spec) {
      final ids = content.quizQuestions.map((q) => q.id);
      if (spec is String) return {for (final id in ids) id: int.parse(spec.split('-')[1])};
      final m = (spec as Map<String, dynamic>).cast<String, int>();
      return {for (final id in ids) id: m['base']!, ...m..remove('base')};
    }

    for (final c in (v['quiz'] as List).cast<Map<String, dynamic>>()) {
      test('${c['answers']}', () {
        final r = content.evaluateQuiz(expand(c['answers'] as Object));
        expect([r.score, r.tierTitle, r.programId], [c['score'], c['tier'], c['programId']]);
      });
    }
  });

  group('يوم البرنامج', () {
    for (final c in (v['programDay'] as List).cast<Map<String, dynamic>>()) {
      test('${c['startedOn']} ← ${c['today']}', () {
        expect(currentProgramDay(c['startedOn'] as String?, c['length'] as int, c['today'] as String), c['day']);
      });
    }
  });

  group('مذكّرتي', () {
    final j = v['journal'] as Map<String, dynamic>;
    Object? norm(Object? x) => x is double && x == x.roundToDouble() ? x.toInt() : x; // JSON يكتب 3.0 كـ 3
    for (final c in (j['trends'] as List).cast<Map<String, dynamic>>()) {
      test('اتجاه: ${c['name']}', () {
        final checkIns = (c['checkIns'] as Map<String, dynamic>).map((k, x) => MapEntry(k, CheckIn.fromJson(x as Map<String, dynamic>)));
        final tr = journalTrends(checkIns, (c['activeDays'] as Map<String, dynamic>).keys.toSet(), c['today'] as String);
        final e = c['expect'] as Map<String, dynamic>;
        Map<String, Object?>? shift(Shift? s) => s == null ? null : {'now': norm(s.now), 'before': norm(s.before)};
        expect({
          'days': tr.days,
          'count': tr.count,
          'calm': shift(tr.calm),
          'sleep': shift(tr.sleep),
          'committedCalm': tr.committedCalm == null ? null : {'committed': norm(tr.committedCalm!.committed), 'other': norm(tr.committedCalm!.other)},
          'low': tr.low,
        }, e);
      });
    }
    test('متوسط فرق الجلسات', () {
      final s = j['sessionsDelta'] as Map<String, dynamic>;
      final sessions = (s['sessions'] as List).map((x) => SessionRating.fromJson(x as Map<String, dynamic>)).toList();
      expect(sessionsDelta(sessions), s['expect']);
    });
  });

  test('كل مهمة في كل برنامج تشير لعنصر موجود، وكل آية لها نص', () {
    for (final p in content.programs) {
      expect(p.plan, hasLength(p.days));
      for (final d in p.plan) {
        for (final t in d.tasks) {
          final it = content.item(t.itemId);
          for (final r in it.refs) {
            expect(content.expandRef(r), isNotEmpty);
          }
        }
      }
    }
  });
}
