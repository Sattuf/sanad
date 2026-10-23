import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sanad/core/api.dart';
import 'package:sanad/core/push.dart';
import 'package:sanad/core/session.dart';
import 'package:sanad/features/account/auth.dart';

import 'today_screen_test.dart' show FakeServer, MemoryRefreshStore;

class FakePushTokens implements PushTokens {
  bool allowed = true;
  String? current = 'device-token-1';
  bool deleted = false;
  final refreshes = StreamController<String>.broadcast();

  @override
  Future<bool> requestPermission() async => allowed;
  @override
  Future<String?> token() async => current;
  @override
  Stream<String> get onRefresh => refreshes.stream;
  @override
  Future<void> delete() async {
    deleted = true;
    current = null;
  }
}

void main() {
  group('نص الإشعار', () {
    test('عام بحسب النوع، ولا يحمل أي محتوى', () {
      expect(pushText('message.new', discreet: false), (title: 'سند', body: 'رسالة جديدة'));
      expect(pushText('booking.status', discreet: false), (title: 'سند', body: 'تحديث على حجزك'));
      expect(pushText('شيء-جديد', discreet: false), (title: 'سند', body: 'لديك تحديث جديد'));
      expect(pushText(null, discreet: false).body, 'لديك تحديث جديد');
    });

    test('في الوضع المتحفّظ محايد تماماً: لا «سند» ولا نوع الإشعار', () {
      for (final kind in ['message.new', 'booking.submitted', 'recommendation.new', null]) {
        expect(pushText(kind, discreet: true), (title: 'ملاحظاتي', body: 'لديك تحديث جديد'));
      }
    });
  });

  group('تسجيل رمز الجهاز', () {
    late FakeServer server;
    late FakePushTokens tokens;
    late ProviderContainer container;

    ProviderContainer build({PushTokens? push}) => ProviderContainer(overrides: [
          refreshTokenStoreProvider.overrideWithValue(MemoryRefreshStore()),
          pushTokensProvider.overrideWithValue(push),
          apiProvider.overrideWith((ref) => ApiClient(
                baseUrl: 'https://api.test',
                session: ref.read(sessionProvider.notifier),
                dio: Dio()..httpClientAdapter = server,
              )),
        ]);

    setUp(() {
      server = FakeServer()
        ..on('PUT /api/v1/me/push-devices', (_) => ResponseBody.fromString('', 204))
        ..on('POST /api/v1/me/push-devices/remove', (_) => ResponseBody.fromString('', 204))
        ..on('POST /api/v1/auth/revoke', (_) => ResponseBody.fromString('', 204));
      tokens = FakePushTokens();
      container = build(push: tokens)..read(sessionProvider.notifier).setTokens('a1', 'r1');
    });
    tearDown(() => container.dispose());

    test('بعد الدخول يُسجَّل الرمز، ويُحدَّث إن غيّره FCM', () async {
      await container.read(pushRegistrationProvider).register();
      final put = server.calls('PUT /api/v1/me/push-devices').single;
      expect(jsonDecode(put.data as String), {'token': 'device-token-1', 'platform': 'android'});

      tokens.refreshes.add('device-token-2');
      await pumpEventQueue();
      expect(jsonDecode(server.calls('PUT /api/v1/me/push-devices').last.data as String)['token'], 'device-token-2');
    });

    test('بلا إذن الإشعارات لا يُرسل شيء', () async {
      tokens.allowed = false;
      await container.read(pushRegistrationProvider).register();
      expect(server.calls('PUT /api/v1/me/push-devices'), isEmpty);
    });

    test('بلا إعداد Firebase (الحالة الافتراضية) لا يحدث شيء', () async {
      final plain = build(push: null)..read(sessionProvider.notifier).setTokens('a1', 'r1');
      addTearDown(plain.dispose);
      await plain.read(pushRegistrationProvider).register();
      await plain.read(pushRegistrationProvider).unregister();
      expect(server.requests, isEmpty);
    });

    test('الخروج يزيل رمز الجهاز من الخادم قبل إبطال الجلسة، ثم يحذفه من الجهاز', () async {
      await container.read(pushRegistrationProvider).register();
      await container.read(authProvider).signOut();

      final paths = server.requests.map((r) => '${r.method} ${r.uri.path}').toList();
      expect(paths.indexOf('POST /api/v1/me/push-devices/remove'), lessThan(paths.indexOf('POST /api/v1/auth/revoke')));
      expect(jsonDecode(server.calls('POST /api/v1/me/push-devices/remove').single.data as String), {'token': 'device-token-1'});
      expect(tokens.deleted, isTrue);
      expect(container.read(signedInProvider), isFalse);
    });
  });
}
