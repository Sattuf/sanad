import 'package:flutter_test/flutter_test.dart';
import 'package:sanad/core/audio.dart';

import 'today_screen_test.dart' show FakeAudio;

void main() {
  Future<void> settle() => Future<void>.delayed(Duration.zero);

  test('مسار التلاوة هو مسار الويب نفسه', () {
    expect(ayahAudioUrl(2, 255), endsWith('/api/v1/public/recitation/Alafasy_128kbps/2/255'));
  });

  test('القائمة تُشغَّل بالترتيب، وتتكرر repeat مرة، ثم تتوقف', () async {
    final audio = FakeAudio();
    final p = Playlist(audio, ['a', 'b'], repeat: 2);
    final rounds = <int>[];
    p.addListener(() => rounds.add(p.round));
    final done = p.play();
    for (var i = 0; i < 4; i++) {
      await settle();
      audio.finishCurrent();
    }
    await done;
    expect(audio.played, ['a', 'b', 'a', 'b']);
    expect(rounds, contains(2));
    expect(p.playing, isFalse);
  });

  test('قائمة جديدة توقف السابقة (مشغّل واحد مشترك)', () async {
    final audio = FakeAudio();
    final first = Playlist(audio, ['a', 'b']);
    final second = Playlist(audio, ['x']);
    first.play();
    await settle();
    expect(first.playing, isTrue);
    second.play();
    await settle();
    expect(first.playing, isFalse);
    expect(second.playing, isTrue);
    audio.finishCurrent();
    await settle();
    expect(audio.played, ['a', 'x']);
  });

  test('فشل الجلب: failed ولا تعليق', () async {
    final p = Playlist(FakeAudio(fail: true), ['a']);
    await p.play();
    expect(p.failed, isTrue);
    expect(p.playing, isFalse);
  });
}
