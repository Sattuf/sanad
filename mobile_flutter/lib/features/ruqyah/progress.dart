import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../content/ruqyah.dart';
import '../../core/session.dart';
import '../companion/companion_store.dart';

/*
  الورد اليومي — نظير frontend/src/features/ruqyah/progress.ts:
  يُحفظ فوراً على الجهاز بمفتاح الويب نفسه، ويُدمج مع الحساب لمن سجّل دخوله (الأكبر يغلب)،
  ويُحفظ في الحساب بعد آخر نقرة بثانية — لا طلب مع كل ضغطة عدّاد. المنطق نفسه في wird.ts (تحرسه المتجهات).
*/

typedef WirdCollectionProgress = ({String collectionId, Counts counts, int completedItems, int totalItems});

class MyWird {
  const MyWird({required this.day, required this.collections, required this.streak, required this.completedDays});

  factory MyWird.fromJson(Map<String, dynamic> j) => MyWird(
        day: j['day'] as String,
        collections: [
          for (final c in (j['collections'] as List).cast<Map<String, dynamic>>())
            (
              collectionId: c['collectionId'] as String,
              counts: (c['counts'] as Map<String, dynamic>).cast<String, int>(),
              completedItems: c['completedItems'] as int,
              totalItems: c['totalItems'] as int,
            ),
        ],
        streak: j['streak'] as int,
        completedDays: (j['completedDays'] as List).cast<String>(),
      );

  final String day;
  final List<WirdCollectionProgress> collections;
  final int streak;
  final List<String> completedDays;

  WirdCollectionProgress? of(String collectionId) => collections.where((c) => c.collectionId == collectionId).firstOrNull;
}

/// الأدعية المنشورة بعد المراجعة — بلا حساب، ولا شيء بلا اتصال (النصوص الثابتة تكفي).
final publishedDuasProvider = FutureProvider<List<PublishedDua>>((ref) async {
  try {
    final list = await ref.read(apiProvider).get<List<dynamic>>('/api/v1/public/ruqyah/duas', auth: false);
    return list.map((d) => PublishedDua.fromJson(d as Map<String, dynamic>)).toList();
  } catch (_) {
    return const [];
  }
});

/// تقدّم اليوم في الحساب — null بلا جلسة أو بلا اتصال.
final myWirdProvider = FutureProvider<MyWird?>((ref) async {
  if (!ref.watch(signedInProvider)) return null;
  final day = ref.watch(todayProvider);
  try {
    return MyWird.fromJson(await ref.read(apiProvider).get<Map<String, dynamic>>('/api/v1/me/wird?day=${Uri.encodeQueryComponent(day)}'));
  } catch (_) {
    return null;
  }
});

/// النصوص الثابتة ثم الأدعية المنشورة لهذه المجموعة.
final entriesProvider = Provider.family<List<Entry>, String>((ref, collectionId) {
  final c = ref.watch(contentProvider).ruqyah.collection(collectionId)!;
  return buildEntries(c.id, c.items, ref.watch(publishedDuasProvider).value ?? const []);
});

String progressKey(String collectionId, String day) => 'sanad.ruqyah.progress.$collectionId.$day';

class DailyProgress extends Notifier<Counts> {
  DailyProgress(this.collectionId);
  final String collectionId;
  Timer? _save;
  bool _dirty = false;

  String get _key => progressKey(collectionId, ref.read(todayProvider));

  @override
  Counts build() {
    ref.onDispose(() => _save?.cancel());
    // دمج ما في الحساب مع ما في الجهاز حين يصل
    ref.listen(myWirdProvider, (_, next) {
      final server = next.value?.of(collectionId)?.counts;
      if (server != null) _set(mergeCounts(state, server), sync: false);
    });
    final raw = ref.read(prefsProvider).getString(_key);
    Counts local = const {};
    try {
      if (raw != null) local = (jsonDecode(raw) as Map<String, dynamic>).map((k, v) => MapEntry(k, (v as num).toInt()));
    } catch (_) {
      // تخزين تالف: نبدأ اليوم من جديد
    }
    return mergeCounts(local, ref.read(myWirdProvider).value?.of(collectionId)?.counts);
  }

  void _set(Counts counts, {bool sync = true}) {
    state = counts;
    ref.read(prefsProvider).setString(_key, jsonEncode(counts));
    if (!sync) return;
    _dirty = true;
    if (!ref.read(signedInProvider)) return;
    _save?.cancel();
    _save = Timer(const Duration(seconds: 1), _flush);
  }

  Future<void> _flush() async {
    if (!_dirty) return;
    _dirty = false;
    final content = ref.read(contentProvider).ruqyah;
    final entries = ref.read(entriesProvider(collectionId));
    try {
      await ref.read(apiProvider).put<Object?>(
            '/api/v1/me/wird',
            body: wirdPayload(collectionId, ref.read(todayProvider), entries, state, maxCount: content.maxCount),
          );
      ref.invalidate(myWirdProvider);
    } catch (_) {
      _dirty = true; // تُعاد المحاولة مع النقرة التالية
    }
  }

  void bump(Entry entry) => _set(bumpCount(state, entry));

  void reset() => _set(const {});
}

final dailyProgressProvider = NotifierProvider.family<DailyProgress, Counts, String>(DailyProgress.new);

/// هل أُتمّت المجموعة اليوم (من الجهاز أو الحساب)؟ — للتذكير داخل الصفحة.
bool isCompletedToday(Ref ref, String collectionId, MyWird? wird) {
  final remote = wird?.of(collectionId);
  if (remote != null && remote.totalItems > 0 && remote.completedItems >= remote.totalItems) return true;
  final c = ref.read(contentProvider).ruqyah.collection(collectionId);
  if (c == null) return false;
  final raw = ref.read(prefsProvider).getString(progressKey(collectionId, ref.read(todayProvider)));
  final local = raw == null ? const <String, dynamic>{} : jsonDecode(raw) as Map<String, dynamic>;
  return [for (final (i, it) in c.items.indexed) ((local['$i'] as num?)?.toInt() ?? 0) >= it.target].every((x) => x);
}

/// الورد الذي حان وقته ولم يُتمّ اليوم (dueWird في reminders.ts) — أو null.
final dueWirdProvider = Provider<WirdSlot?>((ref) {
  final wird = ref.watch(myWirdProvider).value;
  final slot = ref.read(contentProvider).ruqyah.slotForHour(ref.read(clockProvider)().hour);
  if (slot == null || isCompletedToday(ref, slot.collection, wird)) return null;
  return slot;
});
