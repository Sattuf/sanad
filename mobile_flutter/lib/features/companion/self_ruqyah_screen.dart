import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../content/arabic.dart';
import '../../content/content_repository.dart';
import '../../content/models.dart';
import '../../theme/theme.dart';
import '../../ui/components.dart';
import 'companion_store.dart';
import 'journal_queue.dart';

/*
  «ارقِ نفسك» — نظير SelfRuqyahPage في frontend/src/features/companion/SelfRuqyahPage.tsx.
  الخطوات والأذكار من المحتوى المشترك (guide.ts) فقط: نية، وضع اليد، آيات بتلاوة مسموعة، أدعية مأثورة، ثم النفث.
  ليس «خطوات علاج» ولا وعداً بنتيجة (البند 4).
*/
class SelfRuqyahScreen extends ConsumerStatefulWidget {
  const SelfRuqyahScreen({super.key});

  @override
  ConsumerState<SelfRuqyahScreen> createState() => _SelfRuqyahScreenState();
}

class _SelfRuqyahScreenState extends ConsumerState<SelfRuqyahScreen> {
  GuideMode? mode;
  int? before;
  int i = 0;
  bool finished = false;

  void _restart() => setState(() {
    mode = null;
    i = 0;
    finished = false;
    before = null;
  });

  @override
  Widget build(BuildContext context) {
    final content = ref.watch(contentProvider);
    final Widget body;
    if (mode == null) {
      body = _chooseMode(context, content);
    } else if (finished) {
      body = _Finish(before: before, onRestart: _restart);
    } else {
      body = _step(context, content, content.guideSteps[mode]!);
    }
    return Scaffold(appBar: AppBar(), body: body);
  }

