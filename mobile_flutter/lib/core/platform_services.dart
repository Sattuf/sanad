import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:local_auth/local_auth.dart';
import 'package:share_plus/share_plus.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;
import 'package:url_launcher/url_launcher.dart';

/*
  خدمات المنصة — كل خدمة خلف واجهة ومزوّد، فتستبدلها الاختبارات بنسخ وهمية.
  لا شيء هنا يرسل بيانات المستخدم لأي خادم.
*/

/// قناة app.sanad/privacy (MainActivity.kt / AppDelegate.swift).
class PrivacyPlatform {
  static const _channel = MethodChannel('app.sanad/privacy');

  /// يمنع لقطات الشاشة وصورة المهام الأخيرة (أندرويد). iOS يغطّي الشاشة من Flutter بدلاً منه.
  Future<void> setSecure(bool on) => _call('setSecure', on);

  /// الوضع المتحفّظ: أيقونة «ملاحظاتي» واسمها في قائمة التطبيقات.
  Future<void> setNeutralIcon(bool on) => _call('setNeutralIcon', on);

  Future<void> _call(String method, Object? arg) async {
    try {
      await _channel.invokeMethod<void>(method, arg);
    } on MissingPluginException {
      // الاختبارات والمنصات بلا تنفيذ أصلي
    } on PlatformException catch (e) {
      debugPrint('privacy.$method: ${e.message}');
    }
  }
}

final privacyPlatformProvider = Provider<PrivacyPlatform>((ref) => PrivacyPlatform());

/// مفتاح المذكّرة محفوظاً بالبصمة: Keychain بقيد biometryCurrentSet، وKeystore يطلب البصمة لكل قراءة.
/// النظام نفسه يرفض قراءة المفتاح بلا بصمة — فالبصمة تفكّ القفل فعلاً، كـ WebAuthn PRF في الويب.
abstract class BiometricKeyStore {
  Future<bool> available();
  Future<void> save(List<int> raw);

  /// يطلب البصمة ويعيد المفتاح، ويرمي إن أُلغيت أو لم تطابق.
  Future<Uint8List> read();
  Future<void> delete();
}

class DeviceBiometricKeyStore implements BiometricKeyStore {
  static const _key = 'sanad.journal.dek';
  final _auth = LocalAuthentication();

  FlutterSecureStorage get _storage => const FlutterSecureStorage(
        aOptions: AndroidOptions.biometric(
          enforceBiometrics: true,
          requireBiometricsPerOperation: true,
          biometricPromptTitle: 'افتح مذكّرتك',
          biometricPromptSubtitle: 'المس مستشعر البصمة',
          biometricPromptNegativeButton: 'استخدم الرمز',
        ),
        iOptions: IOSOptions(accessibility: KeychainAccessibility.unlocked_this_device, accessControlFlags: [AccessControlFlag.biometryCurrentSet]),
      );

  @override
  Future<bool> available() async {
    try {
      return await _auth.isDeviceSupported() && await _auth.canCheckBiometrics;
    } on PlatformException {
      return false;
    }
  }

  @override
  Future<void> save(List<int> raw) => _storage.write(key: _key, value: base64.encode(raw));

  @override
  Future<Uint8List> read() async {
    final v = await _storage.read(key: _key);
    if (v == null) throw StateError('البصمة غير مفعّلة');
    return base64.decode(v);
  }

  @override
  Future<void> delete() => _storage.delete(key: _key);
}

final biometricKeyStoreProvider = Provider<BiometricKeyStore>((ref) => DeviceBiometricKeyStore());

/// عنوان محايد عمداً حتى لا يكشف شيئاً على شاشة القفل.
const neutralReminderTitle = 'وِرد اليوم';

/// التذكير اليومي المحلي — يُجدول في النظام، فيصل والتطبيق مغلق وبلا شبكة.
abstract class ReminderScheduler {
  Future<bool> requestPermission();
  /// [neutral]: أيقونة إشعار محايدة (الوضع المتحفّظ).
  /// [title] عنوان الإشعار (محايد افتراضياً)، و[route] الصفحة التي يفتحها لمسه.
  Future<void> scheduleDaily(int id, int hour, int minute, {bool neutral = false, String title = neutralReminderTitle, String route = '/today'});
  Future<void> cancel(int id);
}

