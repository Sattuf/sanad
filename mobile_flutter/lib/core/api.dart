import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';

import '../content/models.dart';

/*
  عميل الـ API — نظير packages/shared/src/api/core.ts حرفياً (ADR-0014، ADR-0023):
  ProblemDetails ← ApiError بعربية ودّية، تجديد الرمز مرة واحدة عند 401 (طلب تجديد واحد مهما تزامنت الطلبات)،
  ومسح الجلسة فقط حين يرفض الخادم رمز التحديث صراحة (400/401) لا عند حد المعدل أو عطل مؤقت،
  والتقاط إشارة الطوارئ من كل استجابة ناجحة أو فاشلة. تحرسه test/api_test.dart بالحالات نفسها في core.test.ts.
*/

const emergencyHeader = 'X-Sanad-Emergency-Referral';

/// خطأ موحّد من ProblemDetails الخلفي.
class ApiError implements Exception {
  ApiError(this.status, this.title, {this.code, this.errors, this.policyCategory});

  final int status;
  final String title;
  final String? code;
  final Map<String, List<String>>? errors;
  final String? policyCategory;

  /// أول رسالة حقل إن وُجدت، وإلا العنوان العام.
  String get friendly {
    for (final list in errors?.values ?? const <List<String>>[]) {
      if (list.isNotEmpty) return list.first;
    }
    return title;
  }

  @override
  String toString() => 'ApiError($status, $title)';
}

/// مكان الجلسة: رمز الوصول في الذاكرة، ورمز التحديث في Keychain/Keystore (lib/core/session.dart).
abstract class SessionPort {
  String? get accessToken;
  String? get refreshToken;
  void setTokens(String access, String refresh);
  void clear();
}

class ApiClient {
  ApiClient({required String baseUrl, required this.session, required this.onEmergency, Dio? dio})
      : baseUrl = baseUrl.replaceFirst(RegExp(r'/$'), ''),
        _dio = dio ?? Dio() {
    _dio.options
      ..validateStatus = ((_) => true)
      ..responseType = ResponseType.plain
      ..connectTimeout = const Duration(seconds: 15)
      ..receiveTimeout = const Duration(seconds: 30);
  }

  final String baseUrl;
  final SessionPort session;

  /// يُستدعى عند أي إشارة خطر؛ null تعني أن الخادم لم يرسل تفاصيل فتُعرض الإحالة الاحتياطية.
  final void Function(EmergencyReferral? referral) onEmergency;
  final Dio _dio;
  Future<bool>? _refreshing;

  String mediaUrl(String path) => path.startsWith('http') ? path : '$baseUrl$path';

  Future<T> get<T>(String path, {bool auth = true, Map<String, String>? headers}) => request<T>('GET', path, auth: auth, headers: headers);
  Future<T> post<T>(String path, {Object? body, bool auth = true, Map<String, String>? headers}) =>
      request<T>('POST', path, body: body, auth: auth, headers: headers);
  Future<T> put<T>(String path, {Object? body}) => request<T>('PUT', path, body: body);
  Future<T> patch<T>(String path, {Object? body}) => request<T>('PATCH', path, body: body);
  Future<T> del<T>(String path, {Object? body}) => request<T>('DELETE', path, body: body);

  Future<bool> _refreshTokens() {
    final refreshToken = session.refreshToken;
    if (refreshToken == null) return Future.value(false);
    return _refreshing ??= () async {
      try {
        final res = await _dio.post<String>(
          '$baseUrl/api/v1/auth/refresh',
          data: jsonEncode({'refreshToken': refreshToken}),
          options: Options(headers: {'Content-Type': 'application/json'}),
        );
        final status = res.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          // رفض صريح للجلسة فقط يمسحها؛ حد المعدل (429) أو خطأ خادم مؤقت لا يُخرج المستخدم
          if (status == 400 || status == 401) session.clear();
          return false;
        }
        final tokens = jsonDecode(res.data!) as Map<String, dynamic>;
        session.setTokens(tokens['accessToken'] as String, tokens['refreshToken'] as String);
        return true;
      } catch (_) {
        return false;
      } finally {
        scheduleMicrotask(() => _refreshing = null);
      }
    }();
  }

  Future<T> request<T>(String method, String path, {Object? body, bool auth = true, Map<String, String>? headers, bool retried = false}) async {
    final accessToken = session.accessToken;
    final h = <String, String>{'Accept': 'application/json', ...?headers};
    Object? data;
    if (body is FormData) {
      data = body;
    } else if (body != null) {
      h['Content-Type'] = 'application/json';
      data = jsonEncode(body);
    }
    if (accessToken != null && auth) h['Authorization'] = 'Bearer $accessToken';

    final Response<String> res;
    try {
      res = await _dio.request<String>('$baseUrl$path', data: data, options: Options(method: method, headers: h));
    } on DioException {
      throw ApiError(0, 'تعذّر الاتصال بالخادم. تحقق من اتصالك وحاول مجدداً.', code: 'network');
    }
    final status = res.statusCode ?? 0;

    if (status == 401 && !retried && auth && session.refreshToken != null) {
      if (await _refreshTokens()) return request<T>(method, path, body: body, auth: auth, headers: headers, retried: true);
    }

    Object? payload;
    final text = res.data;
    if (text != null && text.isNotEmpty) {
      try {
        payload = jsonDecode(text);
      } catch (_) {
        payload = null;
      }
    }
    _detectEmergency(res.headers.value(emergencyHeader), payload);

    if (status < 200 || status >= 300) {
      final p = payload is Map<String, dynamic> ? payload : const <String, dynamic>{};
      final title = p['title'] as String? ?? (status == 429 ? 'طلبات كثيرة — حاول بعد قليل.' : 'حدث خطأ غير متوقع.');
      throw ApiError(
        status,
        title,
        code: p['code'] as String?,
        errors: (p['errors'] as Map<String, dynamic>?)?.map((k, v) => MapEntry(k, (v as List).cast<String>())),
        policyCategory: p['policyCategory'] as String?,
      );
    }
    return payload as T;
  }

  /// الترويسة «1» أو emergencyReferral.required في الجسم ← إحالة (بتفاصيل الخادم إن أرسلها).
  void _detectEmergency(String? header, Object? payload) {
    final referral = payload is Map<String, dynamic> ? payload['emergencyReferral'] : null;
    final required = referral is Map<String, dynamic> && referral['required'] == true;
    if (header != '1' && !required) return;
    onEmergency(
      referral is Map<String, dynamic>
          ? (
              message: referral['message'] as String,
              contacts: [
                for (final c in (referral['contacts'] as List? ?? const []).cast<Map<String, dynamic>>())
                  (label: c['label'] as String, phoneNumber: c['phoneNumber'] as String),
              ],
            )
          : null,
    );
  }
}
