import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';

/*
  خزنة «مذكّرتي» — نظير packages/shared/src/lib/vault.ts حرفياً (docs/adr/0022، ADR-0023):
  AES-256-GCM، ومفتاح بيانات (DEK) عشوائي مغلّف بمفتاح من الرمز (PBKDF2-SHA256، 310 ألف دورة)،
  وملف JSON بالصيغة نفسها (v: 1) فتُفتح خزنة الويب هنا والعكس — تحرسه test-vectors/vault.json.
  WebCrypto يُخرج النص المشفّر ووسم GCM (16 بايت) متصلين في ct، فنفعل مثله.
*/

const vaultKey = 'sanad.vault.v1';
const pbkdf2Iterations = 310000;

class Sealed {
  const Sealed({required this.iv, required this.ct});
  factory Sealed.fromJson(Map<String, dynamic> j) => Sealed(iv: j['iv'] as String, ct: j['ct'] as String);
  final String iv;
  final String ct;
  Map<String, dynamic> toJson() => {'iv': iv, 'ct': ct};
}

/// ملف الخزنة كما يحفظه الويب. حقل bio (WebAuthn) خاص بالمتصفح: نحفظه كما هو ولا نستخدمه —
/// البصمة على الجوال تحفظ المفتاح في Keychain/Keystore (biometric_key_store.dart).
class VaultFile {
  const VaultFile({required this.salt, required this.pin, required this.data, this.bio});

  factory VaultFile.fromJson(Map<String, dynamic> j) {
    if (j['v'] != 1) throw const FormatException('صيغة خزنة غير معروفة');
    return VaultFile(
      salt: j['salt'] as String,
      pin: Sealed.fromJson(j['pin'] as Map<String, dynamic>),
      data: Sealed.fromJson(j['data'] as Map<String, dynamic>),
      bio: j['bio'] as Map<String, dynamic>?,
    );
  }

  final String salt;
  final Sealed pin;
  final Sealed data;
  final Map<String, dynamic>? bio;

  Map<String, dynamic> toJson() => {'v': 1, 'salt': salt, 'pin': pin.toJson(), if (bio != null) 'bio': bio, 'data': data.toJson()};

  VaultFile copyWith({String? salt, Sealed? pin, Sealed? data}) => VaultFile(salt: salt ?? this.salt, pin: pin ?? this.pin, data: data ?? this.data, bio: bio);
}

class WrongPinError implements Exception {
  @override
  String toString() => 'الرمز غير صحيح';
}

final _aes = AesGcm.with256bits();
final _random = Random.secure();

Uint8List randomBytes(int n) => Uint8List.fromList(List.generate(n, (_) => _random.nextInt(256)));

/// التشفير — مع إمكانية تمرير IV ثابت لمتجهات الاختبار فقط.
Future<Sealed> seal(List<int> key, List<int> plain, {List<int>? iv}) async {
  final nonce = iv ?? randomBytes(12);
  final box = await _aes.encrypt(plain, secretKey: SecretKey(key), nonce: nonce);
  return Sealed(iv: base64.encode(nonce), ct: base64.encode([...box.cipherText, ...box.mac.bytes]));
}

/// يرمي SecretBoxAuthenticationError إن كان المفتاح خاطئاً أو البيانات معدَّلة.
Future<Uint8List> open(List<int> key, Sealed sealed) async {
  final bytes = base64.decode(sealed.ct);
  final box = SecretBox(bytes.sublist(0, bytes.length - 16), nonce: base64.decode(sealed.iv), mac: Mac(bytes.sublist(bytes.length - 16)));
  return Uint8List.fromList(await _aes.decrypt(box, secretKey: SecretKey(key)));
}

Future<List<int>> pinKey(String pin, List<int> salt, {int iterations = pbkdf2Iterations}) async {
  final kdf = Pbkdf2(macAlgorithm: Hmac.sha256(), iterations: iterations, bits: 256);
  return (await kdf.deriveKeyFromPassword(password: pin, nonce: salt)).extractBytes();
}

/// العمليات على ملف الخزنة، بلا تخزين — التخزين والقفل في features/journal.
/// [iterations] قابلة للتغيير في اختبارات الواجهة فقط لتسريعها؛ الصيغة الحقيقية 310 ألفاً دائماً.
class VaultCrypto {
  const VaultCrypto({this.iterations = pbkdf2Iterations});
  final int iterations;

  Future<({VaultFile file, Uint8List raw})> create(String pin, Object? initial) async {
    final salt = randomBytes(16);
    final raw = randomBytes(32);
    final file = VaultFile(
      salt: base64.encode(salt),
      pin: await seal(await pinKey(pin, salt, iterations: iterations), raw),
      data: await seal(raw, utf8.encode(jsonEncode(initial))),
    );
    return (file: file, raw: raw);
  }

  Future<Uint8List> unwrapWithPin(VaultFile file, String pin) async {
    try {
      return await open(await pinKey(pin, base64.decode(file.salt), iterations: iterations), file.pin);
    } on SecretBoxAuthenticationError {
      throw WrongPinError();
    }
  }

  Future<Object?> read(VaultFile file, List<int> raw) async => jsonDecode(utf8.decode(await open(raw, file.data)));

  Future<VaultFile> write(VaultFile file, List<int> raw, Object? data) async => file.copyWith(data: await seal(raw, utf8.encode(jsonEncode(data))));

  Future<VaultFile> rewrapPin(VaultFile file, List<int> raw, String newPin) async {
    final salt = randomBytes(16);
    return file.copyWith(salt: base64.encode(salt), pin: await seal(await pinKey(newPin, salt, iterations: iterations), raw));
  }
}
