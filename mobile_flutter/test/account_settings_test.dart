import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sanad/core/api.dart';
import 'package:sanad/core/session.dart';
import 'package:sanad/features/care/chat_screens.dart';
import 'package:sanad/features/care/realtime.dart';

import 'care_test.dart' show booking, signedInServer;
import 'today_screen_test.dart' show FakeDevice, FakeServer, pumpApp, reveal;

// «حسابي» كاملاً (الأسابيع 7–9) والوقت الفعلي.

FakeServer accountServer() => signedInServer()
  ..json('GET /api/v1/me', {
    'id': 'u1',
    'displayName': 'سالم',
    'email': 'salem@example.com',
    'emailConfirmed': true,
    'roles': ['Beneficiary'],
    'activeConsents': ['TermsOfService', 'PrivacyPolicy'],
    'hideIdentityUntilBookingConfirmed': false,
    'quietHoursStartHourUtc': null,
    'quietHoursEndHourUtc': null,
  })
  // موعد قادم ثابت (لا DateTime.now) لتبقى اللقطة نفسها في كل تشغيل
  ..json('GET /api/v1/me/bookings', [booking('Accepted')..['slotStartUtc'] = '2030-01-05T07:00:00Z'])
  ..json('GET /api/v1/me/recommendations', [
    {
      'id': 'r1',
      'bookingRequestId': 'b1',
      'providerDisplayName': 'الشيخ عبدالله',
      'guidanceText': '…',
      'recommendedTracks': [],
      'recordedAtUtc': '2026-10-18T10:00:00Z',
      'acknowledgedAtUtc': null,
    },
  ])
  ..json('GET /api/v1/me/consent', [
    {
      'type': 'TermsOfService',
      'accepted': true,
      'acceptedVersion': '1.0',
      'currentVersion': '1.0',
      'needsReacceptance': false,
      'acceptedAtUtc': '2026-10-01T09:00:00Z',
    },
    {'type': 'MarketingCommunication', 'accepted': false, 'acceptedVersion': null, 'currentVersion': '1.0', 'needsReacceptance': false, 'acceptedAtUtc': null},
  ])
  ..json('GET /api/v1/me/access-log', [
    {'occurredAtUtc': '2026-10-17T09:00:00Z', 'action': 'Scheduling.BeneficiaryNoteRead', 'actorRole': 'AssignedProvider', 'bookingRequestId': 'b1'},
  ]);

