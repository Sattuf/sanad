import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

import '../../core/push.dart';
import '../../core/session.dart';

/*
  الدخول — نظير packages/shared/src/api/auth.ts وmobile/src/lib/auth.ts:
  جوجل الأصلي (وأبل على iPhone)، والحساب يُنشأ عند أول دخول بدور مستفيد بلا أي مستند (البند 8).
  رمز التحقق الثنائي يُطلب في التطبيق؛ أما المراحل الإدارية فتُكمل على الويب — التطبيق للمستفيد (ADR-0018).
*/

/// معرّف عميل الويب في Google Cloud: جمهور رمز الهوية الذي يقبله الخادم (Auth:Google:ClientId أو NativeClientIds).
const googleServerClientId = String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID');

/// معرّف عميل iOS (لا يلزم على أندرويد: يكفي تسجيل بصمة توقيع التطبيق في Google Cloud).
const googleIosClientId = String.fromEnvironment('GOOGLE_IOS_CLIENT_ID');

const webOnlyMessage = 'هذا الحساب إداري ويحتاج إكمال إعداد الأمان على موقع سند. تطبيق الجوال مخصص للمستفيدين.';

typedef AuthProviders = ({bool googleNative, bool apple});

class MyProfile {
  const MyProfile({
    required this.id,
    required this.displayName,
    this.email,
    this.emailConfirmed = false,
    this.phoneNumber,
    this.roles = const [],
    this.activeConsents = const [],
    this.hideIdentityUntilBookingConfirmed = false,
    this.quietHoursStartHourUtc,
    this.quietHoursEndHourUtc,
  });

  factory MyProfile.fromJson(Map<String, dynamic> j) => MyProfile(
        id: j['id'] as String,
        displayName: j['displayName'] as String,
        email: j['email'] as String?,
        emailConfirmed: j['emailConfirmed'] as bool? ?? false,
        phoneNumber: j['phoneNumber'] as String?,
        roles: ((j['roles'] as List?) ?? const []).cast<String>(),
        activeConsents: ((j['activeConsents'] as List?) ?? const []).cast<String>(),
        hideIdentityUntilBookingConfirmed: j['hideIdentityUntilBookingConfirmed'] as bool? ?? false,
        quietHoursStartHourUtc: (j['quietHoursStartHourUtc'] as num?)?.toInt(),
        quietHoursEndHourUtc: (j['quietHoursEndHourUtc'] as num?)?.toInt(),
      );

  final String id;
  final String displayName;
  final String? email;
  final bool emailConfirmed;
  final String? phoneNumber;
  final List<String> roles;
  final List<String> activeConsents;
  final bool hideIdentityUntilBookingConfirmed;
  final int? quietHoursStartHourUtc;
  final int? quietHoursEndHourUtc;

  /// الشروط والخصوصية إلزاميتان قبل أي شاشة مصادَقة (needsConsent في account.ts).
  bool get needsConsent => !activeConsents.contains('TermsOfService') || !activeConsents.contains('PrivacyPolicy');
}

/// نتيجة أي طريقة دخول (AuthResponse من الخادم).
sealed class SignInOutcome {
  const SignInOutcome();
}

class SignedIn extends SignInOutcome {
  const SignedIn({required this.isNewUser});
  final bool isNewUser;
}

class NeedsTwoFactor extends SignInOutcome {
  const NeedsTwoFactor(this.ticket);
  final String ticket;
}

class WebOnly extends SignInOutcome {
  const WebOnly();
}

/// رمز هوية من جوجل أو أبل على الجهاز — خلف واجهة للاختبارات.
abstract class NativeSignIn {
  bool get googleConfigured;
  Future<bool> appleAvailable();

  /// null = ألغى المستخدم.
  Future<String?> googleIdToken();

  /// null = ألغى المستخدم. nonce الخام يُرسل للخادم، ونظيره SHA-256 يُعطى لأبل.
  Future<({String identityToken, String rawNonce, String? name})?> apple();
}

class DeviceNativeSignIn implements NativeSignIn {
  Future<void>? _googleReady;

  @override
  bool get googleConfigured => googleServerClientId.isNotEmpty;

  @override
  Future<bool> appleAvailable() async => !kIsWeb && Platform.isIOS && await SignInWithApple.isAvailable();

