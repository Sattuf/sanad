import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio/just_audio.dart';
import 'package:just_audio_background/just_audio_background.dart';
import 'package:path_provider/path_provider.dart';

/*
  تلاوة الآيات من خادم سند نفسه (/api/v1/public/recitation)، كـ frontend/src/features/ruqyah/recitation.ts.
  كل آية تُحفظ ملفاً على الجهاز عند أول استماع ثم تُشغَّل منه — فتعمل «السكينة» والمرشد
  في وضع الطيران بعد أول تشغيل (نظير Cache API في frontend/src/components/companion/audio.ts).
*/

/// عنوان الخادم: `flutter run --dart-define=SANAD_API_BASE=https://…` (نظير EXPO_PUBLIC_API_BASE_URL).
const apiBase = String.fromEnvironment('SANAD_API_BASE', defaultValue: 'http://localhost:5080');
/// القارئ الافتراضي — أول القرّاء في packages/shared/content/recitation.ts (السكينة والمرشد يقرآن به دائماً).
const defaultReciter = 'Alafasy_128kbps';

String ayahAudioUrl(int surah, int ayah, [String reciter = defaultReciter]) => '$apiBase/api/v1/public/recitation/$reciter/$surah/$ayah';

/// ما يظهر في إشعار التشغيل وشاشة القفل. في الوضع المتحفّظ عنوان محايد لا يكشف المحتوى.
typedef NowPlaying = ({String title, String? subtitle});

const neutralNowPlaying = (title: 'مقطع صوتي', subtitle: null);

/// موضع التشغيل ومدته — لشريط مشغّل المكتبة.
typedef PlaybackProgress = ({Duration position, Duration? duration});

/// واجهة الصوت — تُستبدل في الاختبارات بنسخة وهمية.
/// مشغّل واحد للتطبيق كله (التلاوة والسكينة والمكتبة)، يعمل في الخلفية والشاشة مقفلة.
abstract class RecitationAudio {
  Future<bool> isCached(String url);

  /// يجلب الملف ويحفظه إن لم يكن محفوظاً.
  Future<void> cache(String url);

  /// يشغّل المقطع (المحفوظ) ويكتمل عند انتهائه أو إيقافه.
  /// stream: يُشغَّل من الشبكة دون حفظ (مقاطع المكتبة الطويلة).
  Future<void> playToEnd(String url, {NowPlaying? info, bool stream = false});

  /// الموضع والمدة للمقطع الجاري.
  Stream<PlaybackProgress> get progress;

  Future<void> seek(Duration position);

  Future<void> stop();

  /// إيقاف مؤقت ومتابعة المقطع الجاري (playToEnd يبقى منتظراً حتى ينتهي أو يُوقف).
  Future<void> pause();
  Future<void> resume();

  /// مشغّل واحد مشترك: من يبدأ التشغيل يوقف القائمة السابقة.
  void claim(VoidCallback onPreempted);

  /// يحذف التلاوات المحفوظة (مسح كل البيانات).
  Future<void> clearCache();
}

class DeviceRecitationAudio implements RecitationAudio {
  /// cacheDir: مجلد الحفظ في الاختبارات بدل مجلد التطبيق.
  DeviceRecitationAudio({Directory? cacheDir}) : _dir = cacheDir;

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

  // جسم بأقواس لا سهم: remove تعيد المستقبل نفسه، وwhenComplete تنتظر ما يُعاد — فينتظر نفسه أبداً
  Future<File> _ensure(String url) => _inflight[url] ??= _download(url).whenComplete(() {
        _inflight.remove(url);
      });

  /// انقطاع عابر لا يُنهي تلاوة طويلة: محاولتان أخريان قبل إظهار الخطأ.
  static const _attempts = 3;

  Future<File> _download(String url) async {
    final file = await _file(url);
    if (await file.exists()) return file;
    await file.parent.create(recursive: true);
    for (var attempt = 1;; attempt++) {
      try {
        return await _fetch(url, file);
      } on Object {
        if (attempt >= _attempts) rethrow;
        await Future<void>.delayed(Duration(seconds: attempt));
      }
    }
  }

  Future<File> _fetch(String url, File file) async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 15);
    try {
      final res = await (await client.getUrl(Uri.parse(url))).close();
      if (res.statusCode != 200) throw HttpException('${res.statusCode}', uri: Uri.parse(url));
      // كتابة ثم إعادة تسمية: لا يبقى ملف ناقص يُظن محفوظاً. والنقل المتوقف يُقطع بدل أن يعلق
      final part = File('${file.path}.part');
      await res.timeout(const Duration(seconds: 20)).pipe(part.openWrite());
      if (res.contentLength >= 0 && await part.length() != res.contentLength) {
        throw HttpException('ناقص: ${await part.length()} من ${res.contentLength}', uri: Uri.parse(url));
      }
      return part.rename(file.path);
    } finally {
      client.close(force: true);
    }
  }

  @override
  Future<void> playToEnd(String url, {NowPlaying? info, bool stream = false}) async {
    final file = stream ? null : await _ensure(url);
    final player = _player ??= AudioPlayer();
    // وسم الإشعار: just_audio_background يشترطه على كل مقطع
    final tag = MediaItem(id: url, title: (info ?? neutralNowPlaying).title, album: (info ?? neutralNowPlaying).subtitle);
    final done = _current = Completer<void>();
    // البث يعيد آخر حالة لكل مستمع جديد: «انتهى» الآية السابقة يصل فوراً. لا نعدّ الانتهاء إلا بعد أن يبدأ هذا المقطع
    var started = false;
    final sub = player.playerStateStream.listen(
      (s) {
        if (s.processingState != ProcessingState.completed) {
          started = true;
        } else if (started && !done.isCompleted) {
          done.complete();
        }
      },
      onError: (Object e) {
        if (!done.isCompleted) done.completeError(e);
      },
    );
    try {
      // المشغّل يبقى «يعمل» بين الآيات فلا تخرج الخدمة من المقدّمة والشاشة مقفلة
      await player.setAudioSource(file == null ? AudioSource.uri(Uri.parse(url), tag: tag) : AudioSource.file(file.path, tag: tag));
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
  Stream<PlaybackProgress> get progress {
    final p = _player ??= AudioPlayer();
    return p.positionStream.map((pos) => (position: pos, duration: p.duration));
  }

  @override
  Future<void> seek(Duration position) async => _player?.seek(position);

  @override
  Future<void> pause() async => _player?.pause();

  @override
  Future<void> resume() async {
    final p = _player;
    if (p != null) unawaited(p.play());
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
  Playlist(this._audio, this.urls, {this.repeat = 1, this.info});

  final RecitationAudio _audio;
  final List<String> urls;
  int repeat;

  /// عنوان الإشعار؛ بلا عنوان يظهر محايداً.
  final NowPlaying? info;

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
          // الآية التالية تُجلب أثناء هذه، فلا فجوة والشاشة مقفلة
          final next = i + 1 < urls.length ? urls[i + 1] : (r < repeat ? urls.first : null);
          if (next != null) unawaited(_audio.cache(next).then((_) {}, onError: (_) {}));
          await _audio.playToEnd(urls[i], info: info);
        } catch (_) {
          if (run != _run) return;
          failed = true;
          _reset();
          unawaited(_audio.stop());
          return;
        }
      }
    }
    if (run == _run) {
      _reset();
      unawaited(_audio.stop()); // يُزيل إشعار التشغيل بعد آخر مقطع
    }
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
