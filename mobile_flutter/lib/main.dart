import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app/router.dart';
import 'content/content_repository.dart';
import 'features/companion/companion_store.dart';
import 'theme/theme.dart';

/// سند — رفيق السكينة اليومي (ADR-0023). العربية وRTL افتراضياً ووحيدة، كالويب.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final (prefs, content) = (await SharedPreferences.getInstance(), await ContentRepository.load(rootBundle));
  runApp(
    ProviderScope(
      overrides: [prefsProvider.overrideWithValue(prefs), contentProvider.overrideWithValue(content)],
      child: const SanadApp(),
    ),
  );
}

class SanadApp extends StatelessWidget {
  const SanadApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp.router(
        title: 'سند',
        debugShowCheckedModeBanner: false,
        locale: const Locale('ar'),
        supportedLocales: const [Locale('ar')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        theme: buildTheme(Brightness.light),
        darkTheme: buildTheme(Brightness.dark),
        routerConfig: router,
      );
}
