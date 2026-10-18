import 'dart:convert';

import 'package:flutter/services.dart';

import 'arabic.dart';
import 'journal.dart';
import 'ruqyah.dart';
import 'models.dart';

/// كل المحتوى والسلامة من JSON المولَّد (packages/shared ← scripts/export-dart.mjs).
/// المنطق هنا نظير TypeScript حرفياً، وتحرسه متجهات التطابق المشتركة.
class ContentRepository {
  ContentRepository._({
    required this.quran,
    required this.library,
    required this.programs,
    required this.slotLabel,
    required this.myths,
    required this.verdictLabel,
    required this.quizQuestions,
    required this.quizTiers,
    required this.quizRecommendations,
    required this.verdictTone,
    required this.mythSuggestions,
    required this.guideModes,
    required this.guideSteps,
    required this.guideNafthItemId,
    required this.intentionTips,
    required this.handItemId,
    required this.handPhrases,
    required this.sakinaNeeds,
    required this.sakinaRepeat,
    required this.pacedDhikr,
    required this.pulseSeconds,
    required this.journalMetrics,
    required this.trendDays,
    required this.trendMinEntries,
    required this.stableDelta,
    required this.strings,
    required this.account,
    required this.ruqyah,
  });

  /// من نصوص JSON (تُقرأ من الأصول في التطبيق، ومن الملفات في الاختبارات).
  factory ContentRepository.fromJson({required String quranJson, required String companionJson, required String stringsJson, required String ruqyahJson}) {
    final q = jsonDecode(quranJson) as Map<String, dynamic>;
    final c = jsonDecode(companionJson) as Map<String, dynamic>;
    final quiz = c['quiz'] as Map<String, dynamic>;
    final guide = c['guide'] as Map<String, dynamic>;
    final hand = guide['hand'] as Map<String, dynamic>;
    final sakina = c['sakina'] as Map<String, dynamic>;
    final needs = sakina['needs'] as Map<String, dynamic>;
    final journal = c['journal'] as Map<String, dynamic>;
    return ContentRepository._(
      quran: (q['passages'] as Map<String, dynamic>).map((k, v) => MapEntry(k, QuranPassage.fromJson(v as Map<String, dynamic>))),
      library: (c['library'] as Map<String, dynamic>).map((k, v) => MapEntry(k, LibraryItem.fromJson(v as Map<String, dynamic>))),
      programs: (c['programs'] as List).map((p) => Program.fromJson(p as Map<String, dynamic>)).toList(),
      slotLabel: (c['slotLabel'] as Map<String, dynamic>).map((k, v) => MapEntry(Slot.values.byName(k), v as String)),
      myths: (c['myths'] as List).map((m) => Myth.fromJson(m as Map<String, dynamic>)).toList(),
      verdictLabel: (c['verdictMeta'] as Map<String, dynamic>).map((k, v) => MapEntry(k, (v as Map<String, dynamic>)['label'] as String)),
      quizQuestions: (quiz['questions'] as List).map((x) => QuizQuestion.fromJson(x as Map<String, dynamic>)).toList(),
      quizTiers: (quiz['tiers'] as List)
          .map((t) => (
                minRatio: ((t as Map<String, dynamic>)['minRatio'] as num).toDouble(),
                title: t['title'] as String,
                message: t['message'] as String,
              ))
          .toList(),
      quizRecommendations: (quiz['recommendations'] as List)
          .map((r) => (
                zeroArea: (r as Map<String, dynamic>)['zeroArea'] as String?,
                minRatio: (r['minRatio'] as num?)?.toDouble(),
                programId: r['programId'] as String,
                reason: r['reason'] as String,
              ))
          .toList(),
      verdictTone: (c['verdictMeta'] as Map<String, dynamic>).map((k, v) => MapEntry(k, (v as Map<String, dynamic>)['tone'] as String)),
      mythSuggestions: (c['mythSuggestions'] as List).cast<String>(),
      guideModes: (guide['modes'] as List)
          .map((m) => (id: GuideMode.values.byName((m as Map<String, dynamic>)['id'] as String), title: m['title'] as String, sub: m['sub'] as String))
          .toList(),
      guideSteps: (guide['steps'] as Map<String, dynamic>).map(
        (k, v) => MapEntry(GuideMode.values.byName(k), (v as List).map((x) => GuideStep.fromJson(x as Map<String, dynamic>)).toList()),
      ),
      guideNafthItemId: guide['nafthItemId'] as String,
      intentionTips: (guide['intentionTips'] as List).cast<String>(),
      handItemId: hand['itemId'] as String,
      handPhrases: (hand['phrases'] as List).map((p) => (text: (p as Map<String, dynamic>)['text'] as String, repeat: p['repeat'] as int)).toList(),
      sakinaNeeds: [
        for (final id in (sakina['needOrder'] as List).cast<String>())
          SakinaNeed(
            id: id,
            label: (needs[id] as Map<String, dynamic>)['label'] as String,
            items: (needs[id]['items'] as List).cast<String>(),
            verses: (needs[id]['verses'] as List).cast<String>(),
          ),
      ],
      sakinaRepeat: sakina['repeat'] as int,
      pacedDhikr: (sakina['pacedDhikr'] as List).map((d) => (text: (d as Map<String, dynamic>)['text'] as String, source: d['source'] as String)).toList(),
      pulseSeconds: sakina['pulseSeconds'] as int,
      journalMetrics: (journal['metrics'] as List)
          .map((m) => (key: (m as Map<String, dynamic>)['key'] as String, label: m['label'] as String, low: m['low'] as String, high: m['high'] as String))
          .toList(),
      trendDays: journal['trendDays'] as int,
      trendMinEntries: journal['trendMinEntries'] as int,
      stableDelta: (journal['stableDelta'] as num).toDouble(),
      strings: (jsonDecode(stringsJson) as Map<String, dynamic>)['ar'] as Map<String, dynamic>,
      account: AccountStrings.fromJson((jsonDecode(stringsJson) as Map<String, dynamic>)['account'] as Map<String, dynamic>),
      ruqyah: RuqyahContent.fromJson(ruqyahJson),
    );
  }

