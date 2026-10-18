@Tags(['screenshot'])
library;

import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sanad/content/journal.dart';
import 'package:sanad/features/journal/journal_screen.dart';
import 'package:sanad/features/journal/journal_store.dart';

import '../today_screen_test.dart' show pumpApp, reveal;
import 'today_screenshot_test.dart' show loadFonts, shot, snap;

/// لقطات مراجعة للأسبوعين 4–5: المذكّرة، الخصوصية، التذكير، البطاقة، الإحالة.
void main() {
  setUpAll(loadFonts);
  final active = jsonEncode({
    'activeProgramId': 'foundation-7',
    'startedOn': '2026-10-09',
    'done': {},
    'activeDays': {for (var i = 0; i < 14; i += 2) addDays('2026-10-15', -i): true},
    'finished': [],
  });

  Future<void> createWithDays(WidgetTester tester) async {
    final container = ProviderScope.containerOf(tester.element(find.byType(JournalScreen)));
    final n = container.read(journalProvider.notifier);
    await tester.runAsync(() => n.create('2468'));
    for (var i = 0; i < 14; i++) {
      if (i == 4 || i == 9) continue; // أيام بلا تسجيل تظهر فجوة في الخط
      final day = addDays('2026-10-15', -i);
      await tester.runAsync(() => n.saveCheckIn(day: day, values: {'calm': i < 7 ? 3 - i % 2 : 1 + i % 2, 'sleep': 2 + (i % 3 == 0 ? 1 : 0), 'energy': 2, 'mood': i < 7 ? 3 : 2}));
    }
    await tester.runAsync(() => n.addSession(const SessionRating(at: '2026-10-14T21:00:00.000Z', kind: 'ruqyah', before: 3, after: 7)));
    await tester.pumpAndSettle();
  }

  shot('المذكّرة — الإنشاء', (tester) async {
    await pumpApp(tester, location: '/journal');
    await snap('journal_create.png');
  });

  shot('المذكّرة — حالة اليوم', (tester) async {
    await pumpApp(tester, location: '/journal', prefs: {'sanad.companion.v1': active});
    await createWithDays(tester);
    await snap('journal_checkin.png');
  });

  shot('المذكّرة — الاتجاه', (tester) async {
    await pumpApp(tester, location: '/journal', prefs: {'sanad.companion.v1': active});
    await createWithDays(tester);
    await reveal(tester, find.text('آخر ١٤ يوماً'));
    await snap('journal_trends.png');
  });

  shot('المذكّرة — ليلي', (tester) async {
    await pumpApp(tester, location: '/journal', prefs: {'sanad.companion.v1': active}, dark: true);
    await createWithDays(tester);
    await reveal(tester, find.text('آخر ١٤ يوماً'));
    await snap('journal_dark.png');
  });

  shot('الخصوصية والتمويه', (tester) async {
    await pumpApp(tester, location: '/privacy-mode', prefs: {'sanad.discreet': 'true'});
    await snap('privacy.png');
  });

  shot('يومي — الوضع المتحفّظ والتذكير', (tester) async {
    await pumpApp(tester, prefs: {'sanad.companion.v1': active, 'sanad.discreet': 'true', 'sanad.reminders': jsonEncode(['night'])});
    await reveal(tester, find.text('ذكّرني كل يوم'));
    await snap('today_reminders.png');
  });

  shot('بطاقة المشاركة', (tester) async {
    await pumpApp(tester, location: '/awareness');
    await tester.tap(find.text('ملح الهملايا'));
    await tester.pumpAndSettle();
    await reveal(tester, find.text('بطاقة'));
    await tester.tap(find.text('بطاقة'));
    await tester.pumpAndSettle();
    await snap('share_card.png');
  });
}
