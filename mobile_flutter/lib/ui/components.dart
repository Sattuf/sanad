import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../content/arabic.dart';
import '../content/content_repository.dart';
import '../content/models.dart';
import '../core/audio.dart';
import '../theme/theme.dart';
import '../theme/tokens.g.dart';

/// نظير `Card` في الويب: سطح أبيض، حدّ خفيف، زوايا rounded-2xl، حشوة p-5.
class SanadCard extends StatelessWidget {
  const SanadCard({super.key, required this.child, this.padding = const EdgeInsets.all(20), this.color});
  final Widget child;
  final EdgeInsets padding;
  final Color? color;

  @override
  Widget build(BuildContext context) => Container(
        padding: padding,
        decoration: BoxDecoration(
          color: color ?? context.t.surface,
          borderRadius: BorderRadius.circular(Radii.x2l),
          border: Border.all(color: context.t.border),
        ),
        child: child,
      );
}

/// نظير ProgressRing في الويب: حلقة رفيعة بطرف دائري تتحرك بنعومة.
class ProgressRing extends StatelessWidget {
  const ProgressRing({super.key, required this.value, this.size = 64, this.stroke = 6, this.color, this.child});
  final double value;
  final double size;
  final double stroke;
  final Color? color;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final c = color ?? context.t.primary;
    return SizedBox.square(
      dimension: size,
      child: TweenAnimationBuilder<double>(
        tween: Tween(end: value.clamp(0, 1)),
        duration: MediaQuery.disableAnimationsOf(context) ? Duration.zero : const Duration(milliseconds: 600),
        curve: Curves.easeOut,
        builder: (context, v, _) => CustomPaint(
          painter: _RingPainter(v, stroke, c, context.t.text.withValues(alpha: 0.12)),
          child: Center(child: child),
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter(this.value, this.stroke, this.color, this.track);
  final double value;
  final double stroke;
  final Color color;
  final Color track;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final r = rect.deflate(stroke / 2);
    canvas.drawArc(r, 0, math.pi * 2, false, Paint()..style = PaintingStyle.stroke..strokeWidth = stroke..color = track);
    if (value > 0) {
      canvas.drawArc(
        r,
        -math.pi / 2,
        math.pi * 2 * value,
        false,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = stroke
          ..strokeCap = StrokeCap.round
          ..color = color,
      );
    }
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.value != value || old.color != color || old.track != track;
}

/// نظير ProgressBar في الويب (progress-track + شريط ملوّن).
class ProgressBar extends StatelessWidget {
  const ProgressBar({super.key, required this.value, required this.label, this.color});
  final double value;
  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) => Semantics(
        label: label,
        value: '${(value * 100).round()}٪',
        child: ClipRRect(
          borderRadius: BorderRadius.circular(Radii.full),
          child: LinearProgressIndicator(
            value: value.clamp(0, 1),
            minHeight: 10,
            color: color ?? context.t.primary,
            backgroundColor: (color ?? context.t.primary).withValues(alpha: 0.14),
          ),
        ),
      );
}

/// آيات بخط عثماني كبير، مع تلاوة متتابعة وتظليل الآية الجارية وتكرار اختياري — كـ VerseBlock في الويب.
class VerseBlock extends ConsumerStatefulWidget {
  const VerseBlock({super.key, required this.refs, required this.content, this.repeat = 1, this.large = false, this.showControls = true});
  final List<String> refs;
  final ContentRepository content;
  final int repeat;
  final bool large;
  final bool showControls;

  @override
  ConsumerState<VerseBlock> createState() => _VerseBlockState();
}

class _VerseBlockState extends ConsumerState<VerseBlock> {
  late final List<Ayah> _ayat = [for (final r in widget.refs) ...widget.content.expandRef(r)];
  late final Playlist _player = Playlist(ref.read(recitationAudioProvider), [for (final a in _ayat) ayahAudioUrl(a.surah, a.ayah)], repeat: widget.repeat)
    ..addListener(_changed);

  void _changed() => setState(() {});

  @override
  void dispose() {
    _player
      ..removeListener(_changed)
      ..dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final style = TextStyle(fontFamily: kQuran, fontSize: widget.large ? 28 : 23, height: 2.5, color: t.text);
    final label = widget.refs.map((r) => widget.content.quran[r]!.label).join('، ');
    var n = 0;
    return Column(
      children: [
        for (final r in widget.refs)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text.rich(
              TextSpan(
                children: [
                  for (final a in widget.content.expandRef(r))
                    TextSpan(
                      style: _player.index == n++ ? TextStyle(backgroundColor: t.lampGlow.withValues(alpha: 0.35)) : null,
                      children: [
                        TextSpan(text: '${a.text} '),
                        TextSpan(
                          text: '﴿${arNum(a.ayah)}﴾ ',
                          style: TextStyle(fontSize: style.fontSize! * 0.8, color: t.primary),
                        ),
                      ],
                    ),
                ],
              ),
              style: style,
              textAlign: TextAlign.center,
            ),
          ),
        if (widget.showControls)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Wrap(
              alignment: WrapAlignment.center,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 8,
              runSpacing: 8,
              children: [
                Semantics(
                  button: true,
                  label: _player.playing ? 'إيقاف تلاوة $label' : 'استمع: $label',
                  excludeSemantics: true,
                  child: FilledButton.icon(
                    onPressed: () => _player.playing ? _player.stop() : _player.play(),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(44, 40),
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      shape: const StadiumBorder(),
                      textStyle: const TextStyle(fontFamily: kSans, fontWeight: FontWeight.w600, fontSize: 14),
                    ),
                    icon: PlayIcon(playing: _player.playing, size: 16),
                    label: Text(_player.playing ? (_player.loading ? 'جارٍ التحميل…' : 'إيقاف') : 'استمع للتلاوة'),
                  ),
                ),
                Semantics(
                  label: 'عدد مرات التكرار',
                  child: Container(
                    padding: const EdgeInsets.all(3),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(Radii.full),
                      border: Border.all(color: t.border),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        for (final times in const [1, 3, 7])
                          Semantics(
                            selected: _player.repeat == times,
                            button: true,
                            child: InkWell(
                              borderRadius: BorderRadius.circular(Radii.full),
                              onTap: () => setState(() => _player.repeat = times),
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                                decoration: BoxDecoration(color: _player.repeat == times ? t.surface2 : null, borderRadius: BorderRadius.circular(Radii.full)),
                                child: Text(
                                  '×${arNum(times)}',
                                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: _player.repeat == times ? t.primary : t.muted),
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                if (_player.playing && _player.repeat > 1)
                  Text('الجولة ${arNum(_player.round)} من ${arNum(_player.repeat)}', style: TextStyle(fontSize: 12, color: t.muted)),
                if (_player.failed) Text('تعذّر التشغيل — تحقق من الاتصال', style: TextStyle(fontSize: 12, color: t.warning)),
              ],
            ),
          ),
        Text(
          '$label · تلاوة مشاري العفاسي',
          style: TextStyle(fontSize: 12, color: t.muted),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}

/// أيقونة التشغيل معكوسة لتشير مع اتجاه القراءة (كالويب).
class PlayIcon extends StatelessWidget {
  const PlayIcon({super.key, required this.playing, this.size = 14, this.color});
  final bool playing;
  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) => playing
      ? Icon(Icons.pause_rounded, size: size, color: color)
      : Transform.flip(
          flipX: true,
          child: Icon(Icons.play_arrow_rounded, size: size, color: color),
        );
}

/// عدّاد تسبيح بلمسة — للأذكار ذات العدد الوارد فقط (TapCounter في الويب).
class TapCounter extends StatefulWidget {
  const TapCounter({super.key, required this.target, this.onComplete});
  final int target;
  final VoidCallback? onComplete;

  @override
  State<TapCounter> createState() => _TapCounterState();
}

class _TapCounterState extends State<TapCounter> {
  int n = 0;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final done = n >= widget.target;
    return Semantics(
      button: true,
      label: done ? 'اكتمل العدد — اضغط لإعادة العد' : 'اضغط مع كل مرة: $n من ${widget.target}',
      child: InkWell(
        borderRadius: BorderRadius.circular(Radii.full),
        onTap: () {
          if (done) return setState(() => n = 0);
          setState(() => n++);
          if (n == widget.target) {
            HapticFeedback.lightImpact();
            widget.onComplete?.call();
          }
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: done ? t.successBg : t.surface,
            borderRadius: BorderRadius.circular(Radii.full),
            border: Border.all(color: done ? Colors.transparent : t.border),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              ProgressRing(value: n / widget.target, size: 26, stroke: 3, color: done ? t.success : t.primary),
              const SizedBox(width: 10),
              Text(
                done ? 'اكتمل ✓' : '${arNum(n)} / ${arNum(widget.target)}',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: done ? t.success : t.text),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// يعرض أي عنصر من المكتبة بحسب نوعه — كـ ItemView في الويب.
class ItemView extends StatelessWidget {
  const ItemView({super.key, required this.item, required this.content, this.large = false, this.onCounted});
  final LibraryItem item;
  final ContentRepository content;
  final bool large;
  final VoidCallback? onCounted;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (item.kind == ItemKind.verses) VerseBlock(refs: item.refs, content: content, repeat: item.repeat ?? 1, large: large),
        if (item.kind == ItemKind.dhikr && item.text != null)
          Text(item.text!, textAlign: TextAlign.center, style: TextStyle(fontFamily: kNaskh, fontSize: large ? 28 : 22, height: 2.2, color: t.text)),
        if (item.kind == ItemKind.practice && item.text != null) Text(item.text!, style: TextStyle(height: 1.9, color: t.muted)),
        if (item.note != null)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(item.note!, textAlign: TextAlign.center, style: TextStyle(fontSize: 14, color: t.muted, height: 1.8)),
          ),
        const SizedBox(height: 12),
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          runSpacing: 8,
          children: [
            if (item.source != null) Text('المصدر: ${item.source}', style: TextStyle(fontSize: 12, color: t.muted)),
            if (item.kind == ItemKind.dhikr && (item.repeat ?? 0) > 1) TapCounter(target: item.repeat!, onComplete: onCounted),
            if (item.kind == ItemKind.verses && (item.repeat ?? 0) > 1)
              Text('تُقرأ ${arNum(item.repeat!)} مرات', style: TextStyle(fontSize: 12, color: t.muted)),
          ],
        ),
      ],
    );
  }
}

/// عنوان الصفحة ووصفها — نظير PageHeader في الويب.
class PageHeader extends StatelessWidget {
  const PageHeader({super.key, required this.title, this.subtitle});
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Semantics(header: true, child: Text(title, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700, height: 1.3))),
            if (subtitle != null) ...[
              const SizedBox(height: 4),
              Text(subtitle!, style: TextStyle(color: context.t.muted)),
            ],
          ],
        ),
      );
}

/// رابط بخلفية الفجر مع زر صغير — دعوة الاختبار في البرامج والميزان.
class DawnLink extends StatelessWidget {
  const DawnLink({super.key, required this.title, required this.sub, required this.cta, required this.onTap});
  final String title;
  final String sub;
  final String cta;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    return Material(
      color: Colors.transparent,
      child: Ink(
        decoration: BoxDecoration(gradient: t.dawn, borderRadius: BorderRadius.circular(Radii.x2l), border: Border.all(color: t.border)),
        child: InkWell(
          borderRadius: BorderRadius.circular(Radii.x2l),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
                      Text(sub, style: TextStyle(fontSize: 14, color: t.muted)),
                    ],
                  ),
                ),
                const SizedBox(width: 16),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(color: t.primary, borderRadius: BorderRadius.circular(Radii.xl)),
                  child: Text(cta, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: t.primaryContrast)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// ألوان نغمات الشارة — نفس tones في components/ui بالويب.
({Color bg, Color fg, Color border}) toneColors(SanadTokens t, String tone) => switch (tone) {
      'success' => (bg: t.successBg, fg: t.success, border: Colors.transparent),
      'warning' => (bg: t.warningBg, fg: t.warning, border: Colors.transparent),
      'danger' => (bg: t.dangerBg, fg: t.danger, border: Colors.transparent),
      'lamp' => (bg: t.warningBg, fg: t.lamp, border: Colors.transparent),
      'primary' => (bg: t.surface2, fg: t.primary, border: t.border),
      _ => (bg: t.surface2, fg: t.muted, border: t.border),
    };

/// لون الشريط الجانبي لكل حكم (toneColor في AwarenessPages).
Color toneAccent(SanadTokens t, String tone) => switch (tone) {
      'danger' => t.danger,
      'warning' => t.warning,
      'success' => t.success,
      _ => t.skyStrong,
    };

class SanadBadge extends StatelessWidget {
  const SanadBadge({super.key, required this.label, this.tone = 'neutral', this.colors});
  final String label;
  final String tone;

