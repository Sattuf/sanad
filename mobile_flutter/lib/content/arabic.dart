// نظير packages/shared/src/lib/arabic.ts حرفياً — تحرسه متجهات التطابق (test/vectors_test.dart).

final _marks = RegExp('[ً-ٰٟۖ-ۭـ‌-‏]');
final _alef = RegExp('[أإآٱ]');
final _arabicDigit = RegExp('[٠-٩]');
final _nonWord = RegExp(r'[^\p{L}\p{N}\s]', unicode: true);
final _spaces = RegExp(r'\s+');

/// توحيد النص العربي للبحث والفحص.
/// ملاحظة: JS يطبّق NFC أولاً؛ نصوص الإدخال على الجوال مركّبة مسبقاً، ولا NFC مدمج في Dart.
String normalizeArabic(String text) => text
    .replaceAll(_marks, '')
    .replaceAll(_alef, 'ا')
    .replaceAll('ى', 'ي')
    .replaceAll('ة', 'ه')
    .replaceAllMapped(_arabicDigit, (m) => String.fromCharCode(m[0]!.codeUnitAt(0) - 0x0660 + 0x30))
    .replaceAll(_nonWord, ' ')
    .toLowerCase()
    .replaceAll(_spaces, ' ')
    .trim();

String _stem(String word) {
  var w = word;
  if (w.length > 3 && (w.startsWith('و') || w.startsWith('ب') || w.startsWith('ف'))) w = w.substring(1);
  if (w.length > 3 && w.startsWith('ال')) w = w.substring(2);
  return w;
}

/// درجة تطابق بسيطة: عبارة كاملة > كلمات مشتركة. 0 = لا تطابق.
int matchScore(String query, List<String> haystacks) {
  final q = normalizeArabic(query);
  if (q.isEmpty) return 0;
  final qWords = q.split(' ').where((w) => w.length > 1).map(_stem).toList();
  var best = 0;
  for (final h in haystacks) {
    final n = normalizeArabic(h);
    if (n.contains(q) || (q.length >= 4 && q.contains(n))) best = best > 10 ? best : 10;
    final hWords = n.split(' ').map(_stem).toSet();
    final common = qWords
        .where((w) => hWords.contains(w) || hWords.any((hw) => hw.length >= 3 && (hw.startsWith(w) || w.startsWith(hw))))
        .length;
    if (common > 0 && common * 3 > best) best = common * 3;
  }
  return best;
}

const _arDigits = '٠١٢٣٤٥٦٧٨٩';

/// أرقام عربية-هندية للعرض، كما في الويب (arNum).
String arNum(Object n) => n.toString().replaceAllMapped(RegExp(r'\d'), (m) => _arDigits[int.parse(m[0]!)]);
