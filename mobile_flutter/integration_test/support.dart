import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sanad/app/router.dart';
import 'package:sanad/core/api.dart';
import 'package:sanad/core/audio.dart' show apiBase;
import 'package:sanad/core/session.dart';
import 'package:sanad/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

/*
  عُدّة رحلات المستخدم على جهاز حقيقي أو محاكٍ (docs/flutter-app-plan.md §9):
  التطبيق الحقيقي بإضافاته الأصلية، وخادم حقيقي في Development (حسابات العرض) على SANAD_API_BASE
  — من محاكي أندرويد: http://10.0.2.2:<port>.
*/

const demoPassword = 'Demo-Pass-123';
const beneficiaryEmail = 'beneficiary@sanad.local';
const sheikhEmail = 'sheikh@sanad.local';

/// طلبات الاختبار نفسه إلى الخادم (التهيئة، وفعل الطرف الآخر كالشيخ)، من الجهاز.
class TestApiClient {
  final _http = HttpClient()..connectionTimeout = const Duration(seconds: 10);

  Future<dynamic> send(String method, String path, {Object? body, String? token}) async {
    final req = await _http.openUrl(method, Uri.parse('$apiBase$path'));
    req.headers.contentType = ContentType.json;
    if (token != null) req.headers.set('Authorization', 'Bearer $token');
    if (method == 'POST') req.headers.set('Idempotency-Key', '${DateTime.now().microsecondsSinceEpoch}-${path.hashCode}');
    if (body != null) req.write(jsonEncode(body));
    final res = await req.close();
    final text = await res.transform(utf8.decoder).join();
    if (res.statusCode >= 400) throw HttpException('$method $path → ${res.statusCode} $text');
    return text.isEmpty ? null : jsonDecode(text);
  }

  Future<({String access, String refresh})> login(String email, [String password = demoPassword]) async {
    final j = await send('POST', '/api/v1/auth/login/email', body: {'email': email, 'password': password}) as Map<String, dynamic>;
    return (access: j['accessToken'] as String, refresh: j['refreshToken'] as String);
  }

  /// حساب جديد بموافقتيه — لرحلة الحذف، فلا يُحذف حساب عرض.
  Future<({String email, String access, String refresh})> register() async {
    final email = 'e2e-${DateTime.now().millisecondsSinceEpoch}@sanad.test';
    final j = await send('POST', '/api/v1/auth/register/email', body: {
      'email': email,
      'password': 'Strong-Pass-123',
      'displayName': 'مستفيد الرحلات',
      'acceptTerms': true,
      'acceptPrivacyPolicy': true,
    }) as Map<String, dynamic>;
    return (email: email, access: j['accessToken'] as String, refresh: j['refreshToken'] as String);
  }

  /// هل يقبل الخادم رمز التحديث؟ (بعد الخروج أو الحذف يجب ألا يقبله)
  Future<bool> refreshAccepted(String refresh) async {
    try {
      await send('POST', '/api/v1/auth/refresh', body: {'refreshToken': refresh});
      return true;
    } on HttpException {
      return false;
    }
  }
}

/// تشغيل نظيف: لا تفضيلات ولا جلسة محفوظة من رحلة سابقة، ثم [session] إن أُعطي (كأن المستخدم دخل قبل الإغلاق).
Future<void> boot(WidgetTester tester, {String? session, bool offline = false, bool clean = true}) async {
  if (clean) {
    await (await SharedPreferences.getInstance()).clear();
    await SecureRefreshTokenStore().write(session);
  }
  await startApp(overrides: [
    // بلا شبكة: منفذ مغلق يرفض الاتصال فوراً — كوضع الطيران من منظور التطبيق
    if (offline)
      apiProvider.overrideWith((ref) => ApiClient(baseUrl: 'http://10.0.2.2:9', session: ref.read(sessionProvider.notifier))),
  ]);
  // الموجّه كائن عام يبقى بين «إعادات الفتح» في العملية نفسها؛ الفتح الحقيقي يبدأ دائماً من «يومي»
  router.go('/today');
  await settle(tester);
}

/// pumpAndSettle بزمن حقيقي محدود: الحركات المتكررة (السكينة، المصباح) لا تستقر أبداً.
Future<void> settle(WidgetTester tester, [Duration max = const Duration(seconds: 3)]) async {
  final end = DateTime.now().add(max);
  do {
    await tester.pump(const Duration(milliseconds: 100));
  } while (tester.binding.hasScheduledFrame && DateTime.now().isBefore(end));
}

/// ينتظر ظهور عنصر يأتي من الشبكة أو من الوقت الفعلي (SignalR) حتى [timeout].
Future<void> waitFor(WidgetTester tester, Finder finder, {Duration timeout = const Duration(seconds: 20)}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 250));
    if (finder.evaluate().isNotEmpty) return;
  }
  // ما على الشاشة لحظة الفشل: يكفي غالباً لمعرفة السبب دون إعادة التشغيل
  throw TestFailure('لم يظهر خلال ${timeout.inSeconds} ث: $finder\n— الشاشة الآن —\n${screenText(tester)}');
}

final _mainScroll = find.byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down);

/// يمرّر القائمة العمودية حتى يظهر العنصر، ثم ينقر عليه.
Future<void> tapVisible(WidgetTester tester, Finder finder) async {
  // على جهاز حقيقي تبقى لوحة المفاتيح بعد الكتابة فتغطي الأزرار أسفلها
  FocusManager.instance.primaryFocus?.unfocus();
  await settle(tester);
  if (finder.hitTestable().evaluate().isEmpty) {
    await tester.scrollUntilVisible(finder, 250, scrollable: _mainScroll.first, maxScrolls: 80);
    await settle(tester);
  }
  await tester.tap(finder.hitTestable().first);
  await settle(tester);
}

/// كل نص ظاهر على الشاشة الآن.
String screenText(WidgetTester tester) => tester
    .widgetList<Text>(find.byType(Text))
    .map((t) => t.data ?? t.textSpan?.toPlainText() ?? '')
    .followedBy(tester.widgetList<RichText>(find.byType(RichText)).map((r) => r.text.toPlainText()))
    .join('\n');

ProviderContainer containerOf(WidgetTester tester) => ProviderScope.containerOf(tester.element(find.byType(MaterialApp)));

/// كتابة في حقل على جهاز حقيقي: يُنقر الحقل ليأخذ التركيز أولاً (بعد إرسال سابق قد لا يكون مركَّزاً
/// فتضيع الكتابة)، ثم يُتحقق أن النص وصل فعلاً.
Future<void> typeInto(WidgetTester tester, Finder field, String text) async {
  final input = find.descendant(of: field, matching: find.byType(EditableText), matchRoot: true).first;
  await tester.tap(input);
  await settle(tester);
  await tester.enterText(input, text);
  await settle(tester);
  final actual = tester.widget<EditableText>(input).controller.text;
  if (actual != text) throw TestFailure('لم تصل الكتابة إلى الحقل: "$actual" بدل "$text"');
}
