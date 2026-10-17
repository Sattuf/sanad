import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'today_screen_test.dart' show FakeDevice, FakeNativeSignIn, FakeServer, jsonBody, pumpApp, reveal;

const _tokens = {'accessToken': 'a1', 'refreshToken': 'r1', 'accessTokenExpiresAtUtc': '', 'refreshTokenExpiresAtUtc': ''};
Map<String, Object?> _signedIn({bool isNewUser = false}) => {'userId': 'u1', 'stage': 'Succeeded', 'isNewUser': isNewUser, ..._tokens, 'ticket': null};
Map<String, Object?> _me({List<String> consents = const ['TermsOfService', 'PrivacyPolicy']}) =>
    {'id': 'u1', 'displayName': 'سالم', 'email': 'salem@example.com', 'roles': ['Beneficiary'], 'activeConsents': consents};

FakeServer _server({bool googleNative = true}) => FakeServer()..json('GET /api/v1/auth/providers', {'google': true, 'googleNative': googleNative, 'apple': true, 'captchaEnabled': false, 'captchaSiteKey': null});

Future<void> _openLogin(WidgetTester tester) async {
  await tester.tap(find.byKey(const ValueKey('login')));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('حسابي بلا جلسة: دعوة للدخول، وصفحة الدخول بتصميم الويب ونصوصه', (tester) async {
    await pumpApp(tester, location: '/account', server: _server());
    expect(find.text('حسابي'), findsWidgets);
    await _openLogin(tester);
    expect(find.text('أهلاً بك في سند'), findsOneWidget);
    expect(find.text('المتابعة باستخدام Google'), findsOneWidget);
    expect(find.text('لا كلمة مرور تحفظها ولا رمز ينتظرك'), findsOneWidget);
    expect(find.text('الدخول بجوجل غير مُفعّل في هذه البيئة بعد.'), findsNothing);
    expect(find.text('المتابعة باستخدام Apple'), findsNothing); // أبل على iPhone فقط
  });

  testWidgets('جوجل غير مُفعّل في الخادم: تنبيه والزر معطّل', (tester) async {
    await pumpApp(tester, location: '/account', server: _server(googleNative: false));
    await _openLogin(tester);
    expect(find.text('الدخول بجوجل غير مُفعّل في هذه البيئة بعد.'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('google')));
    await tester.pumpAndSettle();
    expect(find.text('أهلاً بك في سند'), findsOneWidget);
  });

  testWidgets('الدخول بجوجل: رمز الهوية للخادم بلا رمز وصول، ورمز التحديث في التخزين الآمن، ثم الخروج يبطله', (tester) async {
    final device = FakeDevice();
    final server = _server()
      ..json('POST /api/v1/auth/google/native', _signedIn())
      ..json('GET /api/v1/me', _me())
      ..json('POST /api/v1/auth/revoke', null, 204);
    await pumpApp(tester, location: '/account', server: server, device: device);
    await _openLogin(tester);
    await tester.tap(find.byKey(const ValueKey('google')));
    await tester.pumpAndSettle();

    final call = server.calls('POST /api/v1/auth/google/native').single;
    expect(jsonDecode(call.data as String), {'idToken': 'google-id-token'});
    expect(call.headers.containsKey('Authorization'), isFalse);
    expect(device.refreshStore.token, 'r1');
    expect(find.text('سالم'), findsOneWidget);
    expect(server.calls('GET /api/v1/me').single.headers['Authorization'], 'Bearer a1');

    await reveal(tester, find.byKey(const ValueKey('logout')));
    await tester.tap(find.byKey(const ValueKey('logout')));
    await tester.pumpAndSettle();
    expect(jsonDecode(server.calls('POST /api/v1/auth/revoke').single.data as String), {'refreshToken': 'r1'});
    expect(device.refreshStore.token, isNull);
    expect(find.byKey(const ValueKey('login')), findsOneWidget);
  });

  testWidgets('الخروج بلا شبكة يمسح الجلسة محلياً على أي حال', (tester) async {
    final device = FakeDevice();
    final server = FakeServer()..json('GET /api/v1/me', _me());
    device.refreshStore.token = 'r0';
    await pumpApp(tester, location: '/account', server: server, device: device, refreshToken: 'r0');
    await reveal(tester, find.byKey(const ValueKey('logout')));
    await tester.tap(find.byKey(const ValueKey('logout')));
    await tester.pumpAndSettle();
    expect(device.refreshStore.token, isNull);
    expect(find.byKey(const ValueKey('login')), findsOneWidget);
  });

  testWidgets('حساب جديد: الموافقات الإلزامية أولاً، ثم «حسابي»', (tester) async {
    var consents = <String>[];
    final server = _server()
      ..json('POST /api/v1/auth/google/native', _signedIn(isNewUser: true))
      ..on('GET /api/v1/me', (_) => jsonBody(_me(consents: consents)))
      ..on('POST /api/v1/me/consent', (r) {
        consents = [...consents, (jsonDecode(r.data as String) as Map)['type'] as String];
        return jsonBody(null, 204);
      });
    await pumpApp(tester, location: '/account', server: server);
    await _openLogin(tester);
    await tester.tap(find.byKey(const ValueKey('google')));
    await tester.pumpAndSettle();

    expect(find.text('قبل أن نبدأ'), findsOneWidget);
    final next = find.widgetWithText(FilledButton, 'متابعة');
    expect(tester.widget<FilledButton>(next).onPressed, isNull);
    await tester.tap(find.byKey(const ValueKey('terms')));
    await tester.tap(find.byKey(const ValueKey('privacy')));
    await tester.pumpAndSettle();
    await tester.tap(next);
    await tester.pumpAndSettle();
    expect(consents, ['TermsOfService', 'PrivacyPolicy']);
    expect(find.text('سالم'), findsOneWidget);
  });

  testWidgets('رمز التحقق الثنائي يُطلب في التطبيق', (tester) async {
    final server = _server()
      ..json('POST /api/v1/auth/google/native', {'userId': 'u1', 'stage': 'RequiresTwoFactorCode', 'isNewUser': false, 'ticket': 't-1'})
      ..json('POST /api/v1/auth/login/2fa/verify', _signedIn())
      ..json('GET /api/v1/me', _me());
    await pumpApp(tester, location: '/account', server: server);
    await _openLogin(tester);
    await tester.tap(find.byKey(const ValueKey('google')));
    await tester.pumpAndSettle();
    expect(find.text('رمز التحقق الثنائي'), findsOneWidget);
    await tester.enterText(find.byKey(const ValueKey('otp')), '123456');
    await tester.pumpAndSettle();
    await tester.tap(find.text('دخول'));
    await tester.pumpAndSettle();
    expect(jsonDecode(server.calls('POST /api/v1/auth/login/2fa/verify').single.data as String), {'ticket': 't-1', 'code': '123456'});
    expect(find.text('سالم'), findsOneWidget);
  });

  testWidgets('مراحل إدارية (تغيير كلمة مرور / إعداد 2FA) تُكمل على الويب', (tester) async {
    final server = _server()..json('POST /api/v1/auth/google/native', {'userId': 'u1', 'stage': 'RequiresTwoFactorSetup', 'isNewUser': false, 'ticket': 't'});
    await pumpApp(tester, location: '/account', server: server);
    await _openLogin(tester);
    await tester.tap(find.byKey(const ValueKey('google')));
    await tester.pumpAndSettle();
    await reveal(tester, find.textContaining('تطبيق الجوال مخصص للمستفيدين'));
  });

  testWidgets('إلغاء نافذة جوجل: لا طلب ولا رسالة', (tester) async {
    final server = _server();
    await pumpApp(tester, location: '/account', server: server, native: FakeNativeSignIn()..idToken = null);
    await _openLogin(tester);
    await tester.tap(find.byKey(const ValueKey('google')));
    await tester.pumpAndSettle();
    expect(server.calls('POST /api/v1/auth/google/native'), isEmpty);
    expect(find.text('أهلاً بك في سند'), findsOneWidget);
  });

  testWidgets('الشروط والخصوصية تُفتح على موقع سند', (tester) async {
    final device = FakeDevice();
    await pumpApp(tester, location: '/account', server: _server(), device: device);
    await _openLogin(tester);
    await reveal(tester, find.text('سياسة الخصوصية'));
    await tester.tap(find.text('سياسة الخصوصية'));
    expect(device.outbound.opened.single.toString(), 'https://sanad.app/privacy');
  });

  testWidgets('جلسة محفوظة: أول طلب بعد التشغيل 401 ثم تجديد صامت واحد، ويظهر الحساب', (tester) async {
    final device = FakeDevice()..refreshStore.token = 'r0';
    final server = FakeServer()
      ..on('GET /api/v1/me', (r) => r.headers['Authorization'] == 'Bearer a1' ? jsonBody(_me()) : jsonBody({'title': 'انتهت الجلسة'}, 401))
      ..json('POST /api/v1/auth/refresh', _tokens);
    await pumpApp(tester, location: '/account', server: server, device: device, refreshToken: 'r0');
    expect(find.text('سالم'), findsOneWidget);
    expect(server.calls('POST /api/v1/auth/refresh'), hasLength(1));
    expect(jsonDecode(server.calls('POST /api/v1/auth/refresh').single.data as String), {'refreshToken': 'r0'});
    expect(device.refreshStore.token, 'r1');
  });

  testWidgets('رمز تحديث مرفوض: تُمسح الجلسة ويعود زر الدخول', (tester) async {
    final device = FakeDevice()..refreshStore.token = 'r0';
    final server = FakeServer()
      ..json('GET /api/v1/me', {'title': 'انتهت'}, 401)
      ..json('POST /api/v1/auth/refresh', {'title': 'رمز غير صالح'}, 401);
    await pumpApp(tester, location: '/account', server: server, device: device, refreshToken: 'r0');
    expect(device.refreshStore.token, isNull);
    expect(find.byKey(const ValueKey('login')), findsOneWidget);
  });
}
