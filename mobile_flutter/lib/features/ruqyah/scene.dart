import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../content/ruqyah.dart';
import '../../theme/theme.dart';
import '../../theme/tokens.g.dart';

/*
  خلفيات «الرقية والتحصين» — نظير Scene.tsx: ثلاث طبقات — صورة المشهد (assets/scenes، منسوخة من الويب)،
  وتدرّج يضمن تباين النص ويبقى وحده إن لم تتوفر الصورة، ونقش هندسي ذهبي خافت.
  النص القرآني لا يُرسم داخل الصور أبداً: يُكتب فوقها بخط حقيقي.
  الألوان كلها من رموز --scene-* المولَّدة؛ هنا بنية التدرّج فقط (الاتجاه والمحطات والشفافية) كما في Scene.tsx.
*/

/// اتجاه CSS ‏`linear-gradient(<deg>)` ← بداية ونهاية Flutter.
LinearGradient cssLinear(double deg, List<Color> colors, List<double> stops) {
  final r = deg * math.pi / 180;
  final x = math.sin(r), y = -math.cos(r);
  return LinearGradient(begin: Alignment(-x, -y), end: Alignment(x, y), colors: colors, stops: stops);
}

/// radial-gradient(circle at X% Y%, c, transparent R%) ← RadialGradient تقريبي.
RadialGradient cssRadial(double xPct, double yPct, Color c, double radius) =>
    RadialGradient(center: Alignment(xPct / 50 - 1, yPct / 50 - 1), radius: radius, colors: [c, c.withValues(alpha: 0)]);

({List<Gradient> overlays, Gradient base}) sceneTint(SanadTokens t, SceneTheme theme) {
  Color a(Color c, double o) => c.withValues(alpha: o);
  const clear = Colors.transparent;
  return switch (theme) {
    SceneTheme.lantern => (
        overlays: [
          cssLinear(115, [a(t.sceneLanternA, .35), a(t.sceneLanternA, .78), a(t.sceneLanternB, .92)], [0, .55, 1]),
          cssRadial(18, 40, a(t.sceneGold, .35), .6),
        ],
        base: cssLinear(160, [t.sceneLanternBase1, t.sceneLanternBase2], [0, 1]),
      ),
    SceneTheme.dawn => (
        overlays: [
          cssLinear(270, [a(t.sceneDawnA, .72), a(t.sceneDawnA, .35), clear], [0, .55, 1]),
          cssLinear(180, [a(t.sceneDawnB, .25), a(t.sceneDawnC, .6), a(t.sceneDawnA, .9)], [0, .55, 1]),
        ],
        base: cssLinear(180, [t.sceneDawnBase1, t.sceneDawnBase2, t.sceneDawnBase3], [0, .4, 1]),
      ),
    SceneTheme.dusk => (
        overlays: [
          cssLinear(180, [a(t.sceneDuskA, .2), a(t.sceneDuskA, .65), a(t.sceneDuskB, .92)], [0, .6, 1]),
          cssRadial(75, 20, a(t.sceneGold, .3), .4),
        ],
        base: cssLinear(180, [t.sceneDuskBase1, t.sceneDuskBase2], [0, 1]),
      ),
    SceneTheme.night => (
        overlays: [
          cssLinear(180, [a(t.sceneNightA, .3), a(t.sceneNightA, .75), a(t.sceneNightB, .94)], [0, .6, 1]),
          cssRadial(70, 25, a(t.sceneMoon, .22), .35),
        ],
        base: cssLinear(180, [t.sceneNightBase1, t.sceneNightBase2], [0, 1]),
      ),
    SceneTheme.mihrab => (
        overlays: [
          cssLinear(270, [a(t.sceneMihrabA, .75), a(t.sceneMihrabA, .4), clear], [0, .55, 1]),
          cssLinear(180, [a(t.sceneMihrabB, .35), a(t.sceneMihrabC, .7), a(t.sceneMihrabA, .93)], [0, .6, 1]),
          cssRadial(50, 30, a(t.sceneGold, .2), .7),
        ],
        base: cssLinear(180, [t.sceneMihrabBase1, t.sceneMihrabBase2], [0, 1]),
      ),
    SceneTheme.manuscript => (
        overlays: [
          cssLinear(90, [a(t.sceneManuscriptA, .35), a(t.sceneManuscriptA, .8), a(t.sceneManuscriptB, .94)], [0, .6, 1]),
          cssRadial(25, 50, a(t.sceneGold, .28), .6),
        ],
        base: cssLinear(160, [t.sceneManuscriptBase1, t.sceneManuscriptBase2], [0, 1]),
      ),
  };
}

