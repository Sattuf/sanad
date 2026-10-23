import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/audio.dart';
import '../companion/companion_store.dart';
import '../companion/reminders.dart';
import '../journal/journal_store.dart';
import '../ruqyah/progress.dart';
import '../ruqyah/ruqyah_reminders.dart';
import 'discreet.dart';

/// مسح كل بيانات سند من هذا الجهاز: المذكّرة، والتقدّم (البرامج والورد)، والتذكيرات المجدولة، والوضع المتحفّظ،
/// واختيار القارئ وحجم الخط، والتلاوات المحفوظة.
/// من «الخصوصية والتمويه»، وبعد حذف الحساب.
Future<void> wipeLocalData(WidgetRef ref) async {
  await ref.read(journalProvider.notifier).wipe();
  await ref.read(remindersProvider.notifier).cancelAll();
  await ref.read(ruqyahRemindersProvider.notifier).cancelAll();
  await ref.read(discreetProvider.notifier).set(false);
  final prefs = ref.read(prefsProvider);
  await prefs.remove('sanad.companion.v1');
  ref.invalidate(companionProvider);
  // عدّاد الورد اليومي واختيار القارئ وحجم الخط — تقدّم وتفضيلات تكشف الاستخدام أيضاً
  for (final key in prefs.getKeys().where((k) => k.startsWith('sanad.ruqyah.progress.') || k == 'sanad.ruqyah.reciter' || k == 'sanad.ruqyah.fontScale').toList()) {
    await prefs.remove(key);
  }
  ref.invalidate(dailyProgressProvider);
  await ref.read(recitationAudioProvider).clearCache();
}
