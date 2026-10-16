import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app/router.dart';
import 'content/content_repository.dart';
import 'core/platform_services.dart';
import 'features/companion/companion_store.dart';
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
  runApp(
    ProviderScope(
      overrides: [prefsProvider.overrideWithValue(prefs), contentProvider.overrideWithValue(content), reminderSchedulerProvider.overrideWithValue(reminders)],
      child: const SanadApp(),
    ),
  );
  await reminders.init();
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
