import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/audio.dart';
import '../companion/companion_store.dart';
import '../privacy/discreet.dart';

/*
  تلاوة آيات المجموعة آية بآية بمشغّل واحد مشترك — نظير useRecitation في frontend/src/features/ruqyah/recitation.ts:
  طابور مقاطع (فهرس العنصر + مرجعه)، والآية الجارية تُظلَّل، وإيقاف مؤقت ومتابعة، واختيار القارئ يُحفظ.
  كل آية تُحفظ على الجهاز عند أول استماع (RecitationAudio) فتعمل بلا إنترنت بعدها.
*/
const _reciterKey = 'sanad.ruqyah.reciter';

enum RecitationStatus { idle, loading, playing, paused, error }

typedef QueueEntry = ({int itemIndex, String ref});

class RecitationState {
  const RecitationState({required this.reciter, this.queue = const [], this.position = 0, this.ayah = 0, this.status = RecitationStatus.idle});

  final String reciter;
  final List<QueueEntry> queue;

  /// موضع المقطع في الطابور
  final int position;

  /// فهرس الآية داخل المقطع
  final int ayah;
  final RecitationStatus status;

  bool get active => status != RecitationStatus.idle;

  /// هل العنصر itemIndex هو الجاري الآن؟ وأي آية فيه؟ (useActiveAyah)
  int? activeAyah(int itemIndex) => active && position < queue.length && queue[position].itemIndex == itemIndex ? ayah : null;

  RecitationState copyWith({String? reciter, List<QueueEntry>? queue, int? position, int? ayah, RecitationStatus? status}) => RecitationState(
        reciter: reciter ?? this.reciter,
        queue: queue ?? this.queue,
        position: position ?? this.position,
        ayah: ayah ?? this.ayah,
        status: status ?? this.status,
      );
}

class RecitationController extends Notifier<RecitationState> {
  int _run = 0;

  RecitationAudio get _audio => ref.read(recitationAudioProvider);

  @override
  RecitationState build() {
    final saved = ref.read(prefsProvider).getString(_reciterKey);
    final reciters = ref.read(contentProvider).ruqyah.reciters;
    ref.onDispose(() => _run++);
    return RecitationState(reciter: reciters.any((r) => r.id == saved) ? saved! : reciters.first.id);
  }

  String _url(int position, int ayah) {
    final p = ref.read(contentProvider).quran[state.queue[position].ref]!;
    return ayahAudioUrl(p.surah, p.from + ayah, state.reciter);
  }

  /// اسم السورة والقارئ في إشعار التشغيل وشاشة القفل — ومحايد في الوضع المتحفّظ.
  NowPlaying _info(int position) {
    if (ref.read(discreetProvider)) return neutralNowPlaying;
    final p = ref.read(contentProvider).quran[state.queue[position].ref]!;
    final reciter = ref.read(contentProvider).ruqyah.reciters.firstWhere((r) => r.id == state.reciter);
    return (title: p.surahName, subtitle: reciter.name);
  }

  /// الموضع التالي (آية تالية، أو أول آية في المقطع التالي) — أو null في النهاية.
  ({int position, int ayah})? _next(int position, int ayah) {
    final p = ref.read(contentProvider).quran[state.queue[position].ref]!;
    if (ayah + 1 < p.ayat.length) return (position: position, ayah: ayah + 1);
    if (position + 1 < state.queue.length) return (position: position + 1, ayah: 0);
    return null;
  }

  Future<void> _start(int position, int ayah) async {
    final run = ++_run;
    _audio.claim(_preempted);
    ({int position, int ayah})? at = (position: position, ayah: ayah);
    while (at != null) {
      if (run != _run) return;
      state = state.copyWith(position: at.position, ayah: at.ayah, status: RecitationStatus.loading);
      final url = _url(at.position, at.ayah);
      try {
        await _audio.cache(url);
        if (run != _run) return;
        state = state.copyWith(status: RecitationStatus.playing);
        final next = _next(at.position, at.ayah);
        if (next != null) unawaited(_audio.cache(_url(next.position, next.ayah)).catchError((_) {}));
        await _audio.playToEnd(url, info: _info(at.position));
      } catch (_) {
        if (run == _run) state = state.copyWith(status: RecitationStatus.error);
        return;
      }
      if (run != _run) return;
      at = _next(at.position, at.ayah);
    }
    state = state.copyWith(queue: const [], position: 0, ayah: 0, status: RecitationStatus.idle);
    unawaited(_audio.stop()); // يُزيل إشعار التشغيل بعد آخر آية
  }

  void _preempted() {
    _run++;
    state = state.copyWith(queue: const [], position: 0, ayah: 0, status: RecitationStatus.idle);
  }

  void play(List<QueueEntry> queue) {
    if (queue.isEmpty) return;
    state = state.copyWith(queue: queue);
    unawaited(_start(0, 0));
  }

  /// تشغيل/إيقاف مؤقت/متابعة/إعادة المحاولة — زر واحد كالويب.
  void toggle() {
    switch (state.status) {
      case RecitationStatus.playing || RecitationStatus.loading:
        unawaited(_audio.pause());
        state = state.copyWith(status: RecitationStatus.paused);
      case RecitationStatus.paused:
        unawaited(_audio.resume());
        state = state.copyWith(status: RecitationStatus.playing);
      case RecitationStatus.error:
        unawaited(_start(state.position, state.ayah));
      case RecitationStatus.idle:
        break;
    }
  }

  void stop() {
    _run++;
    unawaited(_audio.stop());
    state = state.copyWith(queue: const [], position: 0, ayah: 0, status: RecitationStatus.idle);
  }

  /// عند مغادرة المجموعة: يوقف الصوت فوراً، ويؤجّل تصفير الحالة لما بعد بناء الشجرة
  /// (لا يجوز تعديل مزوّد أثناء dispose).
  void leave() {
    if (state.status == RecitationStatus.idle && state.queue.isEmpty) return;
    _run++;
    unawaited(_audio.stop());
    Future.microtask(() {
      if (ref.mounted) state = state.copyWith(queue: const [], position: 0, ayah: 0, status: RecitationStatus.idle);
    });
  }

  void setReciter(String id) {
    ref.read(prefsProvider).setString(_reciterKey, id);
    final wasActive = state.status == RecitationStatus.playing || state.status == RecitationStatus.loading;
    state = state.copyWith(reciter: id);
    if (wasActive) {
      unawaited(_audio.stop());
      unawaited(_start(state.position, state.ayah));
    }
  }
}

final recitationProvider = NotifierProvider<RecitationController, RecitationState>(RecitationController.new);
