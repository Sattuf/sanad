// متجهات خزنة المذكّرة المشتركة مع الويب (packages/shared/test-vectors/vault.json) — ADR-0023.
// يشغّل Vitest الملف نفسه على TypeScript: خزنة الويب تُفتح هنا، وخزنة Flutter تُفتح هناك.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sanad/core/vault.dart';

void main() {
  final v = jsonDecode(File('../packages/shared/test-vectors/vault.json').readAsStringSync()) as Map<String, dynamic>;
  const crypto = VaultCrypto();
  const slow = Timeout(Duration(minutes: 2)); // PBKDF2 بـ 310 ألف دورة في Dart الخالص

  for (final who in ['web', 'flutter']) {
    test('تُفتح خزنة $who بالرمز وتعيد البيانات نفسها', () async {
      final file = VaultFile.fromJson(v[who] as Map<String, dynamic>);
      final raw = await crypto.unwrapWithPin(file, v['pin'] as String);
      expect(await crypto.read(file, raw), v['data']);
    }, timeout: slow);

    test('خزنة $who ترفض الرمز الخاطئ', () async {
      await expectLater(crypto.unwrapWithPin(VaultFile.fromJson(v[who] as Map<String, dynamic>), v['wrongPin'] as String), throwsA(isA<WrongPinError>()));
    }, timeout: slow);
  }

  test('AES-GCM حتمي بمفتاح وIV ثابتين: البايتات نفسها في الطرفين', () async {
    final aes = v['aes'] as Map<String, dynamic>;
    final sealed = await seal(base64.decode(aes['key'] as String), utf8.encode(aes['plain'] as String), iv: base64.decode(aes['iv'] as String));
    expect((sealed.iv, sealed.ct), (aes['iv'], aes['ct']));
    expect(utf8.decode(await open(base64.decode(aes['key'] as String), sealed)), aes['plain']);
  });

  test('الكتابة وتغيير الرمز يبقيان الصيغة: ملف يحفظ bio الويب كما هو', () async {
    const fast = VaultCrypto(iterations: 1000);
    final made = await fast.create('1111', {'n': 1});
    final withBio = VaultFile.fromJson({...made.file.toJson(), 'bio': {'iv': 'x', 'ct': 'y', 'credentialId': 'c', 'prfSalt': 's'}});
    final written = await fast.write(withBio, made.raw, {'n': 2});
    final rewrapped = await fast.rewrapPin(written, made.raw, '2222');
    expect(rewrapped.toJson()['bio'], isNotNull);
    await expectLater(fast.unwrapWithPin(rewrapped, '1111'), throwsA(isA<WrongPinError>()));
    expect(await fast.read(rewrapped, await fast.unwrapWithPin(rewrapped, '2222')), {'n': 2});
    expect(jsonEncode(rewrapped.toJson()), isNot(contains('"n"')));
  });
}
