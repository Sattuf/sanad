import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sanad/core/audio.dart';

/// الحفظ الحقيقي على الجهاز بخادم محلي: الطلب يكتمل، ويُطلب الملف مرة واحدة ولو طُلب مرتين معاً،
/// ثم يُقرأ من الجهاز دون شبكة. (كان whenComplete ينتظر المستقبل نفسه فيعلق التشغيل على الجهاز.)
void main() {
  test('cache يكتمل، والطلبات المتزامنة طلب شبكة واحد، ثم يعمل بلا شبكة', () async {
    final dir = await Directory.systemTemp.createTemp('recitation');
    addTearDown(() => dir.delete(recursive: true));
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    var hits = 0;
    server.listen((r) {
      hits++;
      r.response
        ..headers.contentType = ContentType('audio', 'mpeg')
        ..add(List.filled(4096, 7));
      r.response.close();
    });
    final audio = DeviceRecitationAudio(cacheDir: dir);
    final url = 'http://127.0.0.1:${server.port}/api/v1/public/recitation/Alafasy_128kbps/1/1';

    await Future.wait([audio.cache(url), audio.cache(url)]).timeout(const Duration(seconds: 5));
    expect(hits, 1);
    expect(await audio.isCached(url), isTrue);
    expect(File('${dir.path}/Alafasy_128kbps/1_1.mp3').lengthSync(), 4096);

    await server.close(force: true);
    await audio.cache(url).timeout(const Duration(seconds: 5));
    expect(hits, 1);
  });

  test('ملف ناقص أو انقطاع عابر: يُعاد طلبه، ولا يُحفظ الناقص', () async {
    final dir = await Directory.systemTemp.createTemp('recitation');
    addTearDown(() => dir.delete(recursive: true));
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    var hits = 0;
    server.listen((r) async {
      hits++;
      r.response.headers.contentLength = 4096;
      // الأول يُقطع قبل اكتماله
      r.response.add(List.filled(hits == 1 ? 4095 : 4096, 7));
      // الخادم يقطع الاتصال حين ينقص المحتوى عن الطول المعلن
      await r.response.close().catchError((_) {});
    });
    final audio = DeviceRecitationAudio(cacheDir: dir);
    final url = 'http://127.0.0.1:${server.port}/api/v1/public/recitation/Alafasy_128kbps/1/2';
    await audio.cache(url).timeout(const Duration(seconds: 10));
    expect(hits, 2);
    expect(File('${dir.path}/Alafasy_128kbps/1_2.mp3').lengthSync(), 4096);
  });
}