  Widget _chooseMode(BuildContext context, ContentRepository content) {
    final t = context.t;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
      children: [
        Text(
          'المرشد التفاعلي',
          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: t.primary),
        ),
        const SizedBox(height: 4),
        Semantics(
          header: true,
          child: const Text('ارقِ نفسك وأهلك بنفسك', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w700, height: 1.3)),
        ),
        const SizedBox(height: 12),
        Text(
          'لا تحتاج وسيطاً: كان النبي ﷺ يرقي نفسه وأهله. سنقودك خطوة بخطوة بآيات وأدعية مأثورة فقط، بخط واضح وتلاوة تسمعها لتصحيح قراءتك. '
          'تستغرق الجلسة نحو ١٠ دقائق.',
          style: TextStyle(height: 2, color: t.muted),
        ),
        CalmnessScale(label: 'قبل أن تبدأ — ما مستوى هدوئك الآن؟ (اختياري)', value: before, onChanged: (v) => setState(() => before = v)),
        const SizedBox(height: 32),
        const Text('من سترقي اليوم؟', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        for (final m in content.guideModes)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Material(
              color: t.surface,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(Radii.x2l),
                side: BorderSide(color: t.border),
              ),
              child: InkWell(
                key: ValueKey('mode-${m.id.name}'),
                borderRadius: BorderRadius.circular(Radii.x2l),
                onTap: () => setState(() => mode = m.id),
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(m.title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text(m.sub, style: TextStyle(fontSize: 14, color: t.muted)),
                    ],
                  ),
                ),
              ),
            ),
          ),
        const SizedBox(height: 20),
        Text(
          'الرقية عبادة ودعاء، والشفاء بيد الله وحده. إن كان الألم شديداً أو مستمراً فراجع طبيباً — الأخذ بالأسباب لا ينافي الرقية.',
          style: TextStyle(fontSize: 12, height: 2, color: t.muted),
        ),
      ],
    );
  }

  Widget _step(BuildContext context, ContentRepository content, List<GuideStep> steps) {
    final t = context.t;
    final step = steps[i];
    final last = i + 1 >= steps.length;
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  TextButton(
                    onPressed: () => setState(() {
                      if (i == 0) {
                        mode = null;
                      } else {
                        i--;
                      }
                    }),
                    style: TextButton.styleFrom(
                      foregroundColor: t.primary,
                      padding: EdgeInsets.zero,
                      textStyle: const TextStyle(fontFamily: kSans, fontWeight: FontWeight.w600, fontSize: 14),
                    ),
                    child: const Text('→ رجوع'),
                  ),
                  Text('الخطوة ${arNum(i + 1)} من ${arNum(steps.length)}', style: TextStyle(fontSize: 14, color: t.muted)),
                ],
              ),
              const SizedBox(height: 8),
              ProgressBar(value: (i + 1) / steps.length, label: 'تقدّم الجلسة'),
              const SizedBox(height: 24),
              AnimatedSwitcher(
                duration: MediaQuery.disableAnimationsOf(context) ? Duration.zero : const Duration(milliseconds: 300),
                child: Container(
                  key: ValueKey(step.id),
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: t.surface,
                    borderRadius: BorderRadius.circular(Radii.x3l),
                    border: Border.all(color: t.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(step.hint, style: TextStyle(fontSize: 14, color: t.muted)),
                      const SizedBox(height: 4),
                      Semantics(
                        header: true,
                        child: Text(step.title, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700, height: 1.4)),
                      ),
                      const SizedBox(height: 24),
                      if (step.custom == 'intention') _Intention(tips: content.intentionTips),
                      if (step.custom == 'hand') _HandStep(content: content),
                      if (step.custom == 'nafth') ItemView(item: content.item(content.guideNafthItemId), content: content, large: true),
                      for (final (n, id) in step.items.indexed) ...[
                        if (n > 0) const SizedBox(height: 32),
                        ItemView(key: ValueKey('${step.id}-$id'), item: content.item(id), content: content, large: true),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () => setState(() {
                  if (last) {
                    finished = true;
                  } else {
                    i++;
                  }
                }),
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  elevation: 6,
                  textStyle: const TextStyle(fontFamily: kSans, fontWeight: FontWeight.w600, fontSize: 16),
                ),
                child: Text(last ? 'أتممت الجلسة' : 'الخطوة التالية'),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _Intention extends StatelessWidget {
  const _Intention({required this.tips});
  final List<String> tips;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    return Column(
      children: [
        for (final tip in tips)
          Container(
            width: double.infinity,
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(color: t.surface2, borderRadius: BorderRadius.circular(Radii.x2l)),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ExcludeSemantics(
                  child: Text('✦', style: TextStyle(color: t.primary, height: 1.75)),
                ),
                const SizedBox(width: 12),
                Expanded(child: Text(tip, style: const TextStyle(height: 1.75))),
              ],
            ),
          ),
      ],
    );
  }
}

class _HandStep extends StatelessWidget {
  const _HandStep({required this.content});
  final ContentRepository content;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final it = content.item(content.handItemId);
    return Column(
      children: [
        ExcludeSemantics(
          child: CustomPaint(
            size: const Size.square(120),
            painter: _HandPainter(circle: t.sky, fill: t.surface, stroke: t.primary),
          ),
        ),
        const SizedBox(height: 20),
        Text(
          it.text ?? '',
          textAlign: TextAlign.center,
          style: TextStyle(height: 2, color: t.muted),
        ),
        const SizedBox(height: 20),
        for (final (n, p) in content.handPhrases.indexed)
          Container(
            width: double.infinity,
            margin: const EdgeInsets.only(bottom: 16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: t.surface2, borderRadius: BorderRadius.circular(Radii.x2l)),
            child: Column(
              children: [
                Text(
                  p.text,
                  textAlign: TextAlign.center,
                  style: TextStyle(fontFamily: kNaskh, fontSize: n == 0 ? 24 : 20, height: 1.8),
                ),
                const SizedBox(height: 12),
                TapCounter(target: p.repeat),
              ],
            ),
          ),
        Text('المصدر: ${it.source}', style: TextStyle(fontSize: 12, color: t.muted)),
      ],
    );
  }
}

