import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sanad/content/arabic.dart';
import 'package:sanad/content/journal.dart';
import 'package:sanad/core/vault.dart';
import 'package:sanad/features/journal/journal_screen.dart';
import 'package:sanad/features/journal/journal_store.dart';

import 'today_screen_test.dart' show FakeDevice, pumpApp, reveal, toTop;
import 'vectors_test.dart' show loadContent;

void main() {
  final content = loadContent();
  final vectors = jsonDecode(File('../packages/shared/test-vectors/vault.json').readAsStringSync()) as Map<String, dynamic>;

  ProviderContainer container(WidgetTester tester) => ProviderScope.containerOf(tester.element(find.byType(JournalScreen)));

  Future<void> create(WidgetTester tester, [String pin = '2468']) async {
    await tester.enterText(find.descendant(of: find.byKey(const ValueKey('pin')), matching: find.byType(TextField)), pin);
    await tester.enterText(find.descendant(of: find.byKey(const ValueKey('pin2')), matching: find.byType(TextField)), pin);
    await reveal(tester, find.text('إنشاء المذكّرة'));
    await tester.tap(find.text('إنشاء المذكّرة'));
    await tester.pumpAndSettle();
  }

  Future<void> unlock(WidgetTester tester, String pin) async {
    await tester.enterText(find.descendant(of: find.byKey(const ValueKey('pin')), matching: find.byType(TextField)), pin);
    await reveal(tester, find.text('فتح'));
    await tester.tap(find.text('فتح'));
    await tester.pumpAndSettle();
  }

  testWidgets('الإنشاء: الرمز ٤ خانات ومتطابق، والخزنة تُحفظ بصيغة الويب مشفّرة، والشاشة محمية من اللقطات', (tester) async {
    final device = FakeDevice();
    final prefs = await pumpApp(tester, location: '/journal', device: device);
    expect(find.text('أنشئ مذكّرتك الخاصة'), findsOneWidget);
    expect(device.privacy.calls, contains(('setSecure', true)));

    await create(tester, '12');
    expect(find.text('الرمز ٤ خانات على الأقل.'), findsOneWidget);
    await tester.enterText(find.descendant(of: find.byKey(const ValueKey('pin')), matching: find.byType(TextField)), '1234');
    await tester.enterText(find.descendant(of: find.byKey(const ValueKey('pin2')), matching: find.byType(TextField)), '9999');
    await reveal(tester, find.text('إنشاء المذكّرة'));
    await tester.tap(find.text('إنشاء المذكّرة'));
    await tester.pumpAndSettle();
    expect(find.text('الرمزان غير متطابقين.'), findsOneWidget);

    await create(tester);
    expect(find.text('كيف حالك اليوم؟'), findsOneWidget);
    final file = jsonDecode(prefs.getString(vaultKey)!) as Map<String, dynamic>;
    expect(file.keys, containsAll(['v', 'salt', 'pin', 'data']));
    expect(file['v'], 1);
  });

  testWidgets('حفظ الحالة مشفّراً، ثم القفل والفتح بالرمز (والخاطئ يُرفض)', (tester) async {
    final prefs = await pumpApp(tester, location: '/journal');
    await create(tester);
    await tester.tap(find.bySemanticsLabel('الهدوء: ٥ من ٥'));
    await tester.enterText(find.byKey(const ValueKey('note')), 'يوم هادئ والحمد لله');
    await reveal(tester, find.text('حفظ'));
    await tester.tap(find.text('حفظ'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('حُفظ مشفّراً ✓'), findsOneWidget);
    await tester.pumpAndSettle();
    expect(prefs.getString(vaultKey), isNot(contains('هادئ')));

    await tester.tap(find.text('🔒 قفل'));
    await tester.pumpAndSettle();
    expect(find.text('افتح مذكّرتك'), findsOneWidget);
    await unlock(tester, '0000');
    expect(find.text('الرمز غير صحيح.'), findsOneWidget);
    await unlock(tester, '2468');
    expect(find.text('تحديث', skipOffstage: false), findsOneWidget);
    expect(find.text('يوم هادئ والحمد لله'), findsOneWidget);
  });

  testWidgets('خزنة أنشأها الويب تُفتح من شاشة المذكّرة وتعرض بياناتها', (tester) async {
    await pumpApp(tester, location: '/journal', prefs: {vaultKey: jsonEncode(vectors['web'])}, realVault: true);
    await tester.enterText(find.descendant(of: find.byKey(const ValueKey('pin')), matching: find.byType(TextField)), vectors['pin'] as String);
    await tester.tap(find.text('فتح'));
    // PBKDF2 الحقيقي عمل فعلي خارج الوقت الوهمي
    await tester.runAsync(() => Future<void>.delayed(const Duration(seconds: 8)));
    await tester.pumpAndSettle();
    expect(find.text('كيف حالك اليوم؟'), findsOneWidget);

    await tester.tap(find.bySemanticsLabel('اليوم السابق'));
    await tester.pumpAndSettle();
    expect(find.text('حالتك يوم ${shortDayLabel('2026-10-14')}'), findsOneWidget);
    expect(find.text('نمت جيداً والحمد لله'), findsOneWidget);
    await reveal(tester, find.text('جلساتك'));
    expect(find.text('رقية: ٣ ← ٧'), findsOneWidget);
  });

  testWidgets('الاتجاه: أقل من ٣ أيام «يتشكّل»، و١٤ يوماً تعرض المخططات والملاحظات بلا تشخيص', (tester) async {
    await pumpApp(tester, location: '/journal', prefs: {
      'sanad.companion.v1': jsonEncode({'activeProgramId': 'foundation-7', 'startedOn': '2026-10-02', 'done': {}, 'activeDays': {for (var i = 0; i < 14; i += 2) addDays('2026-10-15', -i): true}, 'finished': []}),
    });
    await create(tester);
    await reveal(tester, find.text('رسمك البياني يتشكّل'));

    final notifier = container(tester).read(journalProvider.notifier);
    for (var i = 0; i < 14; i++) {
      await tester.runAsync(() => notifier.saveCheckIn(day: addDays('2026-10-15', -i), values: {'calm': i < 7 ? 3 : 1, 'sleep': 2, 'energy': 2, 'mood': 2}));
    }
    await tester.pumpAndSettle();
    await reveal(tester, find.text('آخر ١٤ يوماً'));
    expect(find.byType(MiniChart, skipOffstage: false), findsNWidgets(content.journalMetrics.length));
    await reveal(tester, find.textContaining('الهدوء في الأسبوع الأخير أعلى'));
    await reveal(tester, find.textContaining('في أيام التزامك كان متوسط هدوئك'));
    expect(find.textContaining('هذه ملاحظات عن أيامك أنت'), findsOneWidget);
    expect(find.textContaining('بسبب'), findsNothing);
  });

  testWidgets('البصمة تُطلب فور القفل وتفتح دون رمز، وإلغاؤها يُبقي الرمز والزر', (tester) async {
    final device = FakeDevice();
    await pumpApp(tester, location: '/journal', device: device);
    await create(tester);
    final notifier = container(tester).read(journalProvider.notifier);
    await tester.runAsync(notifier.enableBio);
    expect(device.bio.saved, hasLength(32));

    notifier.lock();
    await tester.pumpAndSettle();
    expect(find.text('كيف حالك اليوم؟'), findsOneWidget); // فُتحت بالبصمة تلقائياً

    device.bio.cancel = true;
    notifier.lock();
    await tester.pumpAndSettle();
    expect(find.text('افتح مذكّرتك'), findsOneWidget);
    expect(find.text('أُلغيت البصمة'), findsOneWidget);
    device.bio.cancel = false;
    await reveal(tester, find.text('فتح بالبصمة / الوجه'));
    await tester.tap(find.text('فتح بالبصمة / الوجه'));
    await tester.pumpAndSettle();
    expect(find.text('كيف حالك اليوم؟'), findsOneWidget);
  });

  testWidgets('القفل التلقائي: ٥ دقائق خمول، أو دقيقة في الخلفية', (tester) async {
    await pumpApp(tester, location: '/journal');
    await create(tester);
    await tester.pump(const Duration(minutes: 4));
    expect(find.text('كيف حالك اليوم؟'), findsOneWidget);
    await tester.tap(find.bySemanticsLabel('النشاط: ٣ من ٥')); // اللمس يؤجّل القفل
    await tester.pump(const Duration(minutes: 4));
    expect(find.text('كيف حالك اليوم؟'), findsOneWidget);
    await tester.pump(const Duration(minutes: 2));
    await tester.pumpAndSettle();
    expect(find.text('افتح مذكّرتك'), findsOneWidget);

    await unlock(tester, '2468');
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    await tester.pump(const Duration(seconds: 61));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.text('افتح مذكّرتك'), findsOneWidget);
  });

  testWidgets('جلسة سُجّلت والمذكّرة مقفلة تُضاف عند فتحها', (tester) async {
    await pumpApp(tester, location: '/journal');
    await create(tester);
    final notifier = container(tester).read(journalProvider.notifier)..lock();
    await notifier.addSession(const SessionRating(at: '2026-10-15T08:00:00.000Z', kind: 'ruqyah', before: 2, after: 6));
    await tester.pumpAndSettle();
    await unlock(tester, '2468');
    await reveal(tester, find.text('جلساتك'));
    expect(find.text('رقية: ٢ ← ٦'), findsOneWidget);
    expect(find.textContaining('بـ ${arNum('4.0')} درجة'), findsOneWidget);
  });

  testWidgets('تصدير نسخة غير مشفّرة، وتغيير الرمز، والحذف النهائي بتأكيد', (tester) async {
    final device = FakeDevice();
    final prefs = await pumpApp(tester, location: '/journal', device: device);
    await create(tester);
    await reveal(tester, find.text('الخصوصية والقفل'));
    await tester.tap(find.text('الخصوصية والقفل'));
    await tester.pumpAndSettle();

    await reveal(tester, find.text('تنزيل نسخة (غير مشفّرة)'));
    await tester.tap(find.text('تنزيل نسخة (غير مشفّرة)'));
    await tester.pumpAndSettle();
    expect(device.outbound.shared.single.name, 'sanad-journal-2026-10-15.json');
    expect(jsonDecode(utf8.decode(device.outbound.shared.single.bytes)), {'checkIns': {}, 'sessions': []});

    await tester.enterText(find.byKey(const ValueKey('new-pin')), '5555');
    await tester.pumpAndSettle();
    await tester.tap(find.text('تغيير'));
    await tester.pumpAndSettle();
    expect(find.text('تغيّر الرمز ✓'), findsOneWidget);
    container(tester).read(journalProvider.notifier).lock();
    await tester.pumpAndSettle();
    await toTop(tester);
    await unlock(tester, '2468');
    expect(find.text('الرمز غير صحيح.'), findsOneWidget);
    await unlock(tester, '5555');
    await reveal(tester, find.text('الخصوصية والقفل'));
    await tester.tap(find.text('الخصوصية والقفل'));
    await tester.pumpAndSettle();

    await reveal(tester, find.text('حذف المذكّرة نهائياً'));
    await tester.tap(find.text('حذف المذكّرة نهائياً'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('تأكيد الحذف — لا يمكن التراجع'));
    await tester.pumpAndSettle();
    expect(prefs.getString(vaultKey), isNull);
    await toTop(tester);
    expect(find.text('أنشئ مذكّرتك الخاصة'), findsOneWidget);
  });
}
