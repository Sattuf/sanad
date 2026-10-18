@Tags(['screenshot'])
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sanad/core/format.dart';

import '../care_test.dart' show booking, dirItem, provider, signedInServer, slot2Start, slotStart;
import '../today_screen_test.dart' show FakeServer, jsonBody, pumpApp, reveal;
import 'today_screenshot_test.dart' show loadFonts, shot, snap;

/// لقطات مراجعة للأسابيع 7–9: الدليل والمختص والحجز والمحادثة والتوصيات — تُقارن بصفحاتها في الويب.
void main() {
  setUpAll(loadFonts);

  FakeServer directory() => FakeServer()
    ..json('GET /api/v1/directory', {
      'items': [dirItem('p1', 'الشيخ عبدالله', org: 'جمعية النور'), dirItem('o1', 'جمعية النور', kind: 'Organization')],
      'page': 1,
      'pageSize': 12,
      'total': 2,
    });

  shot('الدليل', (tester) async {
    await pumpApp(tester, location: '/directory', server: directory());
    await snap('directory.png');
  });

  shot('الدليل — ليلي', (tester) async {
    await pumpApp(tester, location: '/directory', server: directory(), dark: true);
    await snap('directory_dark.png');
  });

  shot('صفحة المختص', (tester) async {
    await pumpApp(tester, location: '/providers/p1', server: signedInServer()..json('GET /api/v1/providers/p1', provider), refreshToken: 'r1');
    await snap('provider.png');
  });

  shot('الحجز — موعد مختار وملاحظة بموافقة', (tester) async {
    final server = signedInServer()
      ..json('GET /api/v1/providers/p1', provider)
      ..json('GET /api/v1/providers/p1/availability', [
        {'id': 's1', 'startUtc': slotStart, 'endUtc': slotStart, 'status': 'Open'},
        {'id': 's2', 'startUtc': slot2Start, 'endUtc': slot2Start, 'status': 'Open'},
      ]);
    await pumpApp(tester, location: '/book/p1?offering=off1', server: server, refreshToken: 'r1');
    await tester.tap(find.text(formatTime(slotStart)));
    await tester.enterText(find.byKey(const ValueKey('booking-note')), 'أعاني من الأرق منذ أسابيع.');
    await tester.pumpAndSettle();
    await reveal(tester, find.byKey(const ValueKey('consent')));
    await tester.tap(find.byKey(const ValueKey('consent')));
    await tester.pumpAndSettle();
    await snap('book.png');
  });

  shot('تفاصيل الحجز — موعد بديل', (tester) async {
    final server = signedInServer()
      ..json('GET /api/v1/bookings/b1', booking('AlternativeProposed'))
      ..json('GET /api/v1/bookings/b1/note', {'bookingId': 'b1', 'note': 'أعاني من الأرق منذ أسابيع.'});
    await pumpApp(tester, location: '/bookings/b1', server: server, refreshToken: 'r1');
    await snap('booking_detail.png');
  });

  shot('المحادثة الإدارية', (tester) async {
    final server = signedInServer()
      ..json('GET /api/v1/me/conversations', [
        {'id': 'c1', 'bookingRequestId': 'b1', 'status': 'Active', 'lastMessageAtUtc': null, 'counterpartDisplayName': 'الشيخ عبدالله'},
      ])
      ..on(
        'GET /api/v1/conversations/c1/messages',
        (_) => jsonBody([
          {
            'id': 'm1',
            'conversationId': 'c1',
            'senderUserId': 'p',
            'isMine': false,
            'body': 'السلام عليكم، الموعد مؤكد بإذن الله.',
            'status': 'Sent',
            'sentAtUtc': slotStart,
          },
          {
            'id': 'm2',
            'conversationId': 'c1',
            'senderUserId': 'u1',
            'isMine': true,
            'body': 'وعليكم السلام، جزاك الله خيراً.',
            'status': 'Sent',
            'sentAtUtc': slot2Start,
          },
        ]),
      );
    await pumpApp(tester, location: '/conversations/c1', server: server, refreshToken: 'r1');
    await snap('conversation.png');
  });

  shot('توصياتي', (tester) async {
    final server = signedInServer()
      ..json('GET /api/v1/me/recommendations', [
        {
          'id': 'r1',
          'bookingRequestId': 'b1',
          'providerDisplayName': 'الشيخ عبدالله',
          'guidanceText': 'المحافظة على أذكار الصباح والمساء، وقراءة سورة البقرة في البيت.',
          'recommendedTracks': [],
          'recordedAtUtc': slotStart,
          'acknowledgedAtUtc': null,
        },
      ])
      ..json('GET /api/v1/me/favorites', []);
    await pumpApp(tester, location: '/recommendations', server: server, refreshToken: 'r1');
    await snap('recommendations.png');
  });
}