/// يد على دائرة سماوية — نفس رسم الويب (SVG بمربع 120).
class _HandPainter extends CustomPainter {
  _HandPainter({required this.circle, required this.fill, required this.stroke});
  final Color circle;
  final Color fill;
  final Color stroke;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 120);
    canvas.drawCircle(const Offset(60, 60), 56, Paint()..color = circle);
    const r = Radius.circular(6);
    final hand = Path()
      ..moveTo(44, 86)
      ..lineTo(44, 54)
      ..relativeArcToPoint(const Offset(12, 0), radius: r)
      ..relativeLineTo(0, -14)
      ..relativeArcToPoint(const Offset(12, 0), radius: r)
      ..relativeLineTo(0, 12)
      ..relativeArcToPoint(const Offset(12, 0), radius: r)
      ..relativeLineTo(0, 6)
      ..relativeArcToPoint(const Offset(12, 0), radius: r)
      ..relativeLineTo(0, 14)
      ..relativeCubicTo(0, 12, -8, 20, -22, 20)
      ..relativeLineTo(-6, 0)
      ..relativeCubicTo(-10, 0, -16, -4, -20, -6)
      ..close();
    canvas
      ..drawPath(hand, Paint()..color = fill)
      ..drawPath(
        hand,
        Paint()
          ..color = stroke
          ..style = PaintingStyle.stroke
          ..strokeWidth = 3
          ..strokeJoin = StrokeJoin.round,
      );
  }

  @override
  bool shouldRepaint(_HandPainter old) => old.circle != circle || old.fill != fill || old.stroke != stroke;
}

class _Finish extends ConsumerStatefulWidget {
  const _Finish({required this.before, required this.onRestart});
  final int? before;
  final VoidCallback onRestart;

  @override
  ConsumerState<_Finish> createState() => _FinishState();
}

class _FinishState extends ConsumerState<_Finish> {
  int? after;
  bool saved = false;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        Center(
          child: ExcludeSemantics(
            child: Container(
              width: 80,
              height: 80,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: t.sage, shape: BoxShape.circle),
              child: const Text('🌿', style: TextStyle(fontSize: 30)),
            ),
          ),
        ),
        const SizedBox(height: 16),
        Semantics(
          header: true,
          child: const Text(
            'تقبّل الله منك',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 30, fontWeight: FontWeight.w700),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'أتممت جلستك. الثبات على القليل خير من الكثير المنقطع — نلقاك غداً بإذن الله.',
          textAlign: TextAlign.center,
          style: TextStyle(height: 2, color: t.muted),
        ),
        if (widget.before != null && !saved) ...[
          CalmnessScale(label: 'وما مستوى هدوئك الآن؟', value: after, onChanged: (v) => setState(() => after = v)),
          if (after != null)
            Padding(
              padding: const EdgeInsets.only(top: 16),
              child: Align(
                alignment: AlignmentDirectional.centerStart,
                child: FilledButton(
                  onPressed: () {
                    ref.read(journalQueueProvider.notifier).add((
                      at: DateTime.now().toUtc().toIso8601String(),
                      kind: 'ruqyah',
                      before: widget.before!,
                      after: after!,
                    ));
                    setState(() => saved = true);
                  },
                  child: const Text('احفظ في مذكّرتي'),
                ),
              ),
            ),
        ],
        if (saved)
          Container(
            margin: const EdgeInsets.only(top: 24),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(color: t.successBg, borderRadius: BorderRadius.circular(Radii.xl)),
            // المذكّرة المشفّرة لم تُبنَ بعد في التطبيق، فهي «غير مفتوحة» دائماً — كحالة الويب حين تكون مقفلة
            child: Text(
              'سيُحفظ في مذكّرتك عند فتحها في هذه الجلسة.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 14, color: t.success),
            ),
          ),
        const SizedBox(height: 32),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 12,
          runSpacing: 12,
          children: [
            FilledButton(onPressed: () => context.go('/today'), child: const Text('العودة ليومي')),
            OutlinedButton(onPressed: widget.onRestart, child: const Text('جلسة جديدة')),
          ],
        ),
      ],
    );
  }
}
