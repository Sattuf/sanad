import 'package:flutter_test/flutter_test.dart';
import 'package:sanad/core/format.dart';

// المتوقَّع منسوخ من Intl.DateTimeFormat("ar") في Node لنفس اللحظات (توقيت محلي)، فيطابق ما يعرضه الويب.
void main() {
  final morning = DateTime(2026, 1, 5, 9, 7);
  final afternoon = DateTime(2026, 10, 18, 16, 5);

  test('التاريخ: يوم وشهر بخانتين بين علامتي اتجاه', () {
    expect(formatDate(morning), '05‏/01‏/2026');
    expect(formatDate(afternoon), '18‏/10‏/2026');
  });

  test('الوقت: ١٢ ساعة بصباحاً/مساءً، ومنتصف الليل والظهر 12', () {
    expect(formatTime(morning), '9:07 ص');
    expect(formatTime(afternoon), '4:05 م');
    expect(formatTime(DateTime(2026, 1, 5, 0, 7)), '12:07 ص');
    expect(formatTime(DateTime(2026, 1, 5, 12, 7)), '12:07 م');
  });

  test('التاريخ والوقت معاً، واليوم بالاسم', () {
    expect(formatDateTime(afternoon), '18‏/10‏/2026، 4:05 م');
    expect(formatDay(afternoon), 'الأحد، 18 أكتوبر');
    expect(formatDay(morning), 'الاثنين، 5 يناير');
  });

  test('يقبل نص ISO بتوقيت UTC ويعرضه بتوقيت الجهاز', () {
    final iso = DateTime(2026, 10, 18, 16, 5).toUtc().toIso8601String();
    expect(formatDateTime(iso), formatDateTime(afternoon));
  });
}
