// «مذكّرتي» — نظير packages/shared/src/content/companion/journal.ts حرفياً، تحرسه متجهات journal المشتركة.
// الصيغة نفسها داخل الخزنة المشفّرة، فتُقرأ مذكّرة الويب هنا والعكس.

typedef JournalMetric = ({String key, String label, String low, String high});

class CheckIn {
  const CheckIn({required this.day, required this.calm, required this.sleep, required this.energy, required this.mood, required this.updatedAt, this.note});

  factory CheckIn.fromJson(Map<String, dynamic> j) => CheckIn(
        day: j['day'] as String,
        calm: j['calm'] as int,
        sleep: j['sleep'] as int,
        energy: j['energy'] as int,
        mood: j['mood'] as int,
        note: j['note'] as String?,
        updatedAt: j['updatedAt'] as String,
      );

  final String day;
  final int calm;
  final int sleep;
  final int energy;
  final int mood;
  final String? note;
  final String updatedAt;

  /// المقياس بمفتاحه (calm | sleep | energy | mood)، من ٠ إلى ٤.
  int operator [](String key) => switch (key) {
        'calm' => calm,
        'sleep' => sleep,
        'energy' => energy,
        'mood' => mood,
        _ => throw ArgumentError(key),
      };

  Map<String, dynamic> toJson() => {
        'day': day,
        'calm': calm,
        'sleep': sleep,
        'energy': energy,
        'mood': mood,
        if (note != null) 'note': note,
        'updatedAt': updatedAt,
      };
}

class SessionRating {
  const SessionRating({required this.at, required this.kind, required this.before, required this.after});

  factory SessionRating.fromJson(Map<String, dynamic> j) =>
      SessionRating(at: j['at'] as String, kind: j['kind'] as String, before: j['before'] as int, after: j['after'] as int);

  final String at;

  /// ruqyah | sakina
  final String kind;
  final int before;
  final int after;

  Map<String, dynamic> toJson() => {'at': at, 'kind': kind, 'before': before, 'after': after};
}

class JournalData {
  const JournalData({this.checkIns = const {}, this.sessions = const []});

  factory JournalData.fromJson(Map<String, dynamic> j) => JournalData(
        checkIns: ((j['checkIns'] as Map?) ?? const {}).map((k, v) => MapEntry(k as String, CheckIn.fromJson(v as Map<String, dynamic>))),
        sessions: ((j['sessions'] as List?) ?? const []).map((s) => SessionRating.fromJson(s as Map<String, dynamic>)).toList(),
      );

  final Map<String, CheckIn> checkIns;
  final List<SessionRating> sessions;

  Map<String, dynamic> toJson() => {
        'checkIns': {for (final e in checkIns.entries) e.key: e.value.toJson()},
        'sessions': [for (final s in sessions) s.toJson()],
      };
}

/// يوم بصيغة YYYY-MM-DD بعد n يوماً (تقويمياً).
String addDays(String day, int n) {
  final p = day.split('-').map(int.parse).toList();
  final t = DateTime.utc(p[0], p[1], p[2] + n);
  return '${t.year.toString().padLeft(4, '0')}-${t.month.toString().padLeft(2, '0')}-${t.day.toString().padLeft(2, '0')}';
}

double _avg(Iterable<int> xs) => xs.isEmpty ? double.nan : xs.fold<int>(0, (a, b) => a + b) / xs.length;

typedef Shift = ({double now, double before});

class JournalTrends {
  const JournalTrends({required this.days, required this.count, this.calm, this.sleep, this.committedCalm, this.low});

  /// الأيام الأربعة عشر، الأقدم أولاً
  final List<String> days;
  final int count;
  final Shift? calm;
  final Shift? sleep;
  final ({double committed, double other})? committedCalm;

  /// sleep | calm — تنبيه «خذ بالأسباب»
  final String? low;
}

JournalTrends journalTrends(Map<String, CheckIn> checkIns, Set<String> activeDays, String today, {int trendDays = 14}) {
  final days = [for (var i = 0; i < trendDays; i++) addDays(today, i - (trendDays - 1))];
  final withEntries = days.where(checkIns.containsKey).toList();
  List<CheckIn> of(Iterable<String> ds) => [for (final d in ds) ?checkIns[d]];
  final recent = of(days.skip(7));
  final earlier = of(days.take(7));
  final inC = of(withEntries.where(activeDays.contains));
  final outC = of(withEntries.where((d) => !activeDays.contains(d)));
  Shift? shift(String k) =>
      recent.length >= 2 && earlier.length >= 2 ? (now: _avg(recent.map((e) => e[k])), before: _avg(earlier.map((e) => e[k]))) : null;
  final all = of(withEntries);
  final lowSleep = all.length >= 10 && _avg(all.map((e) => e.sleep)) <= 1;
  final lowCalm = all.length >= 10 && _avg(all.map((e) => e.calm)) <= 1;
  return JournalTrends(
    days: days,
    count: withEntries.length,
    calm: shift('calm'),
    sleep: shift('sleep'),
    committedCalm: inC.length >= 2 && outC.length >= 2 ? (committed: _avg(inC.map((e) => e.calm)), other: _avg(outC.map((e) => e.calm))) : null,
    low: lowSleep ? 'sleep' : (lowCalm ? 'calm' : null),
  );
}

/// متوسط الفرق (بعد − قبل) لآخر عشر جلسات.
double sessionsDelta(List<SessionRating> sessions) =>
    _avg(sessions.skip(sessions.length > 10 ? sessions.length - 10 : 0).map((s) => s.after - s.before));
