import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api.dart';
import 'audio.dart';

/*
  الجلسة (ADR-0014، docs/flutter-app-plan.md §7): رمز الوصول في الذاكرة فقط،
  ورمز التحديث في Keychain/Keystore — يبقى بعد إغلاق التطبيق، ولا يُكتب في SharedPreferences أبداً.
  رمز الوصول لا يُحفظ: بعد كل تشغيل يُطلب الأول بلا رمز، فيردّ الخادم 401 ويُجدَّد صامتاً مرة واحدة.
*/

/// مخزن رمز التحديث — يُستبدل في الاختبارات.
abstract class RefreshTokenStore {
  Future<String?> read();
  Future<void> write(String? token);
}

class SecureRefreshTokenStore implements RefreshTokenStore {
  static const _key = 'sanad.refresh';

  // بلا بصمة: الجلسة تُستعاد صامتاً؛ «بعد أول فتح للجهاز» ولهذا الجهاز فقط (لا نسخ احتياطي إلى جهاز آخر)
  final _storage = const FlutterSecureStorage(iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device));

  @override
  Future<String?> read() async {
    try {
      return await _storage.read(key: _key);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> write(String? token) async {
    try {
      token == null ? await _storage.delete(key: _key) : await _storage.write(key: _key, value: token);
    } catch (_) {
      // التخزين الآمن غير متاح: تبقى الجلسة في الذاكرة لهذا التشغيل فقط
    }
  }
}

final refreshTokenStoreProvider = Provider<RefreshTokenStore>((ref) => SecureRefreshTokenStore());

/// رمز التحديث المقروء عند بدء التطبيق (main يقرؤه قبل أول إطار).
final initialRefreshTokenProvider = Provider<String?>((ref) => null);

typedef SessionTokens = ({String? access, String? refresh});

class SessionNotifier extends Notifier<SessionTokens> implements SessionPort {
  @override
  SessionTokens build() => (access: null, refresh: ref.read(initialRefreshTokenProvider));

  bool get signedIn => state.refresh != null || state.access != null;

  @override
  String? get accessToken => state.access;

  @override
  String? get refreshToken => state.refresh;

  @override
  void setTokens(String access, String refresh) {
    state = (access: access, refresh: refresh);
    ref.read(refreshTokenStoreProvider).write(refresh);
  }

  @override
  void clear() {
    state = (access: null, refresh: null);
    ref.read(refreshTokenStoreProvider).write(null);
  }
}

final sessionProvider = NotifierProvider<SessionNotifier, SessionTokens>(SessionNotifier.new);

/// هل توجد جلسة (رمز تحديث محفوظ أو رمز وصول)؟
final signedInProvider = Provider<bool>((ref) {
  final s = ref.watch(sessionProvider);
  return s.refresh != null || s.access != null;
});

final apiProvider = Provider<ApiClient>(
  (ref) => ApiClient(
    baseUrl: apiBase,
    session: ref.read(sessionProvider.notifier),
  ),
);