  /// ألوان خاصة بدل النغمة (شارات البرامج: «أتممته» بلون الرمل).
  final ({Color bg, Color fg, Color border})? colors;

  @override
  Widget build(BuildContext context) {
    final c = colors ?? toneColors(context.t, tone);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
      decoration: BoxDecoration(color: c.bg, borderRadius: BorderRadius.circular(Radii.full), border: Border.all(color: c.border)),
      child: Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c.fg)),
    );
  }
}

/// شارة الحكم في ميزان الوعي: منهيّ عنه / لا أصل له / فيه تفصيل / مشروع.
class VerdictBadge extends StatelessWidget {
  const VerdictBadge({super.key, required this.verdict, required this.content});
  final String verdict;
  final ContentRepository content;

  @override
  Widget build(BuildContext context) => SanadBadge(label: content.verdictLabel[verdict]!, tone: content.verdictTone[verdict]!);
}

/// بطاقة ممارسة في ميزان الوعي: العنوان والحكم، وتنفتح على الحكم الشرعي بدليله والتفسير والبديل.
class MythCard extends StatefulWidget {
  const MythCard({super.key, required this.myth, required this.content, this.defaultOpen = false});
  final Myth myth;
  final ContentRepository content;
  final bool defaultOpen;

  @override
  State<MythCard> createState() => _MythCardState();
}

