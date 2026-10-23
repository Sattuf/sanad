import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'session.dart';

/*
  إشعارات الخادم (FCM): «قبل الشيخ حجزك»، «رسالة جديدة» — تصل والتطبيق مغلق.
  - الإعداد من --dart-define (لا google-services.json في المستودع): بلا قيم لا يبدأ Firebase ولا يُطلب شيء،
    ويعمل التطبيق كما كان. راجع docs/flutter-beta-checklist.md.
  - الخادم يرسل نوع الإشعار فقط، بلا عنوان ولا نص؛ التطبيق يكتب النص بنفسه، فيحترم الوضع المتحفّظ
    («ملاحظاتي» وأيقونة محايدة) ولا يمر أي نص عبر Google.
*/

const _apiKey = String.fromEnvironment('FIREBASE_API_KEY');
const _appId = String.fromEnvironment('FIREBASE_APP_ID');
const _senderId = String.fromEnvironment('FIREBASE_SENDER_ID');
const _projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');

/// إعداد Firebase إن مُرّر كاملاً، وإلا null (الإشعارات معطّلة).
FirebaseOptions? get firebaseOptions => _apiKey.isEmpty || _appId.isEmpty || _senderId.isEmpty || _projectId.isEmpty
    ? null
    : const FirebaseOptions(apiKey: _apiKey, appId: _appId, messagingSenderId: _senderId, projectId: _projectId);

/// نص الإشعار الظاهر: عام دائماً، ومحايد تماماً في الوضع المتحفّظ.
({String title, String body}) pushText(String? kind, {required bool discreet}) {
  if (discreet) return (title: 'ملاحظاتي', body: 'لديك تحديث جديد');
  final body = switch (kind) {
    'booking.submitted' => 'طلب حجز جديد',
    'booking.status' => 'تحديث على حجزك',
    'message.new' => 'رسالة جديدة',
    'recommendation.new' => 'توصية جديدة من المختص',
    'verification.decided' => 'تحديث على طلب التوثيق',
    'khatma.completed' => 'اكتملت الختمة',
    _ => 'لديك تحديث جديد',
  };
  return (title: 'سند', body: body);
}

/// يعرض الإشعار من رسالة الخادم. يعمل في العزلة الخلفية أيضاً (التطبيق مغلق)، فيقرأ الوضع المتحفّظ من التخزين مباشرة.
Future<void> showPushNotification(RemoteMessage message) async {
  final prefs = await SharedPreferences.getInstance();
  final discreet = prefs.getString('sanad.discreet') == 'true';
  final text = pushText(message.data['kind'] as String?, discreet: discreet);
  final plugin = FlutterLocalNotificationsPlugin();
  await plugin.initialize(settings: const InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher')));
  await plugin.show(
    id: message.messageId.hashCode & 0x7fffffff,
    title: text.title,
    body: text.body,
    notificationDetails: NotificationDetails(
      android: AndroidNotificationDetails(
        'updates',
        'التحديثات',
        channelDescription: 'الحجوزات والرسائل والتوصيات',
        importance: Importance.high,
        priority: Priority.high,
        icon: discreet ? 'ic_stat_notes' : null,
      ),
    ),
    // صفحة الإشعارات تعرض التفاصيل وروابطها، فلا حاجة لمسار من الخادم هنا
    payload: '/notifications',
  );
}

@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  final options = firebaseOptions;
  if (options == null) return;
  await Firebase.initializeApp(options: options);
  await showPushNotification(message);
}

/// يبدأ Firebase ومعالج الخلفية إن كان الإعداد موجوداً. في المقدمة لا إشعار: الصفحات تتحدّث لحظياً (SignalR).
Future<bool> initPush() async {
  final options = firebaseOptions;
  if (options == null || kIsWeb) return false;
  await Firebase.initializeApp(options: options);
  FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);
  return true;
}

/// رمز الجهاز من FCM — خلف واجهة لتُستبدل في الاختبارات.
abstract class PushTokens {
  Future<bool> requestPermission();
  Future<String?> token();
  Stream<String> get onRefresh;
  Future<void> delete();
}

class FirebasePushTokens implements PushTokens {
  FirebaseMessaging get _fm => FirebaseMessaging.instance;

  @override
  Future<bool> requestPermission() async {
    final s = await _fm.requestPermission();
    return s.authorizationStatus == AuthorizationStatus.authorized || s.authorizationStatus == AuthorizationStatus.provisional;
  }

  @override
  Future<String?> token() => _fm.getToken();

  @override
  Stream<String> get onRefresh => _fm.onTokenRefresh;

  @override
  Future<void> delete() => _fm.deleteToken();
}

/// null حين لا إعداد لـ Firebase: كل ما يخص الإشعارات يصبح بلا أثر.
final pushTokensProvider = Provider<PushTokens?>((ref) => firebaseOptions == null ? null : FirebasePushTokens());

/// تسجيل رمز الجهاز للحساب الداخل، وإزالته عند الخروج.
class PushRegistration {
  PushRegistration(this.ref);
  final Ref ref;
  StreamSubscription<String>? _refresh;
  String? _current;

  String get _platform => defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';

  Future<void> _put(String token) async {
    _current = token;
    await ref.read(apiProvider).put<Object?>('/api/v1/me/push-devices', body: {'token': token, 'platform': _platform});
  }

  /// بعد الدخول، وعند فتح التطبيق بجلسة قائمة. أي فشل (لا إذن، لا شبكة) لا يمنع شيئاً.
  Future<void> register() async {
    final tokens = ref.read(pushTokensProvider);
    if (tokens == null) return;
    try {
      if (!await tokens.requestPermission()) return;
      final token = await tokens.token();
      if (token == null) return;
      await _put(token);
      _refresh ??= tokens.onRefresh.listen((t) => _put(t).catchError((_) {}));
    } catch (_) {
      // تُعاد المحاولة عند الفتح التالي
    }
  }

  /// قبل إبطال الجلسة (الطلب يحتاجها)، ثم يُبطل الرمز على الجهاز نفسه.
  Future<void> unregister() async {
    final tokens = ref.read(pushTokensProvider);
    if (tokens == null) return;
    await _refresh?.cancel();
    _refresh = null;
    try {
      final token = _current ?? await tokens.token();
      if (token != null) await ref.read(apiProvider).post<Object?>('/api/v1/me/push-devices/remove', body: {'token': token});
    } catch (_) {
      // بلا شبكة: حذف الرمز محلياً يكفي، فيرفضه FCM ويحذفه الخادم عند أول إرسال
    }
    _current = null;
    await tokens.delete().catchError((_) {});
  }
}

final pushRegistrationProvider = Provider<PushRegistration>(PushRegistration.new);
