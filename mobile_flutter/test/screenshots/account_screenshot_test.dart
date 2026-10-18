@Tags(['screenshot'])
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../today_screen_test.dart' show FakeServer, pumpApp;
import 'today_screenshot_test.dart' show loadFonts, shot, snap;

/// لقطات مراجعة للأسابيع 5–7: الدخول والموافقات وحسابي — تُقارن بـ /login في الويب.
void main() {
  setUpAll(loadFonts);
  FakeServer server() => FakeServer()
    ..json('GET /api/v1/auth/providers', {'google': true, 'googleNative': true, 'apple': true, 'captchaEnabled': false, 'captchaSiteKey': null})
    ..json('GET /api/v1/me', {'id': 'u1', 'displayName': 'سالم', 'email': 'salem@example.com', 'roles': ['Beneficiary'], 'activeConsents': ['TermsOfService', 'PrivacyPolicy']});

  // الصور تُفك خارج الوقت الوهمي، فنحمّل الشعار قبل اللقطة
  Future<void> withLogo(WidgetTester tester) async {
    await tester.runAsync(() => precacheImage(const AssetImage('assets/brand/logo.png'), tester.element(find.byType(Image).first)));
    await tester.pumpAndSettle();
  }

  shot('الدخول', (tester) async {
    await pumpApp(tester, location: '/login', server: server());
    await withLogo(tester);
    await snap('login.png');
  });

  shot('الدخول — ليلي', (tester) async {
    await pumpApp(tester, location: '/login', server: server(), dark: true);
    await withLogo(tester);
    await snap('login_dark.png');
  });

  shot('الموافقات', (tester) async {
    await pumpApp(tester, location: '/consent', server: server());
    await tester.tap(find.byKey(const ValueKey('terms')));
    await tester.pumpAndSettle();
    await snap('consent.png');
  });

  shot('حسابي — بلا جلسة', (tester) async {
    await pumpApp(tester, location: '/account', server: server());
    await snap('account_signed_out.png');
  });

  shot('حسابي — بجلسة', (tester) async {
    await pumpApp(tester, location: '/account', server: server(), refreshToken: 'r', realVault: false);
    await snap('account_signed_in.png');
  });
}