class _MythCardState extends State<MythCard> {
  late bool open = widget.defaultOpen;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final m = widget.myth;
    final tone = widget.content.verdictTone[m.verdict]!;
    final alt = m.alternativeItemId == null ? null : widget.content.item(m.alternativeItemId!);
    final altLink = alt == null ? null : (alt.id == 'self-ruqyah' ? '/self-ruqyah' : '/programs');
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(color: t.surface, borderRadius: BorderRadius.circular(Radii.x2l), border: Border.all(color: t.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            button: true,
            expanded: open,
            child: InkWell(
              onTap: () => setState(() => open = !open),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Container(width: 6, height: 40, decoration: BoxDecoration(color: toneAccent(t, tone), borderRadius: BorderRadius.circular(Radii.full))),
                    const SizedBox(width: 12),
                    Expanded(child: Text(m.title, style: const TextStyle(fontWeight: FontWeight.w600, height: 1.75))),
                    const SizedBox(width: 12),
                    VerdictBadge(verdict: m.verdict, content: widget.content),
                  ],
                ),
              ),
            ),
          ),
          AnimatedSize(
            duration: MediaQuery.disableAnimationsOf(context) ? Duration.zero : const Duration(milliseconds: 250),
            curve: Curves.easeOut,
            alignment: Alignment.topCenter,
            child: !open
                ? const SizedBox(width: double.infinity)
                : Container(
                    decoration: BoxDecoration(border: Border(top: BorderSide(color: t.border))),
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _MythSection(title: 'الحكم الشرعي', accent: t.primary, children: [
                          Text(m.shariah),
                          if (m.evidenceText != null)
                            Container(
                              margin: const EdgeInsets.only(top: 8),
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                              decoration: BoxDecoration(color: t.surface2, borderRadius: BorderRadius.circular(Radii.xl)),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(m.evidenceText!, style: const TextStyle(fontFamily: kNaskh, fontSize: 18, height: 1.9)),
                                  if (m.evidenceSource != null) Text(m.evidenceSource!, style: TextStyle(fontSize: 12, color: t.muted)),
                                ],
                              ),
                            ),
                        ]),
                        const SizedBox(height: 16),
                        _MythSection(title: 'التفسير العلمي والنفسي', accent: t.skyStrong, children: [Text(m.science)]),
                        const SizedBox(height: 16),
                        _MythSection(title: 'البديل الصحيح', accent: t.success, children: [
                          Text(m.alternative),
                          if (alt != null && altLink != null)
                            Align(
                              alignment: AlignmentDirectional.centerStart,
                              child: TextButton(
                                onPressed: () => context.push(altLink),
                                style: TextButton.styleFrom(
                                  foregroundColor: t.primary,
                                  padding: EdgeInsets.zero,
                                  textStyle: const TextStyle(fontFamily: kSans, fontWeight: FontWeight.w600, fontSize: 14),
                                ),
                                child: Text('← ${alt.title}'),
                              ),
                            ),
                        ]),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _MythSection extends StatelessWidget {
  const _MythSection({required this.title, required this.accent, required this.children});
  final String title;
  final Color accent;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => DefaultTextStyle.merge(
        style: TextStyle(height: 2, color: context.t.text.withValues(alpha: 0.9)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: accent, height: 1.6)),
            const SizedBox(height: 4),
            ...children,
          ],
        ),
      );
}

