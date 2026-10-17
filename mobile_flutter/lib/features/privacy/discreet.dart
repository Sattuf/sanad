import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/platform_services.dart';
import '../companion/companion_store.dart';
import '../companion/reminders.dart';
import '../journal/journal_store.dart';

/*
  الوضع المتحفّظ — نظير stores/discreet.ts في الويب: لمن يتحرّج من ظهور كلمات مثل «رقية» على شاشته.
  يبدّل أيقونة التطبيق واسمه إلى «ملاحظاتي» (وفي المهام الأخيرة)، ويستبدل التسميات الحساسة،
  ويُظهر زر «الخروج السريع». المفتاح نفسه في الويب (sanad.discreet بقيمة JSON).
*/
const _key = 'sanad.discreet';

class DiscreetNotifier extends Notifier<bool> {
  @override
  bool build() => ref.read(prefsProvider).getString(_key) == 'true';

  Future<void> set(bool on) async {
    state = on;
    await ref.read(prefsProvider).setString(_key, on ? 'true' : 'false');
    await ref.read(privacyPlatformProvider).setNeutralIcon(on);
    await ref.read(remindersProvider.notifier).refresh();
  }
}

final discreetProvider = NotifierProvider<DiscreetNotifier, bool>(DiscreetNotifier.new);

/// تسمية بديلة في الوضع المتحفّظ (useLabel في الويب).
String discreetLabel(WidgetRef ref, String normal, String discreet) => ref.watch(discreetProvider) ? discreet : normal;

/// خروج سريع: يقفل المذكّرة، ويعيد لشاشة عادية، ويغلق التطبيق (أندرويد) — ولا يبقى ما يُرى عند فتحه.
Future<void> quickExit(WidgetRef ref, GoRouter router) async {
  ref.read(journalProvider.notifier).lock();
  router.go('/today');
  await SystemNavigator.pop();
}
