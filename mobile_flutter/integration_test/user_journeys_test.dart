import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:sanad/app/router.dart';
import 'package:sanad/core/format.dart';
import 'package:sanad/core/session.dart';
import 'package:sanad/core/vault.dart' show vaultKey;
import 'package:shared_preferences/shared_preferences.dart';

import 'support.dart';

/*
  سيناريوهات E2E الإلزامية لتطبيق الجوال — docs/flutter-app-plan.md §9، على جهاز أو محاكٍ وخادم حقيقي:
    flutter test integration_test --dart-define=SANAD_API_BASE=http://10.0.2.2:5080
  (الخادم في Development بحسابات العرض؛ راجع README.)
*/
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  final api = TestApiClient();

  Future<Map<String, dynamic>?> companionState() async {
    final raw = (await SharedPreferences.getInstance()).getString('sanad.companion.v1');
    return raw == null ? null : jsonDecode(raw) as Map<String, dynamic>;
  }

  testWidgets('1) بدء «أساس التحصين» بلا حساب، وإنجاز مهمة، ثم إعادة الفتح: التقدّم محفوظ', (tester) async {
    await boot(tester);
    expect(find.text('ابدأ رحلتك بخطوة صغيرة'), findsOneWidget);
    await tapVisible(tester, find.text('ابدأ بـ«أساس التحصين» (٧ أيام)'));
    expect(find.textContaining('أساس التحصين · اليوم ١ من ٧'), findsOneWidget);

    await tapVisible(tester, find.byKey(const ValueKey('check')));
    final done = (await companionState())!['done'] as Map;
    expect(done, hasLength(1));

    // إعادة الفتح: حاوية جديدة تقرأ من تخزين الجهاز نفسه
    await boot(tester, clean: false);
    expect(find.textContaining('أساس التحصين · اليوم ١ من ٧'), findsOneWidget);
    expect((await companionState())!['done'], done);
  });

  testWidgets('2) بلا شبكة: يومي والبرامج والسكينة تعمل، وما يحتاج الخادم يقول ذلك بوضوح', (tester) async {
    await boot(tester, offline: true);
    await tapVisible(tester, find.text('ابدأ بـ«أساس التحصين» (٧ أيام)'));
    expect(find.textContaining('اليوم ١ من ٧'), findsOneWidget);

    router.go('/programs');
    await settle(tester);
    expect(find.textContaining('أساس التحصين'), findsWidgets);

    router.go('/sakina');
    await settle(tester);
    // شاشة السكينة كاملة دون خادم: زر خروجها ظاهر ولا رسالة تعذّر
    expect(find.text('→ خروج'), findsOneWidget);
    expect(find.text('تعذّر عرض هذه الصفحة'), findsNothing);

    router.go('/directory');
    await waitFor(tester, find.text('تعذّر عرض هذه الصفحة'));
    expect(find.text('تعذّر الاتصال بالخادم. تحقق من اتصالك وحاول مجدداً.'), findsOneWidget);
  });

  testWidgets('3) المذكّرة: إنشاء برمز، حفظ مشفّر، قفل، رفض الرمز الخاطئ وفتح بالصحيح', (tester) async {
    await boot(tester);
    router.go('/journal');
    await settle(tester);
    expect(find.text('أنشئ مذكّرتك الخاصة'), findsOneWidget);

    Finder pin(String key) => find.descendant(of: find.byKey(ValueKey(key)), matching: find.byType(TextField));
    await typeInto(tester, pin('pin'), '2468');
    await typeInto(tester, pin('pin2'), '2468');
    await tapVisible(tester, find.text('إنشاء المذكّرة'));
    await waitFor(tester, find.text('كيف حالك اليوم؟'));

    await typeInto(tester, find.byKey(const ValueKey('note')), 'يوم هادئ والحمد لله');
    await tapVisible(tester, find.text('حفظ'));
    await waitFor(tester, find.text('حُفظ مشفّراً ✓'));
    expect((await SharedPreferences.getInstance()).getString(vaultKey), isNot(contains('هادئ')));

    await tapVisible(tester, find.text('🔒 قفل'));
    await waitFor(tester, find.text('افتح مذكّرتك'));
    await typeInto(tester, pin('pin'), '0000');
    await tapVisible(tester, find.text('فتح'));
    await waitFor(tester, find.text('الرمز غير صحيح.'));
    await typeInto(tester, pin('pin'), '2468');
    await tapVisible(tester, find.text('فتح'));
    // الملاحظة المحفوظة أسفل شاشة الهاتف: القائمة لا تبني ما خارجها حتى يُمرَّر إليه
    await waitFor(tester, find.text('🔒 قفل')); // زر القفل لا يظهر إلا والمذكّرة مفتوحة
    await tester.scrollUntilVisible(find.text('يوم هادئ والحمد لله'), 250,
        scrollable: find.byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down).first, maxScrolls: 60);
    expect(find.text('يوم هادئ والحمد لله'), findsOneWidget);
  });

  testWidgets('4) الوضع المتحفّظ: تسميات محايدة وزر خروج سريع، ويُحفظ ثم يُعاد', (tester) async {
    await boot(tester);
    router.go('/privacy-mode');
    await settle(tester);
    await tapVisible(tester, find.byKey(const ValueKey('discreet')));
    expect((await SharedPreferences.getInstance()).getString('sanad.discreet'), 'true');

    router.go('/today');
    await settle(tester);
    expect(find.text('وِردي'), findsOneWidget);
    expect(find.text('ارقِ نفسك'), findsNothing);
    expect(find.byKey(const ValueKey('quick-exit')), findsOneWidget);

    // إعادة الأيقونة والاسم: لا يبقى المحاكي بأيقونة «ملاحظاتي»
    router.go('/privacy-mode');
    await settle(tester);
    await tapVisible(tester, find.byKey(const ValueKey('discreet')));
    expect((await SharedPreferences.getInstance()).getString('sanad.discreet'), 'false');
  });

  testWidgets('5) مستفيد مسجَّل: الدليل ← حجز ← قبول الشيخ يصل لحظياً ← محادثة ← ردّ الشيخ يصل', (tester) async {
    final me = await api.login(beneficiaryEmail);
    final sheikh = await api.login(sheikhEmail);
    final dir = await api.send('GET', '/api/v1/directory?practitionerType=ReligiousPractitioner') as Map<String, dynamic>;
    final providerItem = (dir['items'] as List).first as Map<String, dynamic>;
    final provider = await api.send('GET', '/api/v1/providers/${providerItem['id']}') as Map<String, dynamic>;
    final offeringId = ((provider['offerings'] as List).first as Map)['id'] as String;
    final slots = await api.send('GET', '/api/v1/providers/${provider['id']}/availability', token: me.access) as List;
    expect(slots, isNotEmpty, reason: 'بيانات العرض تحتاج موعداً متاحاً');
    final slotStart = (slots.first as Map)['startUtc'] as String;

    await boot(tester, session: me.refresh);
    router.go('/directory');
    await waitFor(tester, find.text(providerItem['displayName'] as String));
    await tapVisible(tester, find.text(providerItem['displayName'] as String));
    await waitFor(tester, find.text('نطاق الممارسة'));
    await tapVisible(tester, find.byKey(ValueKey('book-$offeringId')));

    await waitFor(tester, find.text(formatTime(slotStart)));
    await tapVisible(tester, find.text(formatTime(slotStart)).first);
    await tapVisible(tester, find.byKey(const ValueKey('submit-booking')));
    await waitFor(tester, find.textContaining('حجز مع'));

    // الطرف الآخر يقبل من جهازه؛ التحديث يصل عبر SignalR دون سحب
    final bookings = await api.send('GET', '/api/v1/me/bookings', token: me.access) as List;
    final bookingId = (bookings.firstWhere((b) => (b as Map)['slotStartUtc'] == slotStart) as Map)['id'] as String;
    await api.send('POST', '/api/v1/bookings/$bookingId/accept', token: sheikh.access);
    await waitFor(tester, find.text('مؤكَّد'), timeout: const Duration(seconds: 15));

    await tapVisible(tester, find.byKey(const ValueKey('open-chat')));
    await waitFor(tester, find.byKey(const ValueKey('message')));
    await typeInto(tester, find.byKey(const ValueKey('message')), 'السلام عليكم، موعدي غداً');
    await tapVisible(tester, find.byKey(const ValueKey('send')));
    await waitFor(tester, find.text('السلام عليكم، موعدي غداً'));

    final conversations = await api.send('GET', '/api/v1/me/conversations', token: sheikh.access) as List;
    final conversationId = (conversations.firstWhere((c) => (c as Map)['bookingRequestId'] == bookingId) as Map)['id'] as String;
    await api.send('POST', '/api/v1/conversations/$conversationId/messages', token: sheikh.access, body: {'body': 'وعليكم السلام، أهلاً بك'});
    // الوقت الفعلي يوصلها خلال ثوانٍ؛ بدونه الجلب الدوري كل 30 ثانية
    await waitFor(tester, find.text('وعليكم السلام، أهلاً بك'), timeout: const Duration(seconds: 40));
  });

  testWidgets('6) حذف الحساب يمسح كل شيء على الجهاز وفي الخادم', (tester) async {
    final user = await api.register();
    await boot(tester, session: user.refresh);
    await tapVisible(tester, find.text('ابدأ بـ«أساس التحصين» (٧ أيام)'));
    expect(await companionState(), isNotNull);

    router.go('/account');
    await waitFor(tester, find.text('مستفيد الرحلات'));
    await tester.scrollUntilVisible(find.byKey(const ValueKey('delete-confirm')), 300,
        scrollable: find.byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down).first);
    await typeInto(tester, find.byKey(const ValueKey('delete-confirm')), 'احذف حسابي');
    await settle(tester);
    await tapVisible(tester, find.byKey(const ValueKey('delete-account')));
    await waitFor(tester, find.text('ابدأ رحلتك بخطوة صغيرة'));

    expect(await SecureRefreshTokenStore().read(), isNull);
    expect(await companionState(), isNull);
    expect(await api.refreshAccepted(user.refresh), isFalse);
    await expectLater(api.login(user.email, 'Strong-Pass-123'), throwsA(isA<Exception>()));
  });

  testWidgets('7) لا عنصر دفع أو اشتراك في أي شاشة', (tester) async {
    final me = await api.login(beneficiaryEmail);
    await boot(tester, session: me.refresh);
    final forbidden = RegExp(r'(?:^|[\s\p{P}])[وفبل]?(ادفع|الدفع|السعر|الأسعار|اشترك الآن|باقة)|\b(payment|subscribe|checkout)\b', unicode: true, caseSensitive: false);
    for (final path in ['/today', '/programs', '/ruqyah', '/awareness', '/account', '/library', '/directory', '/bookings', '/recommendations', '/notifications']) {
      router.go(path);
      await settle(tester, const Duration(seconds: 4));
      final text = screenText(tester);
      expect(forbidden.hasMatch(text), isFalse, reason: 'المسار $path: ${forbidden.firstMatch(text)?.group(0)}');
    }
  });
}
