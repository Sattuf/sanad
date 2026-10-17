@Tags(['screenshot'])
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../library_test.dart' show libraryServer;
import '../today_screen_test.dart' show FakeAudio, pumpApp;
import 'today_screenshot_test.dart' show loadFonts, shot, snap;

/// لقطات مراجعة للأسابيع 5–7: المكتبة الصوتية والمفضلة — تُقارن بـ /library و/favorites في الويب.
void main() {
  setUpAll(loadFonts);

  Future<void> withScenes(WidgetTester tester) async {
    await tester.runAsync(() async {
      for (final img in find.byType(Image).evaluate()) {
        await precacheImage((img.widget as Image).image, img, onError: (_, _) {});
      }
    });
    await tester.pumpAndSettle();
  }

  shot('المكتبة', (tester) async {
    await pumpApp(tester, location: '/library', server: libraryServer(favorites: {'t2'}), refreshToken: 'r1');
    await withScenes(tester);
    await snap('library.png');
  });

  shot('المكتبة — أثناء التشغيل، ليلي', (tester) async {
    final audio = FakeAudio();
    await pumpApp(tester, location: '/library', server: libraryServer(), refreshToken: 'r1', audio: audio, dark: true);
    await withScenes(tester);
    await tester.tap(find.byKey(const ValueKey('play-t1')));
    await tester.pump();
    audio.progressController.add((position: const Duration(seconds: 65), duration: const Duration(seconds: 125)));
    await tester.pump();
    await snap('library_playing_dark.png');
    audio.finishCurrent();
    await tester.pumpAndSettle();
  });

  shot('المكتبة — بلا جلسة', (tester) async {
    await pumpApp(tester, location: '/library', server: libraryServer());
    await withScenes(tester);
    await snap('library_signed_out.png');
  });

  shot('المفضلة — فارغة', (tester) async {
    await pumpApp(tester, location: '/favorites', server: libraryServer(), refreshToken: 'r1');
    await snap('favorites_empty.png');
  });
}
