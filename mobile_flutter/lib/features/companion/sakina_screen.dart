import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../content/arabic.dart';
import '../../content/content_repository.dart';
import '../../content/models.dart';
import '../../core/audio.dart';
import '../../theme/theme.dart';
import '../../ui/components.dart';
import 'companion_store.dart';

/*
  وضع السكينة — نظير SakinaPage في frontend/src/features/companion/SakinaPage.tsx.
  لمن يشعر بضيق مفاجئ أو فزع ليلي أو أرق: شاشة خافتة، ذكر بتمهّل بدائرة تنبض والعدّ بلمسة
  (لا تمارين تنفّس)، وآيات وأدعية بصوت هادئ. التلاوات تُحفظ على الجهاز فتعمل في وضع الطيران.
*/
class SakinaScreen extends ConsumerStatefulWidget {
  const SakinaScreen({super.key, this.need});

  /// ?for= distress | night | sleep
  final String? need;

  @override
  ConsumerState<SakinaScreen> createState() => _SakinaScreenState();
}

class _SakinaScreenState extends ConsumerState<SakinaScreen> {
  late final ContentRepository content = ref.read(contentProvider);
  late final RecitationAudio audio = ref.read(recitationAudioProvider);
  late SakinaNeed need = content.sakinaNeeds.firstWhere((n) => n.id == widget.need, orElse: () => content.sakinaNeeds.first);
  late Playlist player = _playlist();
  late final List<String> allAudio = {
    for (final n in content.sakinaNeeds)
      for (final r in n.verses)
        for (final a in content.expandRef(r)) ayahAudioUrl(a.surah, a.ayah),
  }.toList();
  int idx = 0;
  int cached = 0;
  bool busy = false;

  Playlist _playlist() => Playlist(audio, [
    for (final r in need.verses)
      for (final a in content.expandRef(r)) ayahAudioUrl(a.surah, a.ayah),
  ], repeat: content.sakinaRepeat)..addListener(_changed);

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void initState() {
    super.initState();
    _countCached();
  }

  Future<void> _countCached() async {
    var n = 0;
    for (final u in allAudio) {
      if (await audio.isCached(u)) n++;
    }
    if (mounted) setState(() => cached = n);
  }

  Future<void> _precache() async {
    setState(() => busy = true);
    var n = 0;
    for (final u in allAudio) {
      try {
        await audio.cache(u);
      } catch (_) {
        // نكمل البقية؛ العدّ النهائي يبيّن ما حُفظ فعلاً
      }
      n++;
      if (mounted) setState(() => cached = n);
    }
    await _countCached();
    if (mounted) setState(() => busy = false);
  }

  void _choose(SakinaNeed n) {
    player
      ..removeListener(_changed)
      ..dispose();
    setState(() {
      need = n;
      idx = 0;
      player = _playlist();
    });
  }

  @override
  void dispose() {
    player
      ..removeListener(_changed)
      ..dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final dhikr = content.item(need.items[idx % need.items.length]);
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(systemNavigationBarColor: t.sakinaBgDeep, statusBarColor: Colors.transparent),
      child: Scaffold(
        backgroundColor: t.sakinaBg,
        body: DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(center: Alignment.topCenter, radius: 1.6, colors: [t.sakinaBgTop, t.sakinaBg, t.sakinaBgDeep], stops: const [0, 0.6, 1]),
          ),
          child: SafeArea(
            child: DefaultTextStyle.merge(
              style: TextStyle(color: t.sakinaText),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      TextButton(
                        onPressed: () => context.canPop() ? context.pop() : context.go('/today'),
                        style: TextButton.styleFrom(foregroundColor: t.sakinaMuted, shape: const StadiumBorder()),
                        child: const Text('→ خروج'),
                      ),
                      Flexible(
                        child: Text(
                          'سكينة',
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: t.sakinaAccent),
                        ),
                      ),
                      const SizedBox(width: 64),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Semantics(
                    label: 'ما الذي تمرّ به؟',
                    child: Wrap(
                      alignment: WrapAlignment.center,
                      spacing: 8,
                      runSpacing: 8,
                      children: [for (final n in content.sakinaNeeds) SakinaChip(label: n.label, selected: n.id == need.id, onTap: () => _choose(n))],
                    ),
                  ),
                  const SizedBox(height: 32),
                  PacedDhikrCircle(dhikr: content.pacedDhikr, pulseSeconds: content.pulseSeconds),
                  const SizedBox(height: 32),
                  Semantics(
                    button: true,
                    label: 'الذكر التالي',
                    child: Material(
                      color: t.sakinaInk.withValues(alpha: 0.04),
                      borderRadius: BorderRadius.circular(Radii.x3l),
                      child: InkWell(
                        key: const ValueKey('next-dhikr'),
                        borderRadius: BorderRadius.circular(Radii.x3l),
                        onTap: () => setState(() => idx++),
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            children: [
                              Text(dhikr.title, style: TextStyle(fontSize: 12, color: t.sakinaMuted)),
                              const SizedBox(height: 8),
                              Text(
                                dhikr.text ?? '',
                                textAlign: TextAlign.center,
                                style: TextStyle(fontFamily: kNaskh, fontSize: 24, height: 2.3, color: t.sakinaInk),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                '${dhikr.source} · المس للذكر التالي',
                                textAlign: TextAlign.center,
                                style: TextStyle(fontSize: 11, color: t.sakinaFaint),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 32),
                  Center(
                    child: OutlinedButton(
                      onPressed: () => player.playing ? player.stop() : player.play(),
                      style: OutlinedButton.styleFrom(
                        backgroundColor: Colors.transparent,
                        foregroundColor: t.sakinaSoft,
                        side: BorderSide(color: t.sakinaGlow.withValues(alpha: 0.4)),
                        shape: const StadiumBorder(),
                        padding: const EdgeInsetsDirectional.fromSTEB(12, 10, 24, 10),
                        textStyle: const TextStyle(fontFamily: kSans, fontSize: 15),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          CircleAvatar(
                            radius: 16,
                            backgroundColor: t.sakinaGlow.withValues(alpha: 0.25),
                            child: PlayIcon(playing: player.playing, size: 16, color: t.sakinaSoft),
                          ),
                          const SizedBox(width: 12),
                          Flexible(
                            child: Text(
                              player.playing
                                  ? (player.loading ? 'جارٍ التحميل…' : 'إيقاف التلاوة')
                                  : (need.id == 'distress' ? 'استمع لآيات السكينة' : 'استمع لآيات التحصين'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (player.failed)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        'تعذّر تشغيل التلاوة — احفظها للاستخدام دون إنترنت حين يتوفر الاتصال.',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 12, color: t.sakinaWarn),
                      ),
                    ),
                  const SizedBox(height: 32),
                  Center(
                    child: cached < allAudio.length
                        ? TextButton(
                            onPressed: busy ? null : _precache,
                            style: TextButton.styleFrom(foregroundColor: t.sakinaAccent, disabledForegroundColor: t.sakinaAccent, shape: const StadiumBorder()),
                            child: Text(
                              busy ? 'جارٍ الحفظ… ${arNum(cached)}/${arNum(allAudio.length)}' : 'احفظ التلاوات للاستخدام دون إنترنت',
                              style: const TextStyle(fontSize: 12),
                            ),
                          )
                        : Text('التلاوات محفوظة على جهازك ✓ تعمل دون إنترنت', style: TextStyle(fontSize: 12, color: t.sakinaAccent)),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