/*
  دائرة الذكر بتمهّل (وضع السكينة) — بدل تمارين التنفّس: تنبض نبضاً هادئاً يضبط إيقاع الترديد،
  والعدّ بلمسة كالمسبحة. لا عدّ آلي ولا أي طقس، ذكر مأثور فقط بمصدره.
*/
class PacedDhikrCircle extends StatefulWidget {
  const PacedDhikrCircle({super.key, required this.dhikr, required this.pulseSeconds});
  final List<PacedDhikr> dhikr;
  final int pulseSeconds;

  @override
  State<PacedDhikrCircle> createState() => _PacedDhikrCircleState();
}

class _PacedDhikrCircleState extends State<PacedDhikrCircle> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(vsync: this, duration: Duration(seconds: widget.pulseSeconds));
  int which = 0;
  int count = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // احترام «تقليل الحركة»: الدائرة ثابتة بحجمها الكامل
    if (MediaQuery.disableAnimationsOf(context)) {
      _pulse
        ..stop()
        ..value = 0.5;
    } else if (!_pulse.isAnimating) {
      _pulse.repeat();
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final d = widget.dhikr[which];
    return Column(
      children: [
        Semantics(
          container: true,
          button: true,
          label: '${d.text} — اضغط مع كل مرة، العدد $count',
          excludeSemantics: true,
          child: GestureDetector(
            key: const ValueKey('paced-dhikr'),
            onTap: () {
              setState(() => count++);
              HapticFeedback.selectionClick();
            },
            child: SizedBox.square(
              dimension: 256,
              child: AnimatedBuilder(
                animation: _pulse,
                builder: (context, child) {
                  // نبضة واحدة كل دورة: انبساط ثم انقباض بانسياب (easeInOut كالويب)
                  final p = Curves.easeInOut.transform(_pulse.value < 0.5 ? _pulse.value * 2 : (1 - _pulse.value) * 2);
                  return Stack(
                    alignment: Alignment.center,
                    children: [
                      Transform.scale(
                        scale: 0.6 + 0.4 * p,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: RadialGradient(
                              colors: [t.sakinaGlow.withValues(alpha: 0.35), t.sakinaGlow.withValues(alpha: 0.08), t.sakinaGlow.withValues(alpha: 0)],
                              stops: const [0, 0.6, 0.72],
                            ),
                          ),
                          child: const SizedBox.expand(),
                        ),
                      ),
                      Transform.scale(
                        scale: 0.65 + 0.45 * p,
                        child: Opacity(
                          opacity: 0.6 + 0.4 * p,
                          child: Container(
                            width: 256 * 0.7,
                            height: 256 * 0.7,
                            decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: t.sakinaGlow.withValues(alpha: 0.5))),
                          ),
                        ),
                      ),
                      child!,
                    ],
                  );
                },
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(d.text, textAlign: TextAlign.center, style: TextStyle(fontFamily: kNaskh, fontSize: 27, height: 1.8, color: t.sakinaDhikr)),
                      Text(arNum(count), style: TextStyle(fontSize: 30, fontWeight: FontWeight.w300, color: t.sakinaAccent)),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text('ردّد بتمهّل مع نبض الدائرة، والمسها مع كل مرة', style: TextStyle(fontSize: 14, color: t.sakinaMuted)),
        const SizedBox(height: 16),
        Semantics(
          label: 'اختر الذكر',
          child: Wrap(
            alignment: WrapAlignment.center,
            spacing: 6,
            runSpacing: 6,
            children: [
              for (var i = 0; i < widget.dhikr.length; i++)
                SakinaChip(
                  label: widget.dhikr[i].text,
                  selected: which == i,
                  small: true,
                  onTap: () => setState(() {
                    which = i;
                    count = 0;
                  }),
                ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Text(d.source, textAlign: TextAlign.center, style: TextStyle(fontSize: 11, color: t.sakinaFaint)),
      ],
    );
  }
}

/// زر بيضاوي خافت في وضع السكينة (الحالات والأذكار).
class SakinaChip extends StatelessWidget {
  const SakinaChip({super.key, required this.label, required this.selected, required this.onTap, this.small = false});
  final String label;
  final bool selected;
  final bool small;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    return Semantics(
      selected: selected,
      button: true,
      child: Material(
        color: selected ? t.sakinaGlow.withValues(alpha: 0.18) : Colors.transparent,
        shape: const StadiumBorder(),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: Padding(
            padding: small ? const EdgeInsets.symmetric(horizontal: 12, vertical: 4) : const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Text(label, style: TextStyle(fontSize: small ? 12 : 14, color: selected ? t.sakinaInk : t.sakinaMuted)),
          ),
        ),
      ),
    );
  }
}

/// مقياس الهدوء ٠–١٠ (اختياري) — قبل جلسة الرقية وبعدها.
class CalmnessScale extends StatelessWidget {
  const CalmnessScale({super.key, required this.label, required this.value, required this.onChanged});
  final String label;
  final int? value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    return Padding(
      padding: const EdgeInsets.only(top: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (var n = 0; n <= 10; n++)
                Semantics(
                  selected: value == n,
                  button: true,
                  child: Material(
                    color: value == n ? t.primary : t.surface,
                    shape: CircleBorder(side: BorderSide(color: value == n ? t.primary : t.border)),
                    child: InkWell(
                      customBorder: const CircleBorder(),
                      onTap: () => onChanged(n),
                      child: SizedBox.square(
                        dimension: 40,
                        child: Center(
                          child: Text(arNum(n), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: value == n ? t.primaryContrast : t.text)),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 506),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('متوتر جداً', style: TextStyle(fontSize: 12, color: t.muted)),
                Text('مطمئن تماماً', style: TextStyle(fontSize: 12, color: t.muted)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// رمز البرنامج بلونه — نظير ProgramArt (درع، مصباح، قلب، هلال).
class ProgramArt extends StatelessWidget {
  const ProgramArt({super.key, required this.program, this.size = 56});
  final Program program;
  final double size;

  @override
  Widget build(BuildContext context) {
    final tint = tintColors(context.t, program.tint);
    final icon = switch (program.tint) {
      Tint.teal => Icons.shield_outlined,
      Tint.sky => Icons.lightbulb_outline_rounded,
      Tint.sage => Icons.favorite_border_rounded,
      Tint.sand => Icons.dark_mode_outlined,
    };
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(color: tint.bg, borderRadius: BorderRadius.circular(Radii.x2l)),
        child: Icon(icon, size: size * 0.5, color: tint.ink),
      ),
    );
  }
}