class DeviceReminderScheduler implements ReminderScheduler {
  final _plugin = FlutterLocalNotificationsPlugin();
  Future<void>? _ready;

  /// يُستدعى عند لمس الإشعار بالصفحة التي يفتحها.
  static void Function(String route)? onOpen;

  Future<void> _init() => _ready ??= () async {
        tzdata.initializeTimeZones();
        try {
          tz.setLocalLocation(tz.getLocation((await FlutterTimezone.getLocalTimezone()).identifier));
        } catch (_) {
          // منطقة غير معروفة: نبقى على UTC، ويصل التذكير بفارق الساعات بدل ألا يصل
        }
        await _plugin.initialize(
          settings: const InitializationSettings(
            android: AndroidInitializationSettings('@mipmap/ic_launcher'),
            iOS: DarwinInitializationSettings(requestAlertPermission: false, requestBadgePermission: false, requestSoundPermission: false),
          ),
          onDidReceiveNotificationResponse: (r) => onOpen?.call(r.payload ?? '/today'),
        );
        final launch = await _plugin.getNotificationAppLaunchDetails();
        if (launch?.didNotificationLaunchApp ?? false) onOpen?.call(launch!.notificationResponse?.payload ?? '/today');
      }();

  /// يُستدعى عند بدء التطبيق ليُعالج لمس إشعار فتح التطبيق.
  Future<void> init() => _init();

  @override
  Future<bool> requestPermission() async {
    await _init();
    final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    if (android != null) return await android.requestNotificationsPermission() ?? false;
    final ios = _plugin.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>();
    if (ios != null) return await ios.requestPermissions(alert: true, sound: true) ?? false;
    return false;
  }

  @override
  Future<void> scheduleDaily(int id, int hour, int minute, {bool neutral = false, String title = neutralReminderTitle, String route = '/today'}) async {
    await _init();
    // في الدقيقة نفسها حين يسمح النظام بالمنبّهات الدقيقة؛ وإلا نافذة حتى ساعة لتوفير البطارية
    final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    final exact = await android?.canScheduleExactNotifications() ?? false;
    final now = tz.TZDateTime.now(tz.local);
    var at = tz.TZDateTime(tz.local, now.year, now.month, now.day, hour, minute);
    if (!at.isAfter(now)) at = at.add(const Duration(days: 1));
    await _plugin.zonedSchedule(
      id: id,
      title: title,
      scheduledDate: at,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          'daily',
          'تذكير يومي',
          channelDescription: 'تذكير محلي بالوِرد اليومي',
          icon: neutral ? 'ic_stat_notes' : null,
        ),
        iOS: const DarwinNotificationDetails(),
      ),
      androidScheduleMode: exact ? AndroidScheduleMode.exactAllowWhileIdle : AndroidScheduleMode.inexactAllowWhileIdle,
      matchDateTimeComponents: DateTimeComponents.time,
      payload: route,
    );
  }

  @override
  Future<void> cancel(int id) async {
    await _init();
    await _plugin.cancel(id: id);
  }
}

final reminderSchedulerProvider = Provider<ReminderScheduler>((ref) => DeviceReminderScheduler());

/// المشاركة وفتح الروابط — خلف واجهة للاختبارات.
abstract class Outbound {
  Future<void> shareFile(Uint8List bytes, {required String name, required String mimeType, String? text});

  /// صفحة على موقع سند (الشروط، الخصوصية) في المتصفح.
  Future<void> openUrl(Uri url);
}

class DeviceOutbound implements Outbound {
  @override
  Future<void> shareFile(Uint8List bytes, {required String name, required String mimeType, String? text}) =>
      SharePlus.instance.share(ShareParams(files: [XFile.fromData(bytes, mimeType: mimeType, name: name)], fileNameOverrides: [name], text: text));

  @override
  Future<void> openUrl(Uri url) => launchUrl(url, mode: LaunchMode.externalApplication);
}

final outboundProvider = Provider<Outbound>((ref) => DeviceOutbound());
