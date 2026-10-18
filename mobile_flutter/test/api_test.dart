// الحالات نفسها في packages/shared/src/api/__tests__/core.test.ts — العميلان يتصرفان بالطريقة نفسها.
import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sanad/core/api.dart';

/// محوّل HTTP وهمي: يردّ بالترتيب، ويسجّل الطلبات.
class FakeAdapter implements HttpClientAdapter {
  FakeAdapter(this.responses);
  final List<Object> responses; // ResponseBody أو استثناء يُرمى
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    requests.add(options);
    final r = responses.removeAt(0);
    if (r is Exception) throw r;
    return r as ResponseBody;
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody json(Object body, [int status = 200, Map<String, String> headers = const {}]) => ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        'content-type': ['application/json'],
        for (final e in headers.entries) e.key: [e.value],
      },
    );

class MemorySession implements SessionPort {
  MemorySession([this.accessToken, this.refreshToken]);
  @override
  String? accessToken;
  @override
  String? refreshToken;
  @override
  void setTokens(String access, String refresh) {
    accessToken = access;
    refreshToken = refresh;
  }

  @override
  void clear() {
    accessToken = null;
    refreshToken = null;
  }
}

({ApiClient client, FakeAdapter adapter, MemorySession session}) setup(List<Object> responses, {String? access, String? refresh}) {
  final adapter = FakeAdapter([...responses]);
  final session = MemorySession(access, refresh);
  final client = ApiClient(baseUrl: 'https://api.test/', session: session, dio: Dio()..httpClientAdapter = adapter);
  return (client: client, adapter: adapter, session: session);
}

void main() {
  group('الجلسة', () {
    test('يرسل رمز الوصول ويزيل الشرطة الأخيرة من العنوان', () async {
      final t = setup([json({})], access: 'a1', refresh: 'r1');
      await t.client.get<Object?>('/api/v1/me');
      expect(t.adapter.requests.single.uri.toString(), 'https://api.test/api/v1/me');
      expect(t.adapter.requests.single.headers['Authorization'], 'Bearer a1');
    });

    test('يجدد الرمز عند 401 ويعيد المحاولة مرة واحدة', () async {
      final tokens = {'accessToken': 'a2', 'refreshToken': 'r2', 'accessTokenExpiresAtUtc': '', 'refreshTokenExpiresAtUtc': ''};
      final t = setup([json({}, 401), json(tokens), json({'id': 'me'})], access: 'a1', refresh: 'r1');
      expect(await t.client.get<Map<String, dynamic>>('/api/v1/me'), {'id': 'me'});
      expect(t.adapter.requests, hasLength(3));
      expect(t.adapter.requests[1].uri.path, '/api/v1/auth/refresh');
      expect(jsonDecode(t.adapter.requests[1].data as String), {'refreshToken': 'r1'});
      expect(t.adapter.requests[2].headers['Authorization'], 'Bearer a2');
      expect((t.session.accessToken, t.session.refreshToken), ('a2', 'r2'));
    });

    test('بعد التشغيل بلا رمز وصول: 401 ثم تجديد صامت واحد', () async {
      final tokens = {'accessToken': 'a2', 'refreshToken': 'r2'};
      final t = setup([json({}, 401), json(tokens), json({'id': 'me'})], refresh: 'r1');
      expect(await t.client.get<Map<String, dynamic>>('/api/v1/me'), {'id': 'me'});
      expect(t.adapter.requests.first.headers.containsKey('Authorization'), isFalse);
    });

    test('طلبان متزامنان ينتهي رمزهما: تجديد واحد فقط', () async {
      final tokens = {'accessToken': 'a2', 'refreshToken': 'r2'};
      final t = setup([json({}, 401), json({}, 401), json(tokens), json({'n': 1}), json({'n': 2})], access: 'a1', refresh: 'r1');
      final results = await Future.wait([t.client.get<Object?>('/api/v1/a'), t.client.get<Object?>('/api/v1/b')]);
      expect(results, hasLength(2));
      expect(t.adapter.requests.where((r) => r.uri.path == '/api/v1/auth/refresh'), hasLength(1));
    });

    test('لا تجديد ثانٍ: 401 بعد التجديد يُرفع خطأً', () async {
      final tokens = {'accessToken': 'a2', 'refreshToken': 'r2'};
      final t = setup([json({}, 401), json(tokens), json({'title': 'غير مصرّح'}, 401)], access: 'a1', refresh: 'r1');
      await expectLater(t.client.get<Object?>('/api/v1/me'), throwsA(isA<ApiError>().having((e) => e.status, 'status', 401)));
      expect(t.adapter.requests, hasLength(3));
    });

    test('رفض التجديد بـ 401 يمسح الجلسة، و429 لا', () async {
      final rejected = setup([json({}, 401), json({}, 401)], access: 'a1', refresh: 'r1');
      await expectLater(rejected.client.get<Object?>('/api/v1/me'), throwsA(isA<ApiError>()));
      expect(rejected.session.refreshToken, isNull);

      final limited = setup([json({}, 401), json({}, 429)], access: 'a1', refresh: 'r1');
      await expectLater(limited.client.get<Object?>('/api/v1/me'), throwsA(isA<ApiError>()));
      expect(limited.session.refreshToken, 'r1');
    });

    test('auth: false لا يرسل الرمز ولا يجدّد', () async {
      final t = setup([json({}, 401)], access: 'a1', refresh: 'r1');
      await expectLater(t.client.post<Object?>('/api/v1/auth/google/native', body: {'idToken': 'x'}, auth: false), throwsA(isA<ApiError>()));
      expect(t.adapter.requests.single.headers.containsKey('Authorization'), isFalse);
    });

    test('انقطاع الشبكة يعطي رسالة عربية واضحة', () async {
      final t = setup([DioException.connectionError(requestOptions: RequestOptions(), reason: 'offline')]);
      final err = await t.client.get<Object?>('/api/v1/library').then<ApiError?>((_) => null, onError: (Object e) => e as ApiError);
      expect((err!.status, err.code), (0, 'network'));
    });

    test('ProblemDetails: رسالة الحقل الأولى أولاً', () async {
      final t = setup([
        json({
          'title': 'بيانات غير صالحة',
          'errors': {
            'displayName': ['الاسم مطلوب'],
          },
        }, 400),
      ]);
      final err = await t.client.patch<Object?>('/api/v1/me', body: {}).then<ApiError?>((_) => null, onError: (Object e) => e as ApiError);
      expect(err!.friendly, 'الاسم مطلوب');
      expect(err.title, 'بيانات غير صالحة');
    });
  });
}
