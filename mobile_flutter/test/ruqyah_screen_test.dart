import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sanad/content/arabic.dart';
import 'package:sanad/core/audio.dart';

import 'today_screen_test.dart' show FakeAudio, FakeDevice, FakeServer, jsonBody, pumpApp, reveal, toTop;
import 'vectors_test.dart' show loadContent;

void main() {
  final content = loadContent();
  final r = content.ruqyah;
  final sleep = r.collection('sleep')!;
  final quranCollection = r.collections.firstWhere((c) => c.items.any((i) => i.isQuran));

  testWidgets('الصفحة الرئيسية: الواجهة والورد المقترح، والأقسام والأدلة من المحتوى المشترك', (tester) async {
    await pumpApp(tester, location: '/ruqyah');
    expect(find.text('الرقية الشرعية والتحصين'), findsOneWidget);
    final wird = r.suggestedWird(10);
    expect(find.text('ابدأ ${wird.label}'), findsOneWidget);
    expect(find.text('الأذكار'), findsNothing);
    for (final g in r.groupOrder) {
      await reveal(tester, find.text(r.groups[g]!.title));
      for (final c in r.collections.where((c) => c.group == g)) {
        await reveal(tester, find.text(c.title));
      }
    }
    for (final g in r.guidesOf('method')) {
      await reveal(tester, find.text(g.title));
    }
    await reveal(tester, find.text('توعية وتحذير'));
    await reveal(tester, find.text('ذكّرني بأذكاري'));
  });

  testWidgets('الآية الأولى في الواجهة من المصحف المشترك، والنقاط تبدّلها', (tester) async {
    await pumpApp(tester, location: '/ruqyah', reduceMotion: true);
    final v0 = r.heroVerses[0], v1 = r.heroVerses[1];
    expect(find.text('﴿${content.quran[v0.ref]!.ayat[v0.index]}﴾'), findsOneWidget);
    await tester.ensureVisible(find.byKey(const ValueKey('verse-dot-1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('verse-dot-1')));
    await tester.pumpAndSettle();
    expect(find.text('﴿${content.quran[v1.ref]!.ayat[v1.index]}﴾'), findsOneWidget);
  }, semanticsEnabled: true);

  testWidgets('القارئ: العدّاد يُتمّ العنصر ويُحفظ على الجهاز بمفتاح الويب، و«إعادة الورد» تصفّره', (tester) async {
    final prefs = await pumpApp(tester, location: '/ruqyah/${sleep.id}');
    expect(find.text(sleep.title), findsOneWidget);
    expect(find.text('٠ / ${arNum(sleep.items.length)}'), findsOneWidget);
    final first = sleep.items.first;
    final counter = find.byKey(const ValueKey('counter')).first;
    await reveal(tester, counter);
    for (var i = 0; i < first.target; i++) {
      await tester.tap(counter);
      await tester.pumpAndSettle();
    }
    expect(find.text('تمّ'), findsOneWidget);
    expect(jsonDecode(prefs.getString('sanad.ruqyah.progress.${sleep.id}.2026-10-15')!), {'0': first.target});
    await toTop(tester);
    expect(find.text('١ / ${arNum(sleep.items.length)}'), findsOneWidget);

    await tester.ensureVisible(find.text('إعادة الورد'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('إعادة الورد'));
    await tester.pumpAndSettle();
    await toTop(tester);
    expect(find.text('٠ / ${arNum(sleep.items.length)}'), findsOneWidget);
  });

  testWidgets('إتمام الورد كله: تهنئة، ثم المجموعة التالية', (tester) async {
    final all = {for (final (i, it) in sleep.items.indexed) '$i': it.target};
    await pumpApp(tester, location: '/ruqyah/${sleep.id}', prefs: {'sanad.ruqyah.progress.${sleep.id}.2026-10-15': jsonEncode(all)});
    await reveal(tester, find.text('أتممت ${sleep.title} — تقبّل الله منك'));
    final next = r.collections[(r.collections.indexOf(sleep) + 1) % r.collections.length];
    await reveal(tester, find.text(next.title));
    await tester.tap(find.text(next.title));
    await tester.pumpAndSettle();
    expect(find.text(next.intro), findsOneWidget);
  });

  testWidgets('بحساب: يُدمج تقدّم الحساب (الأكبر يغلب) ويُحفظ فيه بعد ثانية من آخر نقرة', (tester) async {
    final server = FakeServer()
      ..json('GET /api/v1/me/wird', {
        'day': '2026-10-15',
        'collections': [
          {'collectionId': sleep.id, 'counts': {'1': sleep.items[1].target}, 'completedItems': 1, 'totalItems': sleep.items.length},
        ],
        'streak': 3,
        'completedDays': ['2026-10-14'],
      })
      ..json('PUT /api/v1/me/wird', null, 204)
      ..json('POST /api/v1/auth/refresh', {'accessToken': 'a1', 'refreshToken': 'r1'});
    await pumpApp(tester, location: '/ruqyah/${sleep.id}', server: server, refreshToken: 'r1');
    expect(find.text('١ / ${arNum(sleep.items.length)}'), findsOneWidget);
    expect(find.textContaining('محفوظ في حسابك'), findsOneWidget);

    await reveal(tester, find.byKey(const ValueKey('counter')).first);
    await tester.tap(find.byKey(const ValueKey('counter')).first);
    await tester.pump(const Duration(milliseconds: 500));
    expect(server.calls('PUT /api/v1/me/wird'), isEmpty);
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    final body = jsonDecode(server.calls('PUT /api/v1/me/wird').single.data as String) as Map<String, dynamic>;
    expect(body['collectionId'], sleep.id);
    expect(body['day'], '2026-10-15');
    expect((body['counts'] as Map)['1'], sleep.items[1].target);
    expect(body['totalItems'], sleep.items.length);
  });

  testWidgets('الأدعية المنشورة بعد المراجعة تُضاف بعد النصوص الثابتة بمصدرها', (tester) async {
    final server = FakeServer()
      ..json('GET /api/v1/public/ruqyah/duas', [
        {'id': 'z', 'collectionId': sleep.id, 'title': 'دعاء مضاف', 'text': 'نص الدعاء المضاف', 'source': 'مصدر الدعاء', 'note': null, 'repeat': 1, 'sortOrder': 1},
      ]);
    await pumpApp(tester, location: '/ruqyah/${sleep.id}', server: server);
    expect(find.text('٠ / ${arNum(sleep.items.length + 1)}'), findsOneWidget);
    await reveal(tester, find.text('نص الدعاء المضاف'));
    expect(find.text('مصدر الدعاء'), findsOneWidget);
  });

  testWidgets('التلاوة: آيات المجموعة بالقارئ المختار، إيقاف مؤقت ومتابعة، والقارئ يُحفظ', (tester) async {
    final audio = FakeAudio();
    final prefs = await pumpApp(tester, location: '/ruqyah/${quranCollection.id}', audio: audio);
    final firstQuran = quranCollection.items.firstWhere((i) => i.isQuran);
    final p = content.quran[firstQuran.ref]!;

    await tester.tap(find.byKey(const ValueKey('recite-all')));
    await tester.pumpAndSettle();
    expect(audio.played, [ayahAudioUrl(p.surah, p.from, r.reciters.first.id)]);
    expect(find.text('إيقاف مؤقت'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('recite-all')));
    await tester.pumpAndSettle();
    expect(audio.paused, isTrue);
    expect(find.text('متابعة'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('recite-all')));
    await tester.pumpAndSettle();
    expect(audio.paused, isFalse);

    audio.finishCurrent();
    await tester.pumpAndSettle();
    expect(audio.played.last, p.ayat.length > 1 ? ayahAudioUrl(p.surah, p.from + 1, r.reciters.first.id) : isNotNull);

    // تغيير القارئ أثناء التلاوة يكمل من الآية نفسها بصوته
    await tester.tap(find.text(r.reciters.first.name));
    await tester.pumpAndSettle();
    await tester.tap(find.text(r.reciters[1].name).last);
    await tester.pumpAndSettle();
    expect(prefs.getString('sanad.ruqyah.reciter'), r.reciters[1].id);
    expect(audio.played.last, contains('/${r.reciters[1].id}/'));
  });

  testWidgets('حجم الخط يُحفظ بين الجلسات', (tester) async {
    final prefs = await pumpApp(tester, location: '/ruqyah/${sleep.id}');
    await tester.ensureVisible(find.bySemanticsLabel('تكبير الخط'));
    await tester.pumpAndSettle();
    await tester.tap(find.bySemanticsLabel('تكبير الخط'));
    await tester.pumpAndSettle();
    expect(prefs.getDouble('sanad.ruqyah.fontScale'), 1.15);
  }, semanticsEnabled: true);

  testWidgets('الدليل: أقسامه بدليلها، وزر الدليل/الطوارئ مخفي حتى توجد صفحته في التطبيق', (tester) async {
    final g = r.guide('treatment')!;
    await pumpApp(tester, location: '/ruqyah/guide/${g.id}');
    expect(find.text(g.title), findsOneWidget);
    for (final s in g.sections) {
      await reveal(tester, find.text(s.heading));
    }
    final hidden = r.guides.expand((x) => x.sections).where((s) => s.cta != null && s.cta!.to.startsWith('/directory'));
    for (final s in hidden) {
      expect(find.text(s.cta!.label, skipOffstage: false), findsNothing);
    }
  });

  testWidgets('تذكير الأذكار: إشعار محلي باسم الورد يفتحه، ومحايد في الوضع المتحفّظ', (tester) async {
    final device = FakeDevice();
    final prefs = await pumpApp(tester, location: '/ruqyah', device: device);
    final morning = r.slots.first;
    await reveal(tester, find.byKey(ValueKey('ruqyah-reminder-${morning.id}')));
    await tester.tap(find.byKey(ValueKey('ruqyah-reminder-${morning.id}')));
    await tester.pumpAndSettle();
    final t = parseHhmm(morning.defaultTime);
    expect(device.reminders.scheduled[11], t);
    expect(device.reminders.titles[11], morning.label);
    expect(device.reminders.routes[11], '/ruqyah/${morning.collection}');
    expect(jsonDecode(prefs.getString('sanad.ruqyah.reminders')!), {morning.id: morning.defaultTime});

    // الوضع المتحفّظ يعيد الجدولة بعنوان محايد
    await tester.tap(find.text('حسابي'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('الخصوصية والتمويه'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('discreet')));
    await tester.pumpAndSettle();
    expect(device.reminders.titles[11], 'وِرد اليوم');
    expect(device.reminders.neutral[11], isTrue);

    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.text('الأذكار'));
    await tester.pumpAndSettle();
    await reveal(tester, find.byKey(ValueKey('ruqyah-reminder-${morning.id}')));
    await tester.tap(find.byKey(ValueKey('ruqyah-reminder-${morning.id}')));
    await tester.pumpAndSettle();
    expect(device.reminders.scheduled.containsKey(11), isFalse);
  });

  testWidgets('المكتبة تحتاج حساباً: بلا جلسة تفتح الدخول', (tester) async {
    final server = FakeServer()..json('GET /api/v1/auth/providers', {'google': true, 'googleNative': true, 'apple': false});
    await pumpApp(tester, location: '/ruqyah', server: server);
    await reveal(tester, find.text('المكتبة الصوتية'));
    await tester.tap(find.widgetWithText(FilledButton, 'المكتبة الصوتية'));
    await tester.pumpAndSettle();
    expect(find.text('أهلاً بك في سند'), findsOneWidget);
    expect(jsonBody, isNotNull);
  });
}

(int, int) parseHhmm(String s) => (int.parse(s.split(':')[0]), int.parse(s.split(':')[1]));