  static Future<ContentRepository> load(AssetBundle bundle) async => ContentRepository.fromJson(
        quranJson: await bundle.loadString('assets/content/quran.json'),
        companionJson: await bundle.loadString('assets/content/companion.json'),
        stringsJson: await bundle.loadString('assets/content/strings.json'),
        ruqyahJson: await bundle.loadString('assets/content/ruqyah.json'),
      );

  final Map<String, QuranPassage> quran;
  final Map<String, LibraryItem> library;
  final List<Program> programs;
  final Map<Slot, String> slotLabel;
  final List<Myth> myths;
  final Map<String, String> verdictLabel;
  final List<QuizQuestion> quizQuestions;
  final List<QuizTier> quizTiers;
  final List<QuizRecommendation> quizRecommendations;

  /// danger | warning | neutral | success — لون شارة الحكم.
  final Map<String, String> verdictTone;
  final List<String> mythSuggestions;
  final List<GuideModeInfo> guideModes;
  final Map<GuideMode, List<GuideStep>> guideSteps;
  final String guideNafthItemId;
  final List<String> intentionTips;
  final String handItemId;
  final List<GuidePhrase> handPhrases;
  final List<SakinaNeed> sakinaNeeds;
  final int sakinaRepeat;
  final List<PacedDhikr> pacedDhikr;
  final int pulseSeconds;
  final List<JournalMetric> journalMetrics;
  final int trendDays;
  final int trendMinEntries;
  final double stableDelta;

  /// «الرقية والتحصين» والورد (ruqyah.json).
  final RuqyahContent ruqyah;

  /// تسميات الواجهة المشتركة مع الويب (packages/shared/src/i18n/ar.ts).
  final Map<String, dynamic> strings;

  /// تسميات الحساب (packages/shared/src/api/account.ts).
  final AccountStrings account;