/// مشهد بخلفيته ونقشه، والنص فوقه بلون المشهد.
class Scene extends StatelessWidget {
  const Scene({super.key, required this.theme, required this.child, this.padding = const EdgeInsets.all(20), this.radius = Radii.x2l});
  final SceneTheme theme;
  final Widget child;
  final EdgeInsets padding;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final tint = sceneTint(t, theme);
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: Stack(
        children: [
          Positioned.fill(child: DecoratedBox(decoration: BoxDecoration(gradient: tint.base))),
          Positioned.fill(
            child: Image.asset(
              'assets/scenes/${theme.name}.jpg',
              fit: BoxFit.cover,
              excludeFromSemantics: true,
              // لا صورة لهذا المشهد (manuscript): يبقى التدرّج وحده كالويب
              errorBuilder: (_, _, _) => const SizedBox.shrink(),
            ),
          ),
          for (final g in tint.overlays) Positioned.fill(child: DecoratedBox(decoration: BoxDecoration(gradient: g))),
          Positioned.fill(child: Opacity(opacity: 0.12, child: CustomPaint(painter: _StarPattern(t.sceneGold)))),
          Padding(
            padding: padding,
            child: DefaultTextStyle.merge(style: TextStyle(color: t.sceneText), child: child),
          ),
        ],
      ),
    );
  }
}

/// نجمة ثمانية متكررة بخط ذهبي رفيع — نقش Scene.tsx (مربع 80).
class _StarPattern extends CustomPainter {
  _StarPattern(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color.withValues(alpha: 0.55)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.8;
    final star = Path()
      ..moveTo(40, 8)
      ..lineTo(49, 31)
      ..lineTo(72, 40)
      ..lineTo(49, 49)
      ..lineTo(40, 72)
      ..lineTo(31, 49)
      ..lineTo(8, 40)
      ..lineTo(31, 31)
      ..close();
    const square = Rect.fromLTWH(22, 22, 36, 36);
    for (var x = 0.0; x < size.width; x += 80) {
      for (var y = 0.0; y < size.height; y += 80) {
        canvas
          ..save()
          ..translate(x, y)
          ..drawPath(star, paint)
          ..drawRect(square, paint)
          ..translate(40, 40)
          ..rotate(math.pi / 4)
          ..translate(-40, -40)
          ..drawRect(square, paint)
          ..restore();
      }
    }
  }

  @override
  bool shouldRepaint(_StarPattern old) => old.color != color;
}

/// زخرفة فاصلة ذهبية بين الأقسام (نجمة بين خطين).
class Ornament extends StatelessWidget {
  const Ornament({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.t.lamp;
    Widget line(bool fadeToStart) => Container(
          width: 64,
          height: 1,
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: fadeToStart ? [c.withValues(alpha: 0), c.withValues(alpha: .6)] : [c.withValues(alpha: .6), c.withValues(alpha: 0)]),
          ),
        );
    return ExcludeSemantics(
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          line(true),
          const SizedBox(width: 12),
          Icon(Icons.auto_awesome, size: 18, color: c),
          const SizedBox(width: 12),
          line(false),
        ],
      ),
    );
  }
}
