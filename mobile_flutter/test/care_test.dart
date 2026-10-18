import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sanad/core/format.dart';

import 'today_screen_test.dart' show FakeServer, jsonBody, pumpApp, reveal;

// الأسابيع 7–9: الدليل والحجز والمحادثة والتوصيات والإشعارات، بخادم وهمي (لا طلب يخرج من الاختبارات).

const verified = {'status': 'Approved', 'lastCheckedAtUtc': '2026-10-01T09:00:00Z', 'expiresAtUtc': null, 'isConditional': false};

Map<String, dynamic> dirItem(String id, String name, {String kind = 'Provider', String? org}) => {
  'kind': kind,
  'id': id,
  'displayName': name,
  'title': kind == 'Provider' ? 'راقٍ شرعي' : null,
  'track': 'WaqfFree',
  'practitionerType': kind == 'Provider' ? 'ReligiousPractitioner' : null,
  'deliveryMode': kind == 'Provider' ? 'Remote' : null,
  'city': 'الرياض',
  'languages': ['العربية'],
  'verification': verified,
  'organizationName': org,
  'summary': 'رقية شرعية بالقرآن والأدعية المأثورة.',
};

final provider = {
  'id': 'p1',
  'displayName': 'الشيخ عبدالله',
  'declaredTitle': 'راقٍ شرعي',
  'practitionerType': 'ReligiousPractitioner',
  'track': 'WaqfFree',
  'practiceScope': 'الرقية بالقرآن والسنة.',
  'languages': ['العربية'],
  'deliveryMode': 'Remote',
  'city': 'الرياض',
  'professionalBoundariesNote': 'الرقية دعاء وسبب، والشفاء بيد الله وحده.',
  'organizationId': 'o1',
  'organizationName': 'جمعية النور',
  'verification': verified,
  'offerings': [
    {
      'id': 'off1',
      'category': 'رقية',
      'description': 'جلسة رقية عن بعد.',
      'cancellationPolicy': 'قبل 24 ساعة.',
      'explicitExclusions': ['لا وعد بنتيجة'],
      'sessionDurationMinutes': 45,
    },
  ],
};

const slotStart = '2026-10-20T07:00:00Z';
const slot2Start = '2026-10-20T08:00:00Z';

Map<String, dynamic> booking(String status) => {
  'id': 'b1',
  'status': status,
  'slotStartUtc': slotStart,
  'slotEndUtc': '2026-10-20T07:45:00Z',
  'providerProfileId': 'p1',
  'providerDisplayName': 'الشيخ عبدالله',
  'serviceCategory': 'رقية',
  'counterpartDisplayName': null,
  'administrativeReasonForRejection': null,
  'conversationId': null,
};

/// خادم بجلسة قائمة: الملف يطلب رمز وصول كالخادم الحقيقي، فيُجدَّد صامتاً أول مرة.
FakeServer signedInServer() => FakeServer()
  ..json('POST /api/v1/auth/refresh', {'accessToken': 'a1', 'refreshToken': 'r1'})
  ..on(
    'GET /api/v1/me',
    (r) => r.headers['Authorization'] == null
        ? jsonBody(null, 401)
        : jsonBody({
            'id': 'u1',
            'displayName': 'سالم',
            'roles': ['Beneficiary'],
            'activeConsents': ['TermsOfService', 'PrivacyPolicy'],
          }),
  );

