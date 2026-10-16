import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio/just_audio.dart';
import 'package:path_provider/path_provider.dart';

/*
  تلاوة الآيات من خادم سند نفسه (/api/v1/public/recitation)، كـ frontend/src/features/ruqyah/recitation.ts.
  كل آية تُحفظ ملفاً على الجهاز عند أول استماع ثم تُشغَّل منه — فتعمل «السكينة» والمرشد
  في وضع الطيران بعد أول تشغيل (نظير Cache API في frontend/src/components/companion/audio.ts).
*/

/// عنوان الخادم: `flutter run --dart-define=SANAD_API_BASE=https://…` (نظير EXPO_PUBLIC_API_BASE_URL).
const apiBase = String.fromEnvironment('SANAD_API_BASE', defaultValue: 'http://localhost:5080');
const reciter = 'Alafasy_128kbps';

String ayahAudioUrl(int surah, int ayah) => '$apiBase/api/v1/public/recitation/$reciter/$surah/$ayah';

/// واجهة الصوت — تُستبدل في الاختبارات بنسخة وهمية.
abstract class RecitationAudio {
  Future<bool> isCached(String url);

  /// يجلب الملف ويحفظه إن لم يكن محفوظاً.
  Future<void> cache(String url);

  /// يشغّل المقطع (المحفوظ) ويكتمل عند انتهائه أو إيقافه.
  Future<void> playToEnd(String url);

  Future<void> stop();

  /// مشغّل واحد مشترك: من يبدأ التشغيل يوقف القائمة السابقة.
  void claim(VoidCallback onPreempted);

  /// يحذف التلاوات المحفوظة (مسح كل البيانات).
  Future<void> clearCache();
}

class DeviceRecitationAudio implements RecitationAudio {
  AudioPlayer? _player;
  Completer<void>? _current;
  VoidCallback? _owner;
  Directory? _dir;
  final _inflight = <String, Future<File>>{};

  Future<File> _file(String url) async {
    _dir ??= Directory('${(await getApplicationSupportDirectory()).path}/recitation');
    // …/recitation/{reciter}/{surah}/{ayah} ← recitation/{reciter}/{surah}_{ayah}.mp3
    final s = Uri.parse(url).pathSegments;
    return File('${_dir!.path}/${s[s.length - 3]}/${s[s.length - 2]}_${s.last}.mp3');
  }

  @override
  Future<bool> isCached(String url) async => (await _file(url)).exists();

  @override
  Future<void> cache(String url) => _ensure(url);

  Future<File> _ensure(String url) => _inflight[url] ??= _download(url).whenComplete(() => _inflight.remove(url));

  Future<File> _download(String url) async {
    final file = await _file(url);
    if (await file.exists()) return file;
    await file.parent.create(recursive: true);
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 15);
    try {
      final res = await (await client.getUrl(Uri.parse(url))).close();
      if (res.statusCode != 200) throw HttpException('${res.statusCode}', uri: Uri.parse(url));
      // كتابة ثم إعادة تسمية: لا يبقى ملف ناقص يُظن محفوظاً
      final part = File('${file.path}.part');
      await res.pipe(part.openWrite());
      return part.rename(file.path);
    } finally {
      client.close();
    }
  }

  @override
  Future<void> playToEnd(String url) async {
    final file = await _ensure(url);
    final player = _player ??= AudioPlayer();
    final done = _current = Completer<void>();
    final sub = player.playerStateStream.listen(
      (s) {
        if (s.processingState == ProcessingState.completed && !done.isCompleted) done.complete();
      },
      onError: (Object e) {
        if (!done.isCompleted) done.completeError(e);
      },
    );
    try {
      await player.setFilePath(file.path);
      unawaited(player.play());
      await done.future;
    } finally {
      await sub.cancel();
    }
  }

  @override
  Future<void> stop() async {
    final c = _current;
    if (c != null && !c.isCompleted) c.complete();
    await _player?.stop();
  }

  @override
  void claim(VoidCallback onPreempted) {
    final prev = _owner;
    _owner = onPreempted;
    if (prev != null && prev != onPreempted) prev();
  }

  @override
  Future<void> clearCache() async {
    await stop();
    _dir ??= Directory('${(await getApplicationSupportDirectory()).path}/recitation');
    if (await _dir!.exists()) await _dir!.delete(recursive: true);
  }

  void dispose() => _player?.dispose();
}

final recitationAudioProvider = Provider<RecitationAudio>((ref) {
  final audio = DeviceRecitationAudio();
  ref.onDispose(audio.dispose);
  return audio;
});

/// مشغّل قائمة — نظير usePlaylist في الويب: المقاطع بالترتيب، والقائمة كاملة `repeat` مرة.
/// index = موضع المقطع الجاري (للتظليل)، round = الجولة الحالية.
class Playlist extends ChangeNotifier {
  Playlist(this._audio, this.urls, {this.repeat = 1});

  final RecitationAudio _audio;
  final List<String> urls;
  int repeat;

  int index = -1;
  int round = 1;
  bool loading = false;
  bool failed = false;
  int _run = 0;
  bool _disposed = false;

  bool get playing => index >= 0;

  Future<void> play() async {
    final run = ++_run;
    failed = false;
    _audio.claim(_preempted);
    for (var r = 1; r <= repeat; r++) {
      for (var i = 0; i < urls.length; i++) {
        if (run != _run) return;
        _set(index: i, round: r, loading: true);
        try {
          await _audio.cache(urls[i]);
          if (run != _run) return;
          _set(loading: false);
          await _audio.playToEnd(urls[i]);
        } catch (_) {
          if (run != _run) return;
          failed = true;
          _reset();
          unawaited(_audio.stop());
          return;
        }
      }
    }
    if (run == _run) _reset();
  }

  void stop() {
    _run++;
    _reset();
    unawaited(_audio.stop());
  }

  void _preempted() {
    _run++;
    _reset();
  }

  void _set({int? index, int? round, bool? loading}) {
    this.index = index ?? this.index;
    this.round = round ?? this.round;
    this.loading = loading ?? this.loading;
    if (!_disposed) notifyListeners();
  }

  void _reset() => _set(index: -1, round: 1, loading: false);

  @override
  void dispose() {
    if (playing) stop();
    _disposed = true;
    super.dispose();
  }
}
