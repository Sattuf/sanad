import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sanad/app/router.dart';
import 'package:sanad/core/audio.dart';
import 'package:sanad/features/companion/companion_store.dart';
import 'package:sanad/theme/theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'vectors_test.dart' show loadContent;

/// يبني التطبيق كاملاً بالمسارات الحقيقية. [location] مسار البداية (الموجّه عام، فنحدده في كل اختبار)،
/// و[audio] صوت وهمي بدل just_audio، و[reduceMotion] يوقف نبض دائرة السكينة حتى يستقر الرسم.
Future<SharedPreferences> pumpApp(
  WidgetTester tester, {
  Map<String, Object> prefs = const {},
  String today = '2026-10-15',
  String location = '/today',
  RecitationAudio? audio,
  bool dark = false,
  bool reduceMotion = false,
}) async {
  SharedPreferences.setMockInitialValues(prefs);
  final p = await SharedPreferences.getInstance();
  tester.view.physicalSize = const Size(1170, 2532);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  if (reduceMotion) {
    tester.platformDispatcher.accessibilityFeaturesTestValue = FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
  }
  router.go(location);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        prefsProvider.overrideWithValue(p),
        contentProvider.overrideWithValue(loadContent()),
        todayProvider.overrideWithValue(today),
        recitationAudioProvider.overrideWithValue(audio ?? FakeAudio()),
      ],
      child: MaterialApp.router(
        debugShowCheckedModeBanner: false,
        locale: const Locale('ar'),
        theme: buildTheme(dark ? Brightness.dark : Brightness.light),
        routerConfig: router,
        builder: (context, child) => Directionality(textDirection: TextDirection.rtl, child: child!),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return p;
}

/// يمرّر القائمة الرئيسية حتى يظهر العنصر (القوائم تبني عناصرها عند الحاجة فقط).
/// ثم يرفعه لأعلى القائمة حتى لا يقع تحت شريط التبويب.
Future<void> reveal(WidgetTester tester, Finder f) async {
  await tester.scrollUntilVisible(f, 200, scrollable: find.byType(Scrollable).first);
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
}

/// يعود إلى أعلى القائمة الرئيسية.
Future<void> toTop(WidgetTester tester) async {
  await tester.drag(find.byType(Scrollable).first, const Offset(0, 4000));
  await tester.pumpAndSettle();
}

/// صوت وهمي: يحفظ ويشغّل في الذاكرة، والتشغيل يبقى «جارياً» حتى finishCurrent أو stop.
class FakeAudio implements RecitationAudio {
  FakeAudio({Set<String>? cached, this.fail = false}) : cached = cached ?? {};
  final Set<String> cached;
  final played = <String>[];
  bool fail;
  Completer<void>? _playing;
  VoidCallback? _owner;

  @override
  Future<bool> isCached(String url) async => cached.contains(url);

  @override
  Future<void> cache(String url) async {
    if (fail) throw Exception('offline');
    cached.add(url);
  }

  @override
  Future<void> playToEnd(String url) {
    played.add(url);
    return (_playing = Completer<void>()).future;
  }

  void finishCurrent() => _playing?.complete();

  @override
  Future<void> stop() async {
    if (_playing != null && !_playing!.isCompleted) _playing!.complete();
  }

  @override
  void claim(VoidCallback onPreempted) {
    final prev = _owner;
    _owner = onPreempted;
    if (prev != null && prev != onPreempted) prev();
  }
}

void main() {
  testWidgets('بلا برنامج: دعوة للبدء، والبدء يعرض مهام اليوم الأول', (tester) async {
    await pumpApp(tester);
    expect(find.text('ابدأ رحلتك بخطوة صغيرة'), findsOneWidget);

    await tester.tap(find.text('ابدأ بـ«أساس التحصين» (٧ أيام)'));
    await tester.pumpAndSettle();
    expect(find.text('النية قبل العمل'), findsOneWidget);
    expect(find.textContaining('أساس التحصين · اليوم ١ من ٧'), findsOneWidget);
    expect(find.text('الصباح'), findsOneWidget);
    expect(find.text('ذكر الحفظ'), findsOneWidget);
  });

  testWidgets('إنجاز مهمة يُحفظ بصيغة الويب نفسها (sanad.companion.v1)', (tester) async {
    final p = await pumpApp(tester, prefs: {
      'sanad.companion.v1': jsonEncode({'activeProgramId': 'foundation-7', 'startedOn': '2026-10-14', 'done': {}, 'activeDays': {}, 'finished': []}),
    });
    expect(find.textContaining('اليوم ٢ من ٧'), findsOneWidget);

    final check = find.descendant(of: find.byKey(const ValueKey('task-morning-bismillah-3')), matching: find.byKey(const ValueKey('check')));
    await tester.ensureVisible(check); // قد تقع المهمة تحت شريط التبويب حسب طول التحية
    await tester.pumpAndSettle();
    await tester.tap(check);
    await tester.pumpAndSettle();

    final saved = jsonDecode(p.getString('sanad.companion.v1')!) as Map<String, dynamic>;
    expect((saved['done'] as Map).keys, contains('foundation-7:2:morning-bismillah-3'));
    expect((saved['activeDays'] as Map).keys, ['2026-10-15']);
    expect(find.text('١', skipOffstage: false), findsWidgets); // أيام الالتزام
  });

  testWidgets('«اقرأ» يعرض نص الذكر ومصدره من المحتوى المولَّد', (tester) async {
    await pumpApp(tester, prefs: {
      'sanad.companion.v1': jsonEncode({'activeProgramId': 'foundation-7', 'startedOn': '2026-10-15', 'done': {}, 'activeDays': {}, 'finished': []}),
    });
    await tester.drag(find.byType(ListView).first, const Offset(0, -300)); // بعيداً عن زر السكينة العائم
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(of: find.byKey(const ValueKey('task-morning-bismillah-3')), matching: find.text('اقرأ')));
    await tester.pumpAndSettle();
    expect(find.text(loadContent().item('bismillah-3').text!), findsOneWidget);
    expect(find.textContaining('سنن أبي داود (5088)'), findsOneWidget);
  });
}
