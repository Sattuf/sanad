import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/audio.dart';
import '../companion/companion_store.dart';
import '../companion/reminders.dart';
import '../journal/journal_store.dart';
import '../ruqyah/ruqyah_reminders.dart';
import 'discreet.dart';

/// مسح كل بيانات سند من هذا الجهاز: المذكّرة، والتقدّم، والتذكيرات المجدولة، والوضع المتحفّظ، والتلاوات المحفوظة.
/// من «الخصوصية والتمويه»، وبعد حذف الحساب.
Future<void> wipeLocalData(WidgetRef ref) async {
  await ref.read(journalProvider.notifier).wipe();
  await ref.read(remindersProvider.notifier).cancelAll();
  await ref.read(ruqyahRemindersProvider.notifier).cancelAll();
  await ref.read(discreetProvider.notifier).set(false);
  await ref.read(prefsProvider).remove('sanad.companion.v1');
  ref.invalidate(companionProvider);
  await ref.read(recitationAudioProvider).clearCache();
}
