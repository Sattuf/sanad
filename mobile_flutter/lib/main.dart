import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app/router.dart';
import 'content/content_repository.dart';
import 'core/platform_services.dart';
import 'features/companion/companion_store.dart';
import 'features/companion/reminders.dart';
import 'features/privacy/discreet.dart';
import 'theme/theme.dart';
import 'ui/emergency.dart';

/// سند — رفيق السكينة اليومي (ADR-0023). العربية وRTL افتراضياً ووحيدة، كالويب.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final (prefs, content) = (await SharedPreferences.getInstance(), await ContentRepository.load(rootBundle));
  final reminders = DeviceReminderScheduler();
  // لمس تذكير «وِرد اليوم» يفتح «يومي»
  DeviceReminderScheduler.onOpen = () => router.go('/today');
  final container = ProviderContainer(
    overrides: [prefsProvider.overrideWithValue(prefs), contentProvider.overrideWithValue(content), reminderSchedulerProvider.overrideWithValue(reminders)],
  );
  runApp(UncontrolledProviderScope(container: container, child: const SanadApp()));
  // الوضع المتحفّظ محفوظ: نعيد ضبط الأيقونة في المهام الأخيرة بعد كل تشغيل
  final discreet = container.read(discreetProvider);
  await container.read(privacyPlatformProvider).setNeutralIcon(discreet);
  await reminders.init();
  await container.read(remindersProvider.notifier).refresh();
}

class SanadApp extends ConsumerWidget {
  const SanadApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => MaterialApp.router(
        // اسم التطبيق في المهام الأخيرة — محايد في الوضع المتحفّظ
        title: ref.watch(discreetProvider) ? 'ملاحظاتي' : 'سند',
        debugShowCheckedModeBanner: false,
        locale: const Locale('ar'),
        supportedLocales: const [Locale('ar')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        theme: buildTheme(Brightness.light),
        darkTheme: buildTheme(Brightness.dark),
        routerConfig: router,
        builder: (context, child) => EmergencyOverlay(child: child!),
      );
}
