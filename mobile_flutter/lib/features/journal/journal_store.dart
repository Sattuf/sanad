import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../content/journal.dart';
import '../../core/platform_services.dart';
import '../../core/vault.dart';
import '../companion/companion_store.dart';

/*
  «مذكّرتي» — نظير stores/journal.ts في الويب:
  الخزنة المشفّرة محفوظة بمفتاح الويب نفسه (sanad.vault.v1)، والبيانات المفكوكة في الذاكرة فقط وتُمسح عند القفل.
  القفل التلقائي بعد ٥ دقائق خمول أو دقيقة في الخلفية.
  تقييمات الجلسات والمذكّرة مقفلة تنتظر في الذاكرة حتى تُفتح في الجلسة نفسها، ولا تُكتب دون تشفير.
*/
const _bioFlag = 'sanad.vault.bio';
const idleLock = Duration(minutes: 5);
const backgroundLock = Duration(minutes: 1);

/// تشفير الخزنة — الاختبارات تخفّض الدورات لتسريع الواجهة فقط؛ المتجهات تختبر الصيغة الحقيقية.
final vaultCryptoProvider = Provider<VaultCrypto>((ref) => const VaultCrypto());

class JournalState {
  const JournalState({required this.exists, required this.hasBio, this.data, this.pending = const []});
  final bool exists;
  final bool hasBio;
  final JournalData? data;
  final List<SessionRating> pending;

  bool get unlocked => data != null;

  JournalState copyWith({bool? exists, bool? hasBio, JournalData? Function()? data, List<SessionRating>? pending}) => JournalState(
        exists: exists ?? this.exists,
        hasBio: hasBio ?? this.hasBio,
        data: data != null ? data() : this.data,
        pending: pending ?? this.pending,
      );
}

class JournalNotifier extends Notifier<JournalState> {
  Uint8List? _raw;
  Timer? _idle;
  Timer? _hidden;

  VaultCrypto get _crypto => ref.read(vaultCryptoProvider);

  @override
  JournalState build() {
    final life = AppLifecycleListener(
      onHide: () {
        _hidden?.cancel();
        if (state.unlocked) _hidden = Timer(backgroundLock, lock);
      },
      onShow: () => _hidden?.cancel(),
    );
    ref.onDispose(() {
      life.dispose();
      _idle?.cancel();
      _hidden?.cancel();
      _wipeKey();
    });
    final prefs = ref.read(prefsProvider);
    return JournalState(exists: prefs.containsKey(vaultKey), hasBio: prefs.getBool(_bioFlag) ?? false);
  }

  VaultFile _load() {
    final raw = ref.read(prefsProvider).getString(vaultKey);
    if (raw == null) throw StateError('لا توجد مذكّرة على هذا الجهاز');
    return VaultFile.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }

  Future<void> _save(VaultFile f) => ref.read(prefsProvider).setString(vaultKey, jsonEncode(f.toJson()));

  Future<void> _opened(Uint8List raw) async {
    var file = _load();
    var data = JournalData.fromJson(await _crypto.read(file, raw) as Map<String, dynamic>);
    if (state.pending.isNotEmpty) {
      data = JournalData(checkIns: data.checkIns, sessions: [...data.sessions, ...state.pending]);
      file = await _crypto.write(file, raw, data.toJson());
      await _save(file);
    }
    _raw = raw;
    state = state.copyWith(exists: true, data: () => data, pending: const []);
    touch();
  }

  Future<void> create(String pin) async {
    final made = await _crypto.create(pin, const JournalData().toJson());
    await _save(made.file);
    await _opened(made.raw);
  }

  /// يرمي WrongPinError إن لم يطابق الرمز.
  Future<void> unlockPin(String pin) async => _opened(await _crypto.unwrapWithPin(_load(), pin));

  /// يطلب البصمة من النظام؛ المفتاح لا يُقرأ بدونها.
  Future<void> unlockBio() async => _opened(await ref.read(biometricKeyStoreProvider).read());

  void lock() {
    _idle?.cancel();
    _hidden?.cancel();
    _wipeKey();
    if (state.unlocked) state = state.copyWith(data: () => null);
  }

  void _wipeKey() {
    _raw?.fillRange(0, _raw!.length, 0);
    _raw = null;
  }

  /// كل لمسة في المذكّرة تؤجّل القفل التلقائي.
  void touch() {
    _idle?.cancel();
    if (state.unlocked) _idle = Timer(idleLock, lock);
  }

  Future<void> _persist(JournalData data) async {
    final raw = _raw;
    if (raw == null) return;
    await _save(await _crypto.write(_load(), raw, data.toJson()));
    state = state.copyWith(data: () => data);
  }

  Future<void> saveCheckIn({required String day, required Map<String, int> values, String? note}) async {
    final data = state.data;
    if (data == null) return;
    final c = CheckIn(
      day: day,
      calm: values['calm']!,
      sleep: values['sleep']!,
      energy: values['energy']!,
      mood: values['mood']!,
      note: note,
      updatedAt: DateTime.now().toUtc().toIso8601String(),
    );
    await _persist(JournalData(checkIns: {...data.checkIns, day: c}, sessions: data.sessions));
  }

  Future<void> addSession(SessionRating s) async {
    final data = state.data;
    if (data == null) {
      state = state.copyWith(pending: [...state.pending, s]);
      return;
    }
    await _persist(JournalData(checkIns: data.checkIns, sessions: [...data.sessions, s]));
  }

  Future<void> enableBio() async {
    final raw = _raw;
    if (raw == null) return;
    await ref.read(biometricKeyStoreProvider).save(raw);
    await ref.read(prefsProvider).setBool(_bioFlag, true);
    state = state.copyWith(hasBio: true);
  }

  Future<void> disableBio() async {
    await ref.read(biometricKeyStoreProvider).delete();
    await ref.read(prefsProvider).remove(_bioFlag);
    state = state.copyWith(hasBio: false);
  }

  Future<void> changePin(String newPin) async {
    final raw = _raw;
    if (raw == null) return;
    await _save(await _crypto.rewrapPin(_load(), raw, newPin));
  }

  /// حذف نهائي: الخزنة ومفتاح البصمة والجلسات المنتظرة.
  Future<void> wipe() async {
    lock();
    final prefs = ref.read(prefsProvider);
    await prefs.remove(vaultKey);
    await prefs.remove(_bioFlag);
    try {
      await ref.read(biometricKeyStoreProvider).delete();
    } catch (_) {
      // لا مفتاح محفوظ
    }
    state = const JournalState(exists: false, hasBio: false);
  }
}

final journalProvider = NotifierProvider<JournalNotifier, JournalState>(JournalNotifier.new);
