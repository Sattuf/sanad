import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'care_test.dart' show booking, dirItem, provider, signedInServer, slotStart;
import 'today_screen_test.dart' show FakeServer, jsonBody, pumpApp;

/*
  إمكانية الوصول لكل شاشة (خطة Flutter §7، الأسبوعان 10–11) بإرشادات Flutter نفسها:
  - تباين النص مع خلفيته (WCAG AA) في الوضعين الفاتح والليلي؛
  - أهداف اللمس ≥ 48×48 (أندرويد) و44×44 (iOS)؛
  - كل ما يُنقر له تسمية يقرؤها TalkBack/VoiceOver؛
  - الخط بحجم 200% (أقصى ما يسمح به أندرويد) دون أن ينكسر التخطيط.
  تُفحص الشاشة في أعلاها ثم بعد التمرير إلى آخرها، وتُجمع كل الإخفاقات في رسالة واحدة.
*/

typedef Open = Future<void> Function(WidgetTester tester, {bool dark});

FakeServer _directory() => FakeServer()
  ..json('GET /api/v1/directory', {
    'items': [dirItem('p1', 'الشيخ عبدالله', org: 'جمعية النور'), dirItem('o1', 'جمعية النور', kind: 'Organization')],
    'page': 1,
    'pageSize': 12,
    'total': 2,
  });

FakeServer _conversation() => signedInServer()
  ..json('GET /api/v1/me/conversations', [
    {'id': 'c1', 'bookingRequestId': 'b1', 'status': 'Active', 'lastMessageAtUtc': null, 'counterpartDisplayName': 'الشيخ عبدالله'},
  ])
  ..on(
    'GET /api/v1/conversations/c1/messages',
    (_) => jsonBody([
      {'id': 'm1', 'conversationId': 'c1', 'senderUserId': 'p', 'isMine': false, 'body': 'السلام عليكم، الموعد مؤكد بإذن الله.', 'status': 'Sent', 'sentAtUtc': slotStart},
    ]),
  );

Open _at(String location, {FakeServer Function()? server, bool signedIn = false}) =>
    (tester, {dark = false}) async {
      await pumpApp(tester, location: location, server: server?.call(), refreshToken: signedIn ? 'r1' : null, dark: dark, reduceMotion: true);
    };

final screens = <String, Open>{
  'يومي': _at('/today'),
  'البرامج': _at('/programs'),
  'برنامج': _at('/programs/foundation-7'),
  'الرقية': _at('/ruqyah'),
  'دليل الرقية': _at('/ruqyah/guide/treatment'),
  'الوعي': _at('/awareness'),
  'الاختبار': _at('/awareness/quiz'),
  'السكينة': _at('/sakina'),
  'رقية النفس': _at('/self-ruqyah'),
  'المذكّرة': _at('/journal'),
  'الخصوصية': _at('/privacy-mode'),
  'الدخول': _at('/login'),
  'الحساب — زائر': _at('/account'),
  'الحساب — مسجَّل': _at('/account', server: signedInServer, signedIn: true),
  'المكتبة': _at('/library'),
  'الدليل': _at('/directory', server: _directory),
  'المختص': _at('/providers/p1', server: () => signedInServer()..json('GET /api/v1/providers/p1', provider), signedIn: true),
  'الحجز': _at('/book/p1?offering=off1',
      server: () => signedInServer()
        ..json('GET /api/v1/providers/p1', provider)
        ..json('GET /api/v1/providers/p1/availability', [
          {'id': 's1', 'startUtc': slotStart, 'endUtc': slotStart, 'status': 'Open'},
        ]),
      signedIn: true),
  'مواعيدي': _at('/bookings', server: () => signedInServer()..json('GET /api/v1/me/bookings', [booking('Submitted')]), signedIn: true),
  'تفاصيل الحجز': _at('/bookings/b1',
      server: () => signedInServer()
        ..json('GET /api/v1/bookings/b1', booking('AlternativeProposed'))
        ..json('GET /api/v1/bookings/b1/note', {'bookingId': 'b1', 'note': 'ملاحظة'}),
      signedIn: true),
  'المحادثة': _at('/conversations/c1', server: _conversation, signedIn: true),
  'التوصيات': _at('/recommendations', server: () => signedInServer()..json('GET /api/v1/me/recommendations', [])..json('GET /api/v1/me/favorites', []), signedIn: true),
  'الإشعارات': _at('/notifications', server: () => signedInServer()..json('GET /api/v1/me/notifications', []), signedIn: true),
  'المفضلة': _at('/favorites', server: () => signedInServer()..json('GET /api/v1/me/favorites', []), signedIn: true),
};

final _guidelines = <String, AccessibilityGuideline>{
  'contrast': textContrastGuideline,
  'android tap target': androidTapTargetGuideline,
  'iOS tap target': iOSTapTargetGuideline,
  'label': labeledTapTargetGuideline,
};

/// يمرّر القائمة الرئيسية إلى آخرها (إن وُجدت) لتُفحص العناصر أسفل الشاشة أيضاً.
Future<bool> _scrollToEnd(WidgetTester tester) async {
  final main = find.byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down);
  if (main.evaluate().isEmpty) return false;
  final position = tester.state<ScrollableState>(main.first).position;
  if (position.maxScrollExtent <= 0) return false;
  position.jumpTo(position.maxScrollExtent);
  await tester.pumpAndSettle();
  return true;
}

Future<List<String>> _evaluate(WidgetTester tester, String where) async {
  final failures = <String>[];
  for (final MapEntry(key: name, value: guideline) in _guidelines.entries) {
    final result = await guideline.evaluate(tester);
    if (!result.passed) failures.add('[$where · $name] ${result.reason}');
  }
  return failures;
}

void main() {
  for (final MapEntry(key: name, value: open) in screens.entries) {
    for (final dark in [false, true]) {
      testWidgets('إرشادات الوصول: $name${dark ? ' — ليلي' : ''}', (tester) async {
        final semantics = tester.ensureSemantics();
        await open(tester, dark: dark);
        final failures = await _evaluate(tester, 'أعلى');
        if (await _scrollToEnd(tester)) failures.addAll(await _evaluate(tester, 'أسفل'));
        semantics.dispose();
        expect(failures, isEmpty, reason: failures.join('\n'));
      });
    }

    testWidgets('خط 200%: $name', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = 2.0;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      final overflows = <String>[];
      final previous = FlutterError.onError;
      FlutterError.onError = (details) {
        final text = details.exceptionAsString();
        if (text.contains('overflowed')) {
          // مع موضع العنصر في lib/ ليُعرف ما ينكسر دون تشغيل يدوي
          final where = RegExp(r'lib/[\w/]+\.dart:\d+').firstMatch(details.toString())?.group(0) ?? '?';
          overflows.add('${text.split('\n').first} ($where)');
        } else {
          previous?.call(details);
        }
      };
      try {
        await open(tester);
        await _scrollToEnd(tester);
      } finally {
        FlutterError.onError = previous;
      }
      expect(overflows.toSet(), isEmpty, reason: overflows.toSet().join('\n'));
    });
  }
}
