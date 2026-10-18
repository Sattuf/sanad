import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:signalr_netcore/signalr_client.dart';

import '../../core/audio.dart' show apiBase;
import '../../core/session.dart';
import '../account/auth.dart' show meProvider;
import 'booking_screens.dart';
import 'chat_screens.dart';

/*
  اتصال SignalR — نظير frontend/src/features/realtime/useRealtime.ts: الخادم يبث معرّفات فقط (لا نص)،
  والتطبيق يعيد جلب البيانات عبر REST المحمي. الوقت الفعلي تحسين فقط: الشاشات تعمل بالجلب الدوري وبالسحب للتحديث بدونه.
*/

/// حدث من الخادم: اسم الحدث، ومعرّف المحادثة لـ messageReceived.
typedef RealtimeEvent = ({String name, String? conversationId});

/// اتصال مفتوح يُغلق عند الخروج.
abstract class RealtimeLink {
  Future<void> close();
}

/// ما يفتح الاتصال — يُستبدل في الاختبارات.
abstract class RealtimeConnector {
  Future<RealtimeLink> connect(Future<String> Function() accessToken, void Function(RealtimeEvent) onEvent);
}

class SignalRConnector implements RealtimeConnector {
  @override
  Future<RealtimeLink> connect(Future<String> Function() accessToken, void Function(RealtimeEvent) onEvent) async {
    final hub = HubConnectionBuilder()
        .withUrl('$apiBase/hubs/chat', options: HttpConnectionOptions(accessTokenFactory: accessToken))
        .withAutomaticReconnect()
        .build();
    hub.on('messageReceived', (args) {
      final p = args?.firstOrNull;
      onEvent((name: 'messageReceived', conversationId: p is Map ? p['conversationId'] as String? : null));
    });
    hub.on('bookingUpdated', (_) => onEvent((name: 'bookingUpdated', conversationId: null)));
    hub.on('notification', (_) => onEvent((name: 'notification', conversationId: null)));
    await hub.start();
    return _SignalRLink(hub);
  }
}

class _SignalRLink implements RealtimeLink {
  _SignalRLink(this.hub);
  final HubConnection hub;

  @override
  Future<void> close() => hub.stop();
}

final realtimeConnectorProvider = Provider<RealtimeConnector>((ref) => SignalRConnector());

/// يعيد جلب ما يخص الحدث فقط — نفس مفاتيح الاستعلام في الويب.
void applyRealtimeEvent(Ref ref, RealtimeEvent e) {
  switch (e.name) {
    case 'messageReceived':
      if (e.conversationId != null) ref.invalidate(messagesProvider(e.conversationId!));
      ref.invalidate(conversationsProvider);
    case 'bookingUpdated':
      ref.invalidate(myBookingsProvider);
      ref.invalidate(bookingProvider);
    case 'notification':
      ref.invalidate(notificationsProvider);
      ref.invalidate(recommendationsProvider);
  }
}

/// يبقى الاتصال مفتوحاً ما دامت الجلسة قائمة؛ يُغلق عند الخروج، ويفشل بصمت.
final realtimeProvider = Provider<void>((ref) {
  if (!ref.watch(signedInProvider)) return;
  RealtimeLink? link;
  var disposed = false;
  ref.onDispose(() {
    disposed = true;
    link?.close().catchError((_) {});
  });

  Future<String> token() async {
    // رمز الوصول في الذاكرة فقط: بعد التشغيل يُجدَّد بأول طلب محمي
    if (ref.read(sessionProvider.notifier).accessToken == null) await ref.read(meProvider.future).catchError((_) => null);
    return ref.read(sessionProvider.notifier).accessToken ?? '';
  }

  () async {
    try {
      final opened = await ref.read(realtimeConnectorProvider).connect(token, (e) => applyRealtimeEvent(ref, e));
      if (disposed) {
        await opened.close();
      } else {
        link = opened;
      }
    } catch (_) {
      // الوقت الفعلي تحسين فقط — الصفحات تعمل بالجلب الدوري بدونه
    }
  }();
});
