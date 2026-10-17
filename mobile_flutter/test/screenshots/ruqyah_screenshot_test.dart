@Tags(['screenshot'])
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../today_screen_test.dart' show pumpApp, reveal;
import '../vectors_test.dart' show loadContent;
import 'today_screenshot_test.dart' show loadFonts, shot, snap;

/// لقطات مراجعة للأسابيع 5–7: الرقية والتحصين والصحة — تُقارن بـ /ruqyah و/health في الويب.
void main() {
  setUpAll(loadFonts);
  final r = loadContent().ruqyah;

  // صور المشاهد تُفك خارج الوقت الوهمي، فنحمّلها قبل اللقطة
  Future<void> withScenes(WidgetTester tester) async {
    await tester.runAsync(() async {
      for (final img in find.byType(Image).evaluate()) {
        final w = img.widget as Image;
        await precacheImage(w.image, img, onError: (_, _) {});
      }
    });
    await tester.pumpAndSettle();
  }

  shot('الرقية — الواجهة', (tester) async {
    await pumpApp(tester, location: '/ruqyah', reduceMotion: true);
    await withScenes(tester);
    await snap('ruqyah_hub.png');
  });

  shot('الرقية — الأقسام', (tester) async {
    await pumpApp(tester, location: '/ruqyah', reduceMotion: true);
    await reveal(tester, find.text(r.groups[r.groupOrder.first]!.title));
    await withScenes(tester);
    await snap('ruqyah_groups.png');
  });

  shot('الرقية — ليلي', (tester) async {
    await pumpApp(tester, location: '/ruqyah', reduceMotion: true, dark: true);
    await withScenes(tester);
    await snap('ruqyah_hub_dark.png');
  });

  shot('ورد المساء', (tester) async {
    await pumpApp(tester, location: '/ruqyah/${r.collections.first.id}', reduceMotion: true);
    await withScenes(tester);
    await snap('ruqyah_collection.png');
  });

  shot('دليل الرقية', (tester) async {
    await pumpApp(tester, location: '/ruqyah/guide/treatment', reduceMotion: true);
    await withScenes(tester);
    await snap('ruqyah_guide.png');
  });

  shot('الصحة والطمأنينة', (tester) async {
    await pumpApp(tester, location: '/health', reduceMotion: true);
    await withScenes(tester);
    await snap('health_hub.png');
  });
}
