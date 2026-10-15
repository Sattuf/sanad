import 'package:flutter_riverpod/flutter_riverpod.dart';

/*
  جلسات تنتظر المذكّرة المشفّرة (الأسبوعان 4–5 في docs/flutter-app-plan.md §7).
  كالويب حين تكون المذكّرة مقفلة: تبقى في الذاكرة فقط، ولا تُكتب على الجهاز دون تشفير،
  وتُضاف إلى المذكّرة عند فتحها في هذه الجلسة — وإلا تضيع بإغلاق التطبيق.
*/
typedef PendingSession = ({String at, String kind, int before, int after});

class JournalQueue extends Notifier<List<PendingSession>> {
  @override
  List<PendingSession> build() => const [];

  void add(PendingSession s) => state = [...state, s];

  /// تأخذها المذكّرة عند فتحها.
  List<PendingSession> drain() {
    final all = state;
    state = const [];
    return all;
  }
}

final journalQueueProvider = NotifierProvider<JournalQueue, List<PendingSession>>(JournalQueue.new);
