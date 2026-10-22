import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:just_audio_background/just_audio_background.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app/router.dart';
import 'content/content_repository.dart';
import 'core/platform_services.dart';
import 'core/session.dart';
import 'features/care/realtime.dart';
import 'features/companion/companion_store.dart';
import 'features/companion/reminders.dart';
import 'features/ruqyah/ruqyah_reminders.dart';
import 'features/privacy/discreet.dart';
import 'theme/theme.dart';

/// سند — رفيق السكينة اليومي (ADR-0023). العربية وRTL افتراضياً ووحيدة، كالويب.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await startApp();
}

var _audioReady = false;

/// يبني الحاوية بخدمات الجهاز الحقيقية ويشغّل التطبيق. اختبارات integration_test تستدعيه مرة أخرى لمحاكاة إعادة الفتح،
/// ومع [overrides] لحقن جلسة أو خادم آخر — فالمسار هو نفسه الذي يمر به المستخدم.
Future<ProviderContainer> startApp({List<Override> overrides = const []}) async {
  // التلاوة تستمر والشاشة مقفلة: خدمة وسائط أمامية بإشعار تحكّم، والأيقونة المحايدة دائماً.
  // تبقى الخدمة في المقدّمة عند الإيقاف المؤقت: انتهاء كل آية يُبلَّغ «متوقفاً» حتى تبدأ التالية، ولو خرجت الخدمة
  // من المقدّمة في هذه الفجوة لقطع النظام الشبكة عن التطبيق والشاشة مقفلة فتعلق الآية التالية. الإيقاف التام يزيل الإشعار.
  if (!_audioReady) {
    await JustAudioBackground.init(
      androidNotificationChannelId: 'app.sanad.playback',
      androidNotificationChannelName: 'التشغيل الصوتي',
      androidNotificationIcon: 'drawable/ic_stat_notes',
      androidStopForegroundOnPause: false,
    );
    _audioReady = true; // مرة واحدة لكل عملية
  }
  final (prefs, content) = (await SharedPreferences.getInstance(), await ContentRepository.load(rootBundle));
  // رمز التحديث من Keychain/Keystore قبل أول إطار: الجلسة تُستعاد صامتاً بأول طلب
  final refreshStore = SecureRefreshTokenStore();
  final refreshToken = await refreshStore.read();
  final reminders = DeviceReminderScheduler();
  // لمس التذكير يفتح صفحته («يومي» أو الورد نفسه)
  DeviceReminderScheduler.onOpen = router.go;
  final container = ProviderContainer(
    overrides: [
      prefsProvider.overrideWithValue(prefs),
      contentProvider.overrideWithValue(content),
      reminderSchedulerProvider.overrideWithValue(reminders),
      refreshTokenStoreProvider.overrideWithValue(refreshStore),
      initialRefreshTokenProvider.overrideWithValue(refreshToken),
      ...overrides,
    ],
  );
  runApp(UncontrolledProviderScope(container: container, child: const SanadApp()));
  // الوضع المتحفّظ محفوظ: نعيد ضبط الأيقونة في المهام الأخيرة بعد كل تشغيل
  final discreet = container.read(discreetProvider);
  await container.read(privacyPlatformProvider).setNeutralIcon(discreet);
  await reminders.init();
  await container.read(remindersProvider.notifier).refresh();
  await container.read(ruqyahRemindersProvider.notifier).refresh();
  return container;
}

class SanadApp extends ConsumerWidget {
  const SanadApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // الوقت الفعلي ما دامت الجلسة قائمة (يُغلق عند الخروج)
    ref.watch(realtimeProvider);
    return MaterialApp.router(
        // اسم التطبيق في المهام الأخيرة — محايد في الوضع المتحفّظ
        title: ref.watch(discreetProvider) ? 'ملاحظاتي' : 'سند',
        debugShowCheckedModeBanner: false,
        locale: const Locale('ar'),
        supportedLocales: const [Locale('ar')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        theme: buildTheme(Brightness.light),
        darkTheme: buildTheme(Brightness.dark),
        routerConfig: router,
      );
  }
}
