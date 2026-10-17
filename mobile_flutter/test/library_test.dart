import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sanad/core/audio.dart';

import 'today_screen_test.dart' show FakeAudio, FakeDevice, FakeServer, jsonBody, pumpApp, reveal;

Map<String, dynamic> track(String id, String title, {String category = 'QuranRecitation', String kind = 'StoredAudio', String? description}) => {
      'id': id,
      'title': title,
      'sourceLabel': 'مشاري العفاسي',
      'description': description,
      'category': category,
      'durationSeconds': 125,
      'audioUrl': kind == 'StoredAudio' ? '/api/v1/library/tracks/$id/audio' : null,
      'mediaKind': kind,
      'youTubeVideoId': kind == 'YouTube' ? 'abc123' : null,
      'sourceUrl': null,
    };

/// مكتبة وهمية تصفّي بالتصنيف والبحث كالخادم، ومفضلة تتغيّر بالإضافة والحذف.
FakeServer libraryServer({List<Map<String, dynamic>>? tracks, Set<String>? favorites}) {
  final all = tracks ??
      [
        track('t1', 'سورة الفاتحة', description: 'تلاوة مرتّلة'),
        track('t2', 'دعاء الكرب', category: 'Dua'),
        track('t3', 'أذكار الصباح', category: 'Adhkar', kind: 'YouTube'),
      ];
  final fav = favorites ?? <String>{};
  return FakeServer()
    ..json('POST /api/v1/auth/refresh', {'accessToken': 'a1', 'refreshToken': 'r1'})
    ..on('GET /api/v1/library', (r) {
      final c = r.uri.queryParameters['category'];
      final q = r.uri.queryParameters['q'];
      return jsonBody(all.where((t) => (c == null || t['category'] == c) && (q == null || (t['title'] as String).contains(q))).toList());
    })
    ..on('GET /api/v1/me/favorites', (_) => jsonBody(all.where((t) => fav.contains(t['id'])).toList()))
    ..on('POST /api/v1/me/favorites', (r) {
      fav.add((jsonDecode(r.data as String) as Map)['audioTrackId'] as String);
      return jsonBody(null, 204);
    })
    ..on('DELETE /api/v1/me/favorites/t1', (_) {
      fav.remove('t1');
      return jsonBody(null, 204);
    })
    ..json('POST /api/v1/library/tracks/t1/share-link', {'shortCode': 'xyz', 'publicPath': '/s/xyz'});
}

