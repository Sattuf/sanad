import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../content/arabic.dart';
import '../content/content_repository.dart';
import '../content/models.dart';
import '../theme/theme.dart';

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

/// آيات بخط عثماني كبير، كل مقطع في فقرة، مع رقم الآية ﴿n﴾ — كـ VerseBlock في الويب.
/// (التلاوة الصوتية في مرحلة لاحقة من الخطة — §7.)
class VerseBlock extends StatelessWidget {
  const VerseBlock({super.key, required this.refs, required this.content, this.large = false});
  final List<String> refs;
  final ContentRepository content;
  final bool large;

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(fontFamily: kQuran, fontSize: large ? 28 : 23, height: 2.5, color: context.t.text);
    return Column(
      children: [
        for (final r in refs)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text.rich(
              TextSpan(
                children: [
                  for (final a in content.expandRef(r)) ...[
                    TextSpan(text: '${a.text} '),
                    TextSpan(text: '﴿${arNum(a.ayah)}﴾ ', style: TextStyle(fontSize: style.fontSize! * 0.8, color: context.t.primary)),
                  ],
                ],
              ),
              style: style,
              textAlign: TextAlign.center,
            ),
          ),
        Text(
          refs.map((r) => content.quran[r]!.label).join('، '),
          style: TextStyle(fontSize: 12, color: context.t.muted),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
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
        if (item.kind == ItemKind.verses) VerseBlock(refs: item.refs, content: content, large: large),
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