void main() {
  group('الدليل', () {
    testWidgets('عام بلا حساب: النتائج ببطاقاتها، والمسار والبحث يُرسلان للخادم بلا رمز', (tester) async {
      final server = FakeServer()
        ..on('GET /api/v1/directory', (r) {
          final q = r.uri.queryParameters;
          final items = [
            dirItem('p1', 'الشيخ عبدالله', org: 'جمعية النور'),
            dirItem('o1', 'جمعية النور', kind: 'Organization'),
          ].where((i) => (q['q'] == null || (i['displayName'] as String).contains(q['q']!))).toList();
          return jsonBody({'items': items, 'page': 1, 'pageSize': 12, 'total': items.length});
        });
      await pumpApp(tester, location: '/directory', server: server);

      expect(find.text('الدليل'), findsOneWidget);
      expect(find.text('2 نتيجة'), findsOneWidget);
      expect(find.text('الشيخ عبدالله'), findsOneWidget);
      expect(find.text('ضمن: جمعية النور'), findsOneWidget);
      expect(find.text('موثّق إدارياً'), findsNWidgets(2));
      expect(find.text('جهة'), findsOneWidget);
      final first = server.calls('GET /api/v1/directory').single;
      expect(first.uri.queryParameters, {'pageSize': '12'});
      expect(first.headers.containsKey('Authorization'), isFalse);

      await tester.enterText(find.byKey(const ValueKey('directory-q')), 'جمعية');
      await tester.tap(find.byKey(const ValueKey('directory-search')));
      await tester.pumpAndSettle();
      expect(server.calls('GET /api/v1/directory').last.uri.queryParameters['q'], 'جمعية');
      expect(find.text('1 نتيجة'), findsOneWidget);

      await tester.tap(find.text('كل المسارات'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('دعوي وإرشادي').last);
      await tester.pumpAndSettle();
      expect(server.calls('GET /api/v1/directory').last.uri.queryParameters, {'q': 'جمعية', 'track': 'DawahGuidance', 'pageSize': '12'});
    });

    testWidgets('لا نتائج: حالة فارغة بنص الويب', (tester) async {
      final server = FakeServer()..json('GET /api/v1/directory', {'items': [], 'page': 1, 'pageSize': 12, 'total': 0});
      await pumpApp(tester, location: '/directory', server: server);
      expect(find.text('لا نتائج مطابقة بعد'), findsOneWidget);
    });

    testWidgets('صفحة المختص: النطاق والحدود والخدمات، والحجز بلا جلسة يفتح الدخول', (tester) async {
      final server = FakeServer()
        ..json('GET /api/v1/providers/p1', provider)
        ..json('GET /api/v1/auth/providers', {'google': true, 'googleNative': true, 'apple': false, 'captchaEnabled': false, 'captchaSiteKey': null});
      await pumpApp(tester, location: '/providers/p1', server: server);

      expect(find.text('الشيخ عبدالله'), findsOneWidget);
      expect(find.text('الرقية بالقرآن والسنة.'), findsOneWidget);
      expect(find.text('الرقية دعاء وسبب، والشفاء بيد الله وحده.'), findsOneWidget);
      expect(find.text('45 دقيقة — مجانية'), findsOneWidget);
      expect(find.text('لا تشمل: لا وعد بنتيجة'), findsOneWidget);
      expect(find.text('لاحظت مشكلة؟'), findsNothing); // الإبلاغ للمسجّلين فقط

      await reveal(tester, find.byKey(const ValueKey('book-off1')));
      await tester.tap(find.byKey(const ValueKey('book-off1')));
      await tester.pumpAndSettle();
      expect(find.text('أهلاً بك في سند'), findsOneWidget);
    });

    testWidgets('صفحة الجهة: مقدّموها ببطاقات تفتح صفحاتهم', (tester) async {
      final server = FakeServer()
        ..json('GET /api/v1/organizations/o1', {
          'id': 'o1',
          'displayName': 'جمعية النور',
          'legalName': 'جمعية النور الخيرية',
          'track': 'WaqfFree',
          'publicDescription': 'جمعية وقفية.',
          'city': 'الرياض',
          'verificationSourceUrl': null,
          'verification': verified,
          'providers': [dirItem('p1', 'الشيخ عبدالله', org: 'جمعية النور')],
        })
        ..json('GET /api/v1/providers/p1', provider);
      await pumpApp(tester, location: '/organizations/o1', server: server);
      expect(find.text('جمعية النور الخيرية'), findsOneWidget);
      expect(find.text('مقدّمو الخدمة في هذه الجهة'), findsOneWidget);
      await tester.tap(find.text('الشيخ عبدالله'));
      await tester.pumpAndSettle();
      expect(find.text('نطاق الممارسة'), findsOneWidget);
    });
  });

  group('الحجز', () {
    FakeServer bookingServer({int createStatus = 200}) {
      var slots = [
        {'id': 's1', 'startUtc': slotStart, 'endUtc': '2026-10-20T07:45:00Z', 'status': 'Open'},
        {'id': 's2', 'startUtc': slot2Start, 'endUtc': '2026-10-20T08:45:00Z', 'status': 'Open'},
      ];
      return signedInServer()
        ..json('GET /api/v1/providers/p1', provider)
        ..on('GET /api/v1/providers/p1/availability', (_) => jsonBody(slots))
        ..on('POST /api/v1/bookings', (_) {
          if (createStatus == 409) {
            slots = slots.sublist(1);
            return jsonBody({'title': 'هذا الموعد لم يعد متاحاً.'}, 409);
          }
          return jsonBody({'id': 'b1', 'status': 'Submitted', 'slotStartUtc': slotStart, 'slotEndUtc': '2026-10-20T07:45:00Z'});
        })
        ..json('GET /api/v1/bookings/b1', booking('Submitted'))
        ..json('GET /api/v1/bookings/b1/note', {'bookingId': 'b1', 'note': 'أعاني من الأرق.'});
    }

    testWidgets('بلا جلسة: الحجز يطلب الدخول', (tester) async {
      await pumpApp(tester, location: '/book/p1', server: FakeServer());
      expect(find.text('هذه الصفحة تتطلب الدخول'), findsOneWidget);
    });

    testWidgets('خدمة وموعد وملاحظة بموافقة، بمفتاح تكرار، ثم صفحة الحجز', (tester) async {
      final server = bookingServer();
      await pumpApp(tester, location: '/book/p1?offering=off1', server: server, refreshToken: 'r1');

      expect(find.text('حجز موعد مع الشيخ عبدالله'), findsOneWidget);
      expect(find.text(formatDay(slotStart)), findsOneWidget);
      final submit = find.byKey(const ValueKey('submit-booking'));
      bool enabled() => tester.widget<FilledButton>(submit).onPressed != null;
      await reveal(tester, submit);
      expect(enabled(), isFalse);

      await reveal(tester, find.text(formatTime(slotStart)));
      await tester.tap(find.text(formatTime(slotStart)));
      await tester.pumpAndSettle();
      await reveal(tester, submit);
      expect(enabled(), isTrue);

      // الملاحظة تطلب الموافقة على معالجتها قبل الإرسال
      await tester.enterText(find.byKey(const ValueKey('booking-note')), 'أعاني من الأرق.');
      await tester.pumpAndSettle();
      await reveal(tester, submit);
      expect(enabled(), isFalse);
      await reveal(tester, find.byKey(const ValueKey('consent')));
      await tester.tap(find.byKey(const ValueKey('consent')));
      await tester.pumpAndSettle();

      await reveal(tester, submit);
      await tester.tap(submit);
      await tester.pumpAndSettle();
      final call = server.calls('POST /api/v1/bookings').single;
      expect(jsonDecode(call.data as String), {
        'serviceOfferingId': 'off1',
        'availabilitySlotId': 's1',
        'beneficiaryNote': 'أعاني من الأرق.',
        'consentToSensitiveNoteProcessing': true,
      });
      expect(call.headers['Idempotency-Key'], matches(RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')));

      expect(find.text('حجز مع الشيخ عبدالله'), findsOneWidget);
      expect(find.text('مُرسَل'), findsOneWidget);
      expect(find.text('أعاني من الأرق.'), findsOneWidget);
    });

    testWidgets('موعد أُخذ (409): رسالة، وتحديث المواعيد، ومفتاح جديد للمحاولة التالية', (tester) async {
      final server = bookingServer(createStatus: 409);
      await pumpApp(tester, location: '/book/p1?offering=off1', server: server, refreshToken: 'r1');
      await reveal(tester, find.text(formatTime(slotStart)));
      await tester.tap(find.text(formatTime(slotStart)));
      await tester.pumpAndSettle();
      await reveal(tester, find.byKey(const ValueKey('submit-booking')));
      await tester.tap(find.byKey(const ValueKey('submit-booking')));
      await tester.pumpAndSettle();

      expect(find.text('هذا الموعد لم يعد متاحاً.'), findsOneWidget);
      expect(find.text(formatTime(slotStart)), findsNothing);
      await reveal(tester, find.text(formatTime(slot2Start)));
      await tester.tap(find.text(formatTime(slot2Start)));
      await tester.pumpAndSettle();
      await reveal(tester, find.byKey(const ValueKey('submit-booking')));
      await tester.tap(find.byKey(const ValueKey('submit-booking')));
      await tester.pumpAndSettle();
      final keys = server.calls('POST /api/v1/bookings').map((c) => c.headers['Idempotency-Key']).toList();
      expect(keys, hasLength(2));
      expect(keys.first, isNot(keys.last));
    });

    testWidgets('حجوزاتي: كل حجز بحالته، ويفتح تفاصيله', (tester) async {
      final server = signedInServer()
        ..json('GET /api/v1/me/bookings', [booking('Accepted')])
        ..json('GET /api/v1/bookings/b1', booking('Accepted'))
        ..json('GET /api/v1/bookings/b1/note', {'bookingId': 'b1', 'note': null});
      await pumpApp(tester, location: '/bookings', server: server, refreshToken: 'r1');
      expect(find.text('حجوزاتي'), findsOneWidget);
      expect(find.text('مؤكَّد'), findsOneWidget);
      expect(find.text('رقية — ${formatDateTime(slotStart)}'), findsOneWidget);
      await tester.tap(find.text('الشيخ عبدالله'));
      await tester.pumpAndSettle();
      expect(find.text('لم تكتب ملاحظة.'), findsOneWidget);
      expect(find.text('توصيات مختصك تظهر في صفحة «توصياتي» ←'), findsOneWidget);
    });

    testWidgets('موعد بديل: قبوله، والإلغاء بتأكيد، والمحادثة الإدارية', (tester) async {
      var status = 'AlternativeProposed';
      final server = signedInServer()
        ..on('GET /api/v1/bookings/b1', (_) => jsonBody(booking(status)))
        ..json('GET /api/v1/bookings/b1/note', {'bookingId': 'b1', 'note': null})
        ..on('POST /api/v1/bookings/b1/accept', (_) {
          status = 'Accepted';
          return jsonBody(null, 204);
        })
        ..on('POST /api/v1/bookings/b1/cancel', (_) {
          status = 'Cancelled';
          return jsonBody(null, 204);
        })
        ..json('POST /api/v1/bookings/b1/conversation', {
          'id': 'c1',
          'bookingRequestId': 'b1',
          'status': 'Active',
          'lastMessageAtUtc': null,
          'counterpartDisplayName': 'الشيخ عبدالله',
        })
        ..json('GET /api/v1/me/conversations', [])
        ..json('GET /api/v1/conversations/c1/messages', []);
      await pumpApp(tester, location: '/bookings/b1', server: server, refreshToken: 'r1');

      expect(find.text('اقترح المختص موعداً بديلاً'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('accept')));
      await tester.pumpAndSettle();
      expect(server.calls('POST /api/v1/bookings/b1/accept'), hasLength(1));
      expect(find.text('مؤكَّد'), findsOneWidget);
      expect(find.byKey(const ValueKey('accept')), findsNothing);

      await tester.tap(find.byKey(const ValueKey('cancel')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('تراجع'));
      await tester.pumpAndSettle();
      expect(server.calls('POST /api/v1/bookings/b1/cancel'), isEmpty);

      await tester.tap(find.byKey(const ValueKey('open-chat')));
      await tester.pumpAndSettle();
      expect(find.text('لا رسائل بعد. ابدأ بتنسيق تفاصيل موعدك.'), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('cancel')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('confirm-cancel')));
      await tester.pumpAndSettle();
      expect(server.calls('POST /api/v1/bookings/b1/cancel'), hasLength(1));
      expect(find.text('ملغى'), findsOneWidget);
      expect(find.byKey(const ValueKey('cancel')), findsNothing);
    });
  });

  group('المحادثة', () {
    testWidgets('الرسائل بجهتيها، والإرسال يعيد الجلب، والتحذير ظاهر', (tester) async {
      final messages = [
        {
          'id': 'm1',
          'conversationId': 'c1',
          'senderUserId': 'p',
          'isMine': false,
          'body': 'السلام عليكم، الموعد مؤكد.',
          'status': 'Sent',
          'sentAtUtc': slotStart,
        },
      ];
      final server = signedInServer()
        ..json('GET /api/v1/me/conversations', [
          {'id': 'c1', 'bookingRequestId': 'b1', 'status': 'Active', 'lastMessageAtUtc': null, 'counterpartDisplayName': 'الشيخ عبدالله'},
        ])
        ..on('GET /api/v1/conversations/c1/messages', (_) => jsonBody(messages))
        ..on('POST /api/v1/conversations/c1/messages', (r) {
          final body = (jsonDecode(r.data as String) as Map)['body'] as String;
          messages.add({'id': 'm2', 'conversationId': 'c1', 'senderUserId': 'u1', 'isMine': true, 'body': body, 'status': 'Sent', 'sentAtUtc': slot2Start});
          return jsonBody({'id': 'm2', 'conversationId': 'c1', 'sentAtUtc': slot2Start});
        });
      await pumpApp(tester, location: '/conversations/c1', server: server, refreshToken: 'r1');

      expect(find.text('محادثة مع الشيخ عبدالله'), findsOneWidget);
      expect(find.textContaining('وليست مراقَبة لحظياً', findRichText: true), findsOneWidget);
      expect(find.text('السلام عليكم، الموعد مؤكد.'), findsOneWidget);
      expect(tester.widget<FilledButton>(find.byKey(const ValueKey('send'))).onPressed, isNull);

      await tester.enterText(find.byKey(const ValueKey('message')), '  وعليكم السلام  ');
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('send')));
      await tester.pumpAndSettle();
      expect(jsonDecode(server.calls('POST /api/v1/conversations/c1/messages').single.data as String), {'body': 'وعليكم السلام'});
      expect(find.text('وعليكم السلام'), findsOneWidget);
      expect(tester.widget<TextField>(find.byKey(const ValueKey('message'))).controller!.text, isEmpty);
    });

    testWidgets('محادثة مقيّدة: لا إرسال، وبلاغ عن المحادثة يصل', (tester) async {
      final server = signedInServer()
        ..json('GET /api/v1/me/conversations', [
          {'id': 'c1', 'bookingRequestId': 'b1', 'status': 'Restricted', 'lastMessageAtUtc': null, 'counterpartDisplayName': 'الشيخ عبدالله'},
        ])
        ..json('GET /api/v1/conversations/c1/messages', [])
        ..json('POST /api/v1/conversations/c1/report', {'id': 'r1'});
      await pumpApp(tester, location: '/conversations/c1', server: server, refreshToken: 'r1');

      expect(find.text('هذه المحادثة مقيّدة إدارياً ولا تقبل رسائل جديدة.'), findsOneWidget);
      expect(tester.widget<TextField>(find.byKey(const ValueKey('message'))).enabled, isFalse);

      await tester.tap(find.byKey(const ValueKey('report-toggle')));
      await tester.pumpAndSettle();
      expect(find.text('الإبلاغ عن هذه المحادثة'), findsOneWidget);
      await tester.enterText(find.byKey(const ValueKey('report-description')), 'طلب مالاً');
      await tester.tap(find.byKey(const ValueKey('send-report')));
      await tester.pumpAndSettle();
      expect(jsonDecode(server.calls('POST /api/v1/conversations/c1/report').single.data as String), {
        'category': 'Harassment',
        'severity': 'Medium',
        'description': 'طلب مالاً',
      });
      expect(find.text('وصل بلاغك'), findsOneWidget);
    });
  });

  testWidgets('بلاغ عام من صفحة المختص: النوع والخطورة بمفتاح تكرار', (tester) async {
    final server = signedInServer()
      ..json('GET /api/v1/providers/p1', provider)
      ..json('POST /api/v1/reports', {'id': 'r1'});
    await pumpApp(tester, location: '/providers/p1', server: server, refreshToken: 'r1');
    await reveal(tester, find.text('إبلاغ'));
    await tester.tap(find.text('إبلاغ'));
    await tester.pumpAndSettle();
    expect(find.text('ادعاء غير مصرّح'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('send-report')));
    await tester.pumpAndSettle();
    final call = server.calls('POST /api/v1/reports').single;
    expect(jsonDecode(call.data as String), {
      'targetType': 'ProviderProfile',
      'targetId': 'p1',
      'category': 'UnauthorizedClaim',
      'severity': 'Medium',
      'description': null,
    });
    expect(call.headers['Idempotency-Key'], isNotNull);
    expect(find.text('سيراجعه فريق التنسيق. شكراً لمساعدتك في حماية الآخرين.'), findsOneWidget);
  });

  testWidgets('توصياتي: التوجيه والمقاطع، و«تم الاطّلاع» يُسجَّل', (tester) async {
    var acknowledged = false;
    final server = signedInServer()
      ..on(
        'GET /api/v1/me/recommendations',
        (_) => jsonBody([
          {
            'id': 'r1',
            'bookingRequestId': 'b1',
            'providerDisplayName': 'الشيخ عبدالله',
            'guidanceText': 'المحافظة على أذكار الصباح والمساء.',
            'recommendedTracks': [
              {
                'id': 't1',
                'title': 'سورة البقرة',
                'sourceLabel': 'مشاري العفاسي',
                'description': null,
                'category': 'QuranRecitation',
                'durationSeconds': 125,
                'audioUrl': '/api/v1/library/tracks/t1/audio',
                'mediaKind': 'StoredAudio',
                'youTubeVideoId': null,
                'sourceUrl': null,
              },
            ],
            'recordedAtUtc': slotStart,
            'acknowledgedAtUtc': acknowledged ? slot2Start : null,
          },
        ]),
      )
      ..on('POST /api/v1/me/recommendations/r1/acknowledge', (_) {
        acknowledged = true;
        return jsonBody(null, 204);
      })
      ..json('GET /api/v1/me/favorites', []);
    await pumpApp(tester, location: '/recommendations', server: server, refreshToken: 'r1');
    expect(find.text('المحافظة على أذكار الصباح والمساء.'), findsOneWidget);
    expect(find.text('مقاطع مقترحة للاستماع'), findsOneWidget);
    expect(find.text('سورة البقرة'), findsOneWidget);
    await reveal(tester, find.byKey(const ValueKey('ack-r1')));
    await tester.tap(find.byKey(const ValueKey('ack-r1')));
    await tester.pumpAndSettle();
    expect(server.calls('POST /api/v1/me/recommendations/r1/acknowledge'), hasLength(1));
    expect(find.text('اطّلعت عليها'), findsOneWidget);
  });

  testWidgets('الإشعارات: غير المقروء بإطار، وتعليم الكل كمقروء', (tester) async {
    var read = false;
    final server = signedInServer()
      ..on(
        'GET /api/v1/me/notifications',
        (_) => jsonBody([
          {'id': 'n1', 'title': 'تأكيد موعد', 'body': 'أكّد المختص موعدك.', 'link': '/bookings/b1', 'isRead': read, 'createdAtUtc': slotStart},
        ]),
      )
      ..on('POST /api/v1/me/notifications/read-all', (_) {
        read = true;
        return jsonBody(null, 204);
      });
    await pumpApp(tester, location: '/notifications', server: server, refreshToken: 'r1');
    expect(find.text('تأكيد موعد'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('read-all')));
    await tester.pumpAndSettle();
    expect(server.calls('POST /api/v1/me/notifications/read-all'), hasLength(1));
    expect(find.byKey(const ValueKey('read-all')), findsNothing);
  });
}