  /// تسمية بمسارها: label('nav.login') ← «دخول».
  String label(String path) {
    Object? v = strings;
    for (final k in path.split('.')) {
      v = (v as Map<String, dynamic>)[k];
    }
    return v as String? ?? (throw StateError('تسمية غير معروفة: $path'));
  }

  LibraryItem item(String id) => library[id] ?? (throw StateError('عنصر غير معروف: $id'));

  Program? programById(String? id) {
    for (final p in programs) {
      if (p.id == id) return p;
    }
    return null;
  }

  Myth? mythById(String? id) {
    for (final m in myths) {
      if (m.id == id) return m;
    }
    return null;
  }

  List<Ayah> expandRef(String key) {
    final p = quran[key] ?? (throw StateError('مقطع غير معروف: $key'));
    return [for (var i = 0; i < p.ayat.length; i++) Ayah(surah: p.surah, ayah: p.from + i, text: p.ayat[i])];
  }

  /// بحث الميزان: الأقرب أولاً، وترتيب ثابت عند التساوي (كـ Array.sort في JS).
  List<Myth> searchMyths(String query) {
    final scored = [
      for (var i = 0; i < myths.length; i++) (myth: myths[i], score: matchScore(query, [myths[i].title, ...myths[i].keywords]), index: i),
    ].where((x) => x.score > 0).toList()
      ..sort((a, b) => b.score != a.score ? b.score.compareTo(a.score) : a.index.compareTo(b.index));
    return scored.map((x) => x.myth).toList();
  }

  int get quizMaxScore => quizQuestions.length * 2;

  QuizResult evaluateQuiz(Map<String, int> answers) {
    final score = quizQuestions.fold<int>(0, (sum, q) => sum + (answers[q.id] ?? 0));
    final ratio = score / quizMaxScore;
    final tier = quizTiers.firstWhere((t) => ratio >= t.minRatio);
    int area(String a) => quizQuestions.where((q) => q.area == a).fold<int>(0, (s, q) => s + (answers[q.id] ?? 0));
    final rec = quizRecommendations.firstWhere(
      (r) => (r.zeroArea == null || area(r.zeroArea!) == 0) && (r.minRatio == null || ratio >= r.minRatio!),
    );
    return (score: score, tierTitle: tier.title, tierMessage: tier.message, programId: rec.programId, reason: rec.reason);
  }
}

/// تاريخ محلي بصيغة YYYY-MM-DD — اليوم يتبع ساعة المستخدم لا UTC (كالويب).
String localDay([DateTime? d]) {
  final x = d ?? DateTime.now();
  return '${x.year.toString().padLeft(4, '0')}-${x.month.toString().padLeft(2, '0')}-${x.day.toString().padLeft(2, '0')}';
}

int daysBetween(String fromDay, String toDay) {
  DateTime parse(String s) {
    final p = s.split('-').map(int.parse).toList();
    return DateTime.utc(p[0], p[1], p[2]);
  }

  return (parse(toDay).difference(parse(fromDay)).inHours / 24).round();
}

/// اليوم الحالي في البرنامج حسب التقويم (يبدأ من 1، ولا يتجاوز طول البرنامج).
int currentProgramDay(String? startedOn, int length, String today) {
  if (startedOn == null) return 1;
  return (daysBetween(startedOn, today) + 1).clamp(1, length);
}

/// سجل «من اطّلع على بياناتك؟» وعبارة تأكيد حذف الحساب — من packages/shared/src/api/account.ts.
class AccountStrings {
  const AccountStrings({required this.accessLogActions, required this.accessLogRoles, required this.deleteConfirmation});

  factory AccountStrings.fromJson(Map<String, dynamic> j) => AccountStrings(
        accessLogActions: (j['accessLogActions'] as Map<String, dynamic>).cast<String, String>(),
        accessLogRoles: (j['accessLogRoles'] as Map<String, dynamic>).cast<String, String>(),
        deleteConfirmation: j['deleteConfirmation'] as String,
      );

  final Map<String, String> accessLogActions;
  final Map<String, String> accessLogRoles;
  final String deleteConfirmation;
}