void main() {
  testWidgets('حسابي: مواعيدك وتوصياتك، والأقسام بنصوص الويب، والروابط', (tester) async {
    await pumpApp(tester, location: '/account', server: accountServer(), refreshToken: 'r1');
    expect(find.text('مستفيد'), findsOneWidget);
    expect(find.text('مواعيدك القادمة'), findsOneWidget);
    expect(find.text('الشيخ عبدالله'), findsOneWidget);
    expect(find.text('لديك 1 توصية جديدة من مختصك.'), findsOneWidget);
    await reveal(tester, find.text('من اطّلع على بياناتك؟'));
    expect(find.text('اطّلع على ملاحظتك للمختص المرفقة بحجز'), findsOneWidget);
    expect(find.textContaining('المختص المكلّف — '), findsOneWidget);
    await reveal(tester, find.byKey(const ValueKey('link-/bookings')));
    expect(find.text('حجوزاتي'), findsOneWidget);
    expect(find.text('توصياتي'), findsOneWidget);
    expect(find.text('الإشعارات'), findsOneWidget);
  });

  testWidgets('الاسم والخصوصية يُحفظان بالحقول نفسها في الويب', (tester) async {
    final server = accountServer()
      ..json('PATCH /api/v1/me', null, 204)
      ..json('PATCH /api/v1/me/privacy-preferences', null, 204);
    await pumpApp(tester, location: '/account', server: server, refreshToken: 'r1');

    await reveal(tester, find.byKey(const ValueKey('display-name')));
    await tester.enterText(find.byKey(const ValueKey('display-name')), ' سالم أحمد ');
    await tester.pumpAndSettle();
    await reveal(tester, find.byKey(const ValueKey('save-name')));
    await tester.tap(find.byKey(const ValueKey('save-name')));
    await tester.pumpAndSettle();
    expect(jsonDecode(server.calls('PATCH /api/v1/me').single.data as String), {'displayName': 'سالم أحمد'});

    await reveal(tester, find.byKey(const ValueKey('hide-identity')));
    await tester.tap(find.byKey(const ValueKey('hide-identity')));
    await reveal(tester, find.byKey(const ValueKey('quiet-hours')));
    await tester.tap(find.byKey(const ValueKey('quiet-hours')));
    await tester.pumpAndSettle();
    expect(find.text('22:00'), findsOneWidget);
    await reveal(tester, find.byKey(const ValueKey('save-privacy')));
    await tester.tap(find.byKey(const ValueKey('save-privacy')));
    await tester.pumpAndSettle();
    expect(jsonDecode(server.calls('PATCH /api/v1/me/privacy-preferences').single.data as String), {
      'hideIdentityUntilBookingConfirmed': true,
      'quietHoursStartHourUtc': 22,
      'quietHoursEndHourUtc': 7,
    });
  });

  testWidgets('الموافقة الاختيارية تُمنح وتُسحب، والإلزامية بلا زر', (tester) async {
    final server = accountServer()..json('POST /api/v1/me/consent', null, 204);
    await pumpApp(tester, location: '/account', server: server, refreshToken: 'r1');
    await reveal(tester, find.byKey(const ValueKey('consent-MarketingCommunication')));
    expect(find.byKey(const ValueKey('consent-TermsOfService')), findsNothing);
    expect(find.text('موافق'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('consent-MarketingCommunication')));
    await tester.pumpAndSettle();
    expect(jsonDecode(server.calls('POST /api/v1/me/consent').single.data as String), {'type': 'MarketingCommunication'});
  });

  testWidgets('تصدير بياناتي: ملف JSON لورقة المشاركة', (tester) async {
    final device = FakeDevice();
    final server = accountServer()
      ..json('POST /api/v1/me/export', {
        'profile': {'displayName': 'سالم'},
      });
    await pumpApp(tester, location: '/account', server: server, refreshToken: 'r1', device: device);
    await reveal(tester, find.byKey(const ValueKey('export')));
    await tester.tap(find.byKey(const ValueKey('export')));
    await tester.pumpAndSettle();
    final file = device.outbound.shared.single;
    expect(file.name, 'sanad-my-data.json');
    expect(file.mimeType, 'application/json');
    expect(jsonDecode(utf8.decode(file.bytes)), {
      'profile': {'displayName': 'سالم'},
    });
  });

  testWidgets('حذف الحساب: العبارة حرفياً، ثم مسح الجلسة والتذكيرات وبيانات الجهاز', (tester) async {
    final device = FakeDevice()..refreshStore.token = 'r1';
    // تذكير صباحي مفعَّل من قبل
    await device.reminders.scheduleDaily(1, 6, 30);
    final server = accountServer()..json('DELETE /api/v1/me', null, 204);
    final prefs = await pumpApp(
      tester,
      location: '/account',
      server: server,
      refreshToken: 'r1',
      device: device,
      prefs: {'sanad.companion.v1': '{}', 'sanad.reminders': '["morning"]'},
    );

    final delete = find.byKey(const ValueKey('delete-account'));
    await reveal(tester, delete);
    expect(tester.widget<FilledButton>(delete).onPressed, isNull);
    await tester.enterText(find.byKey(const ValueKey('delete-confirm')), 'احذف حسابي');
    await tester.pumpAndSettle();
    await reveal(tester, delete);
    await tester.tap(delete);
    await tester.pumpAndSettle();

    expect(jsonDecode(server.calls('DELETE /api/v1/me').single.data as String), {'confirmation': 'احذف حسابي'});
    expect(device.refreshStore.token, isNull);
    expect(device.reminders.scheduled, isEmpty);
    expect(prefs.getString('sanad.companion.v1'), isNull);
    expect(prefs.getString('sanad.reminders'), isNull);
    expect(find.text('يومي'), findsWidgets);
  });

  testWidgets('بلا جلسة: صفحات الحساب تدعو للدخول، والدليل وحده ظاهر في الروابط', (tester) async {
    await pumpApp(tester, location: '/account', server: FakeServer());
    expect(find.byKey(const ValueKey('link-/directory')), findsOneWidget);
    expect(find.byKey(const ValueKey('link-/bookings')), findsNothing);
    await pumpApp(tester, location: '/recommendations', server: FakeServer());
    expect(find.text('هذه الصفحة تتطلب الدخول'), findsOneWidget);
  });

  group('الوقت الفعلي', () {
    late FakeServer server;
    late FakeConnector connector;
    late ProviderContainer container;

    setUp(() {
      server = signedInServer()..json('GET /api/v1/conversations/c1/messages', []);
      connector = FakeConnector();
      container = ProviderContainer(
        overrides: [
          initialRefreshTokenProvider.overrideWithValue('r1'),
          refreshTokenStoreProvider.overrideWithValue(FakeDevice().refreshStore),
          realtimeConnectorProvider.overrideWithValue(connector),
          apiProvider.overrideWith(
            (ref) => ApiClient(baseUrl: 'https://api.test', session: ref.read(sessionProvider.notifier), dio: Dio()..httpClientAdapter = server),
          ),
        ],
      );
      addTearDown(container.dispose);
    });

    test('يتصل بالجلسة برمز وصول مجدَّد، ويعيد جلب المحادثة المعنية فقط، ويُغلق عند الخروج', () async {
      final sub = container.listen(messagesProvider('c1'), (_, _) {});
      addTearDown(sub.close);
      await container.read(messagesProvider('c1').future);
      container.read(realtimeProvider);
      await connector.connected.future;
      expect(await connector.token!(), 'a1');

      connector.emit((name: 'messageReceived', conversationId: 'c1'));
      await container.read(messagesProvider('c1').future);
      connector.emit((name: 'messageReceived', conversationId: 'c2'));
      await container.read(messagesProvider('c1').future);
      expect(server.calls('GET /api/v1/conversations/c1/messages'), hasLength(2));

      container.read(sessionProvider.notifier).clear();
      container.read(realtimeProvider);
      await Future<void>.delayed(Duration.zero);
      expect(connector.closed, isTrue);
    });

    test('تعذّر الاتصال لا يرمي — الجلب الدوري يكفي', () async {
      connector.fail = true;
      container.read(realtimeProvider);
      await Future<void>.delayed(Duration.zero);
      expect(connector.closed, isFalse);
    });
  });
}

class FakeConnector implements RealtimeConnector {
  final connected = Completer<void>();
  Future<String> Function()? token;
  void Function(RealtimeEvent)? _onEvent;
  bool closed = false;
  bool fail = false;

  void emit(RealtimeEvent e) => _onEvent!(e);

  @override
  Future<RealtimeLink> connect(Future<String> Function() accessToken, void Function(RealtimeEvent) onEvent) async {
    if (fail) throw StateError('offline');
    token = accessToken;
    _onEvent = onEvent;
    connected.complete();
    return _FakeLink(this);
  }
}

class _FakeLink implements RealtimeLink {
  _FakeLink(this.c);
  final FakeConnector c;

  @override
  Future<void> close() async => c.closed = true;
}