void main() {
  testWidgets('بلا جلسة: دعوة للدخول ولا طلب للمكتبة', (tester) async {
    final server = libraryServer();
    await pumpApp(tester, location: '/library', server: server);
    expect(find.text('المكتبة الصوتية'), findsOneWidget);
    expect(find.text('المزيد من التلاوات والأدعية في مكتبة سند'), findsOneWidget);
    expect(server.calls('GET /api/v1/library'), isEmpty);
    await tester.tap(find.text('دخول'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('google')), findsWidgets);
  });

  testWidgets('المقاطع بمصدرها وتصنيفها، والتصنيف والبحث يُرسلان للخادم', (tester) async {
    final server = libraryServer();
    await pumpApp(tester, location: '/library', server: server, refreshToken: 'r1');
    expect(find.text('سورة الفاتحة'), findsOneWidget);
    expect(find.text('مشاري العفاسي · تلاوات'), findsOneWidget);
    expect(find.text('تلاوة مرتّلة'), findsOneWidget);
    expect(find.text('0:00 / 2:05'), findsNWidgets(2));

    await tester.tap(find.byKey(const ValueKey('category-Dua')));
    await tester.pumpAndSettle();
    expect(server.calls('GET /api/v1/library').last.uri.queryParameters, {'category': 'Dua'});
    expect(find.text('سورة الفاتحة'), findsNothing);
    expect(find.text('دعاء الكرب'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('category-all')));
    await tester.enterText(find.byType(TextField), ' الفاتحة ');
    await tester.tap(find.text('بحث'));
    await tester.pumpAndSettle();
    expect(server.calls('GET /api/v1/library').last.uri.queryParameters, {'q': 'الفاتحة'});
    expect(find.text('دعاء الكرب'), findsNothing);
  });

  testWidgets('لا نتائج: حالة فارغة؛ وخطأ الخادم يُعرض مع إعادة المحاولة', (tester) async {
    var fail = true;
    final server = libraryServer(tracks: [])
      ..on('GET /api/v1/library', (_) => fail ? jsonBody({'title': 'خطأ'}, 500) : jsonBody([]));
    await pumpApp(tester, location: '/library', server: server, refreshToken: 'r1');
    expect(find.text('تعذّر عرض هذه الصفحة'), findsOneWidget);
    fail = false;
    await tester.tap(find.text('إعادة المحاولة'));
    await tester.pumpAndSettle();
    expect(find.text('لا مقاطع هنا بعد'), findsOneWidget);
  });

  testWidgets('المفضلة: النجمة تضيف وتحذف، وصفحة المفضلة تعرض القائمة', (tester) async {
    final server = libraryServer();
    await pumpApp(tester, location: '/library', server: server, refreshToken: 'r1');
    await tester.tap(find.byKey(const ValueKey('fav-t1')));
    await tester.pumpAndSettle();
    expect(jsonDecode(server.calls('POST /api/v1/me/favorites').single.data as String), {'audioTrackId': 't1'});
    expect(find.byTooltip('إزالة من المفضلة'), findsOneWidget);

    await tester.tap(find.text('المفضلة'));
    await tester.pumpAndSettle();
    expect(find.text('قائمتك الشخصية — لا يراها أحد غيرك.'), findsOneWidget);
    expect(find.text('سورة الفاتحة'), findsOneWidget);
    expect(find.text('دعاء الكرب'), findsNothing);

    await tester.tap(find.byKey(const ValueKey('fav-t1')));
    await tester.pumpAndSettle();
    expect(server.calls('DELETE /api/v1/me/favorites/t1'), hasLength(1));
    expect(find.text('لم تضف مقاطع بعد'), findsOneWidget);
  });

  testWidgets('التشغيل: يُبثّ من خادم سند باسم المقطع، والضغط ثانية يوقفه مؤقتاً', (tester) async {
    final audio = FakeAudio();
    await pumpApp(tester, location: '/library', server: libraryServer(), refreshToken: 'r1', audio: audio);
    await tester.tap(find.byKey(const ValueKey('play-t1')));
    await tester.pump();
    expect(audio.played, ['$apiBase/api/v1/library/tracks/t1/audio']);
    expect(audio.streamed, audio.played);
    expect(audio.infos.single, (title: 'سورة الفاتحة', subtitle: 'مشاري العفاسي'));
    expect(find.byTooltip('إيقاف سورة الفاتحة'), findsOneWidget);

    audio.progressController.add((position: const Duration(seconds: 65), duration: const Duration(seconds: 125)));
    await tester.pump();
    expect(find.text('1:05 / 2:05'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('play-t1')));
    await tester.pump();
    expect(audio.paused, isTrue);
    expect(find.byTooltip('تشغيل سورة الفاتحة'), findsOneWidget);

    audio.finishCurrent();
    await tester.pumpAndSettle();
  });

  testWidgets('في الوضع المتحفّظ: إشعار التشغيل وشاشة القفل بعنوان محايد', (tester) async {
    final audio = FakeAudio();
    await pumpApp(tester, location: '/library', server: libraryServer(), refreshToken: 'r1', audio: audio, prefs: {'sanad.discreet': 'true'});
    await tester.tap(find.byKey(const ValueKey('play-t1')));
    await tester.pump();
    expect(audio.infos.single, neutralNowPlaying);
    audio.finishCurrent();
    await tester.pumpAndSettle();
  });

  testWidgets('YouTube: لا شيء يُحمَّل قبل الضغط، ثم يُفتح خارج التطبيق', (tester) async {
    final device = FakeDevice();
    final audio = FakeAudio();
    await pumpApp(tester, location: '/library', server: libraryServer(), refreshToken: 'r1', device: device, audio: audio);
    await reveal(tester, find.byKey(const ValueKey('youtube-t3')));
    expect(find.text('يُشغَّل من YouTube عند الضغط.'), findsOneWidget);
    expect(device.outbound.opened, isEmpty);
    await tester.tap(find.byKey(const ValueKey('youtube-t3')));
    await tester.pumpAndSettle();
    expect(device.outbound.opened.single, Uri.https('www.youtube.com', '/watch', {'v': 'abc123'}));
    expect(audio.played, isEmpty);
  });

  testWidgets('المشاركة: رابط عام على موقع سند يُنسخ', (tester) async {
    final copied = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copied.add((call.arguments as Map)['text'] as String);
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    await pumpApp(tester, location: '/library', server: libraryServer(), refreshToken: 'r1');
    await reveal(tester, find.text('شارك هذا المقطع').first);
    await tester.tap(find.text('شارك هذا المقطع').first);
    await tester.pumpAndSettle();
    expect(find.text('https://sanad.app/s/xyz'), findsOneWidget);
    await tester.tap(find.text('نسخ الرابط'));
    await tester.pumpAndSettle();
    expect(copied, ['https://sanad.app/s/xyz']);
    expect(find.text('نُسخ ✓'), findsOneWidget);
  });
}