  @override
  Future<String?> googleIdToken() async {
    final google = GoogleSignIn.instance;
    await (_googleReady ??= google.initialize(
      serverClientId: googleServerClientId,
      clientId: Platform.isIOS && googleIosClientId.isNotEmpty ? googleIosClientId : null,
    ));
    try {
      final account = await google.authenticate();
      final idToken = account.authentication.idToken;
      if (idToken == null) throw StateError('لم تُرجع جوجل رمز هوية.');
      return idToken;
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) return null;
      rethrow;
    } finally {
      // لا نحتفظ بجلسة جوجل في التطبيق — جلسة سند وحدها تكفي، ويختار المستخدم حسابه في كل مرة
      await google.signOut().catchError((_) {});
    }
  }

  @override
  Future<({String identityToken, String rawNonce, String? name})?> apple() async {
    final random = Random.secure();
    final rawNonce = base64Url.encode(List.generate(32, (_) => random.nextInt(256)));
    try {
      final c = await SignInWithApple.getAppleIDCredential(
        scopes: [AppleIDAuthorizationScopes.email, AppleIDAuthorizationScopes.fullName],
        nonce: sha256.convert(utf8.encode(rawNonce)).toString(),
      );
      final token = c.identityToken;
      if (token == null) throw StateError('لم تُرجع أبل رمز هوية.');
      // الاسم يصل من أبل في أول دخول فقط
      final name = [c.givenName, c.familyName].whereType<String>().join(' ').trim();
      return (identityToken: token, rawNonce: rawNonce, name: name.isEmpty ? null : name);
    } on SignInWithAppleAuthorizationException catch (e) {
      if (e.code == AuthorizationErrorCode.canceled) return null;
      rethrow;
    }
  }
}

final nativeSignInProvider = Provider<NativeSignIn>((ref) => DeviceNativeSignIn());

/// نقاط المصادقة والحساب — بلا رمز وصول لنقاط الدخول (auth: false) كما في auth.ts.
class AuthService {
  AuthService(this.ref);
  final Ref ref;

  Future<AuthProviders> providers() async {
    final j = await ref.read(apiProvider).get<Map<String, dynamic>>('/api/v1/auth/providers', auth: false);
    return (googleNative: j['googleNative'] == true, apple: j['apple'] == true);
  }

  Future<SignInOutcome?> withGoogle() async {
    final idToken = await ref.read(nativeSignInProvider).googleIdToken();
    if (idToken == null) return null;
    return _finish(await ref.read(apiProvider).post<Map<String, dynamic>>('/api/v1/auth/google/native', body: {'idToken': idToken}, auth: false));
  }

  Future<SignInOutcome?> withApple() async {
    final c = await ref.read(nativeSignInProvider).apple();
    if (c == null) return null;
    return _finish(await ref.read(apiProvider).post<Map<String, dynamic>>(
      '/api/v1/auth/apple',
      body: {'identityToken': c.identityToken, 'nonce': c.rawNonce, 'displayName': ?c.name},
      auth: false,
    ));
  }

  Future<SignInOutcome> verifyTwoFactor(String ticket, String code) async => _finish(
        await ref.read(apiProvider).post<Map<String, dynamic>>('/api/v1/auth/login/2fa/verify', body: {'ticket': ticket, 'code': code}, auth: false),
      );

  /// جلسة مكتملة تُحفظ؛ غير ذلك مرحلة وسيطة (completedTokens في auth.ts).
  SignInOutcome _finish(Map<String, dynamic> res) {
    final access = res['accessToken'] as String?;
    final refresh = res['refreshToken'] as String?;
    if (res['stage'] == 'Succeeded' && access != null && refresh != null) {
      ref.read(sessionProvider.notifier).setTokens(access, refresh);
      ref.invalidate(meProvider);
      unawaited(ref.read(pushRegistrationProvider).register());
      return SignedIn(isNewUser: res['isNewUser'] == true);
    }
    if (res['stage'] == 'RequiresTwoFactorCode' && res['ticket'] is String) return NeedsTwoFactor(res['ticket'] as String);
    return const WebOnly();
  }

  Future<void> recordConsents(List<String> types) async {
    for (final type in types) {
      await ref.read(apiProvider).post<Object?>('/api/v1/me/consent', body: {'type': type});
    }
    ref.invalidate(meProvider);
  }

  /// الخروج: إبطال الرمز على الخادم ثم مسحه محلياً — المسح يتم حتى لو تعذّر الاتصال.
  Future<void> signOut() async {
    final session = ref.read(sessionProvider.notifier);
    // رمز الجهاز أولاً، والجلسة ما زالت صالحة: لا تصل إشعارات حساب خرج منه
    await ref.read(pushRegistrationProvider).unregister();
    try {
      await ref.read(apiProvider).post<Object?>('/api/v1/auth/revoke', body: {'refreshToken': session.refreshToken});
    } catch (_) {
      // بلا شبكة: يكفي المسح المحلي، والرمز ينتهي على الخادم بمدته
    } finally {
      session.clear();
      ref.invalidate(meProvider);
    }
  }
}

final authProvider = Provider<AuthService>(AuthService.new);

/// الملف الشخصي — null بلا جلسة.
final meProvider = FutureProvider<MyProfile?>((ref) async {
  if (!ref.watch(signedInProvider)) return null;
  return MyProfile.fromJson(await ref.read(apiProvider).get<Map<String, dynamic>>('/api/v1/me'));
});
