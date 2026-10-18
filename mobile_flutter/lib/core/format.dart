/*
  التواريخ والأوقات — نظير packages/shared/src/lib/format.ts حرفياً: Intl.DateTimeFormat("ar")
  بأرقام لاتينية (CLDR الحالي)، بتوقيت الجهاز. تحرسه test/format_test.dart بمخرجات Intl نفسها.
*/

const _months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

// DateTime.weekday: الاثنين = 1 … الأحد = 7
const _weekdays = ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];

/// علامة الاتجاه من اليمين لليسار بين أجزاء التاريخ، كما تضعها Intl.
const _rlm = '‏';

String _two(int n) => n.toString().padLeft(2, '0');

DateTime _local(Object iso) => (iso is DateTime ? iso : DateTime.parse(iso as String)).toLocal();

/// dateStyle: medium — «18‏/10‏/2026».
String formatDate(Object iso) {
  final d = _local(iso);
  return '${_two(d.day)}$_rlm/${_two(d.month)}$_rlm/${d.year}';
}

/// timeStyle: short — «4:05 م».
String formatTime(Object iso) {
  final d = _local(iso);
  final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
  return '$h:${_two(d.minute)} ${d.hour < 12 ? 'ص' : 'م'}';
}

/// dateStyle: medium + timeStyle: short — «18‏/10‏/2026، 4:05 م».
String formatDateTime(Object iso) => '${formatDate(iso)}، ${formatTime(iso)}';

/// اليوم بالاسم — «الأحد، 18 أكتوبر» (عناوين أيام المواعيد في الحجز).
String formatDay(Object iso) {
  final d = _local(iso);
  return '${_weekdays[d.weekday - 1]}، ${d.day} ${_months[d.month - 1]}';
}
