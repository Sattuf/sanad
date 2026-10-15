// نماذج المحتوى المولَّد من packages/shared (assets/content/*.json) — ADR-0023.
// لا نصوص هنا: كل آية وذكر وبرنامج يأتي من JSON المولَّد، وأشكالها تطابق أنواع TypeScript.

class QuranPassage {
  const QuranPassage({required this.surah, required this.surahName, required this.from, required this.to, required this.ayat});

  factory QuranPassage.fromJson(Map<String, dynamic> j) => QuranPassage(
        surah: j['surah'] as int,
        surahName: j['surahName'] as String,
        from: j['from'] as int,
        to: j['to'] as int,
        ayat: (j['ayat'] as List).cast<String>(),
      );

  final int surah;
  final String surahName;
  final int from;
  final int to;
  final List<String> ayat;

  String get label => from == to ? '$surahName $from' : '$surahName $from–$to';
}

class Ayah {
  const Ayah({required this.surah, required this.ayah, required this.text});
  final int surah;
  final int ayah;
  final String text;
}

enum ItemKind { verses, dhikr, practice }

class LibraryItem {
  const LibraryItem({
    required this.id,
    required this.kind,
    required this.title,
    this.refs = const [],
    this.text,
    this.repeat,
    this.note,
    this.source,
    this.minutes,
  });

  factory LibraryItem.fromJson(Map<String, dynamic> j) => LibraryItem(
        id: j['id'] as String,
        kind: ItemKind.values.byName(j['kind'] as String),
        title: j['title'] as String,
        refs: ((j['refs'] as List?) ?? const []).cast<String>(),
        text: j['text'] as String?,
        repeat: j['repeat'] as int?,
        note: j['note'] as String?,
        source: j['source'] as String?,
        minutes: j['minutes'] as int?,
      );

  final String id;
  final ItemKind kind;
  final String title;
  final List<String> refs;
  final String? text;
  final int? repeat;
  final String? note;
  final String? source;
  final int? minutes;
}

enum Slot { morning, evening, night, anytime }

enum Tint { teal, sky, sage, sand }

class ProgramTask {
  const ProgramTask({required this.id, required this.itemId, required this.slot, this.to});

  factory ProgramTask.fromJson(Map<String, dynamic> j) => ProgramTask(
        id: j['id'] as String,
        itemId: j['itemId'] as String,
        slot: Slot.values.byName(j['slot'] as String),
        to: j['to'] as String?,
      );

  final String id;
  final String itemId;
  final Slot slot;
  final String? to;
}

class ProgramDay {
  const ProgramDay({required this.day, required this.title, required this.tasks});

  factory ProgramDay.fromJson(Map<String, dynamic> j) => ProgramDay(
        day: j['day'] as int,
        title: j['title'] as String,
        tasks: (j['tasks'] as List).map((t) => ProgramTask.fromJson(t as Map<String, dynamic>)).toList(),
      );

  final int day;
  final String title;
  final List<ProgramTask> tasks;
}

class Program {
  const Program({
    required this.id,
    required this.title,
    required this.tagline,
    required this.description,
    required this.days,
    required this.minutesPerDay,
    required this.tint,
    required this.forWhom,
    required this.plan,
  });

  factory Program.fromJson(Map<String, dynamic> j) => Program(
        id: j['id'] as String,
        title: j['title'] as String,
        tagline: j['tagline'] as String,
        description: j['description'] as String,
        days: j['days'] as int,
        minutesPerDay: j['minutesPerDay'] as int,
        tint: Tint.values.byName(j['tint'] as String),
        forWhom: j['forWhom'] as String,
        plan: (j['plan'] as List).map((d) => ProgramDay.fromJson(d as Map<String, dynamic>)).toList(),
      );

  final String id;
  final String title;
  final String tagline;
  final String description;
  final int days;
  final int minutesPerDay;
  final Tint tint;
  final String forWhom;
  final List<ProgramDay> plan;
}

class Myth {
  const Myth({
    required this.id,
    required this.title,
    required this.keywords,
    required this.verdict,
    required this.shariah,
    required this.science,
    required this.alternative,
    this.evidenceText,
    this.evidenceSource,
    this.alternativeItemId,
  });

  factory Myth.fromJson(Map<String, dynamic> j) {
    final evidence = j['evidence'] as Map<String, dynamic>?;
    return Myth(
      id: j['id'] as String,
      title: j['title'] as String,
      keywords: (j['keywords'] as List).cast<String>(),
      verdict: j['verdict'] as String,
      shariah: j['shariah'] as String,
      science: j['science'] as String,
      alternative: j['alternative'] as String,
      evidenceText: evidence?['text'] as String?,
      evidenceSource: evidence?['source'] as String?,
      alternativeItemId: j['alternativeItemId'] as String?,
    );
  }

  final String id;
  final String title;
  final List<String> keywords;
  final String verdict;
  final String shariah;
  final String science;
  final String alternative;
  final String? evidenceText;
  final String? evidenceSource;
  final String? alternativeItemId;
}

class QuizQuestion {
  const QuizQuestion({required this.id, required this.area, required this.question, required this.options, this.mythId});

  factory QuizQuestion.fromJson(Map<String, dynamic> j) => QuizQuestion(
        id: j['id'] as String,
        area: j['area'] as String,
        question: j['question'] as String,
        options: (j['options'] as List)
            .map((o) => (label: (o as Map<String, dynamic>)['label'] as String, score: o['score'] as int))
            .toList(),
        mythId: j['mythId'] as String?,
      );

  final String id;
  final String area;
  final String question;
  final List<({String label, int score})> options;
  final String? mythId;
}

typedef QuizTier = ({double minRatio, String title, String message});
typedef QuizRecommendation = ({String? zeroArea, double? minRatio, String programId, String reason});
typedef QuizResult = ({int score, String tierTitle, String tierMessage, String programId, String reason});

enum GuideMode { self, family, child }

typedef GuideModeInfo = ({GuideMode id, String title, String sub});

/// خطوة في مرشد الرقية الذاتية (guide.ts) — العناوين محسوبة لكل وضع في JSON.
class GuideStep {
  const GuideStep({required this.id, required this.title, required this.hint, this.items = const [], this.custom});

  factory GuideStep.fromJson(Map<String, dynamic> j) => GuideStep(
        id: j['id'] as String,
        title: j['title'] as String,
        hint: j['hint'] as String,
        items: ((j['items'] as List?) ?? const []).cast<String>(),
        custom: j['custom'] as String?,
      );

  final String id;
  final String title;
  final String hint;
  final List<String> items;

  /// intention | hand | nafth
  final String? custom;
}

typedef GuidePhrase = ({String text, int repeat});

/// حالة في وضع السكينة (sakina.ts): أذكارها وآياتها.
class SakinaNeed {
  const SakinaNeed({required this.id, required this.label, required this.items, required this.verses});
  final String id;
  final String label;
  final List<String> items;
  final List<String> verses;
}

typedef PacedDhikr = ({String text, String source});
