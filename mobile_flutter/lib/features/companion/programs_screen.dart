import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../content/arabic.dart';
import '../../content/content_repository.dart';
import '../../content/models.dart';
import '../../theme/theme.dart';
import '../../ui/components.dart';
import 'companion_store.dart';

/*
  «برامج الالتزام» وصفحة البرنامج — نظير ProgramsPage وProgramDetailPage في
  frontend/src/features/companion/ProgramPages.tsx، قسماً بقسم وبالنصوص نفسها.
  عدد الأيام وسيلة للاستمرار لا وعدٌ بنتيجة (البند 4).
*/

class ProgramsScreen extends ConsumerWidget {
  const ProgramsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final content = ref.watch(contentProvider);
    final s = ref.watch(companionProvider);
    return SafeArea(
      bottom: false,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 120),
        children: [
          const PageHeader(
            title: 'برامج الالتزام',
            subtitle:
                'بدل أن تتوه بين عشرات السور والأدعية: اختر برنامجاً واضحاً بمهام يومية صغيرة. كل ما فيه مأثور بمصدره، وعدد الأيام وسيلة للاستمرار لا وعدٌ بنتيجة.',
          ),
          if (s.quiz == null)
            Padding(
              padding: const EdgeInsets.only(bottom: 24),
              child: DawnLink(
                title: 'لا تعرف من أين تبدأ؟',
                sub: 'اختبار وعي من ${arNum(content.quizQuestions.length)} أسئلة يقترح عليك البرنامج الأنسب — دقيقتان فقط.',
                cta: 'ابدأ الاختبار',
                onTap: () => context.go('/awareness/quiz'),
              ),
            ),
          for (final p in content.programs)
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: _ProgramCard(
                key: ValueKey('program-${p.id}'),
                program: p,
                active: p.id == s.activeProgramId,
                finished: s.finished.contains(p.id),
                ratio: programProgress(p, s.done).ratio,
              ),
            ),
        ],
      ),
    );
  }
}

class _ProgramCard extends StatelessWidget {
  const _ProgramCard({super.key, required this.program, required this.active, required this.finished, required this.ratio});
  final Program program;
  final bool active;
  final bool finished;
  final double ratio;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final p = program;
    return Material(
      color: t.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Radii.x2l),
        side: active ? BorderSide(color: t.primary, width: 2) : BorderSide(color: t.border),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(Radii.x2l),
        onTap: () => context.go('/programs/${p.id}'),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ProgramArt(program: p),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(p.title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                        if (active) const SanadBadge(label: 'برنامجك الحالي', tone: 'success'),
                        if (finished) SanadBadge(label: 'أتممته ✓', colors: (bg: t.sand, fg: t.lamp, border: Colors.transparent)),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      p.tagline,
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: tintColors(t, p.tint).ink),
                    ),
                    const SizedBox(height: 8),
                    Text(p.description, style: TextStyle(fontSize: 14, height: 2, color: t.muted)),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 12,
                      runSpacing: 4,
                      children: [
                        Text('⏱ نحو ${arNum(p.minutesPerDay)} دقيقة يومياً', style: TextStyle(fontSize: 12, color: t.muted)),
                        Text('· ${p.forWhom}', style: TextStyle(fontSize: 12, color: t.muted)),
                      ],
                    ),
                    if (active)
                      Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: ProgressBar(value: ratio, label: 'تقدّم ${p.title}'),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ProgramDetailScreen extends ConsumerStatefulWidget {
  const ProgramDetailScreen({super.key, required this.id});
  final String id;

  @override
  ConsumerState<ProgramDetailScreen> createState() => _ProgramDetailScreenState();
}

class _ProgramDetailScreenState extends ConsumerState<ProgramDetailScreen> {
  bool confirmSwitch = false;

  @override
  Widget build(BuildContext context) {
    final content = ref.watch(contentProvider);
    final s = ref.watch(companionProvider);
    final program = content.programById(widget.id);
    if (program == null) return const NotFound();
    final t = context.t;
    final tint = tintColors(t, program.tint);
    final active = s.activeProgramId == program.id;
    final today = active ? currentProgramDay(s.startedOn, program.days, ref.watch(todayProvider)) : 0;
    final prog = programProgress(program, s.done);
    final sampleDay = program.plan.first;

    return SafeArea(
      bottom: false,
      child: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              children: [
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: TextButton(
                    onPressed: () => context.go('/programs'),
                    style: TextButton.styleFrom(
                      foregroundColor: t.primary,
                      padding: EdgeInsets.zero,
                      textStyle: const TextStyle(fontFamily: kSans, fontWeight: FontWeight.w600, fontSize: 14),
                    ),
                    child: const Text('→ كل البرامج'),
                  ),
                ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: tint.bg,
                    borderRadius: BorderRadius.circular(Radii.x3l),
                    border: Border.all(color: t.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ProgramArt(program: program, size: 88),
                      const SizedBox(height: 20),
                      Semantics(
                        header: true,
                        child: Text(program.title, style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w700, height: 1.3)),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        program.tagline,
                        style: TextStyle(fontWeight: FontWeight.w600, color: tint.ink),
                      ),
                      const SizedBox(height: 12),
                      Text(program.description, style: TextStyle(height: 2, color: t.muted)),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                _Fact(label: 'المدة', value: '${arNum(program.days)} يوماً'),
                const SizedBox(height: 16),
                _Fact(label: 'يومياً', value: 'نحو ${arNum(program.minutesPerDay)} دقيقة'),
                const SizedBox(height: 16),
                _Fact(label: 'لمن؟', value: program.forWhom),
                const SizedBox(height: 24),
                SanadCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('خريطة الأيام', style: TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text(
                        'كل يوم يجمع وِرداً ثابتاً مع عادة جديدة. الأيام الفائتة تبقى مفتوحة — لا لوم، أكمل من حيث أنت.',
                        style: TextStyle(fontSize: 14, color: t.muted),
                      ),
                      const SizedBox(height: 16),
                      Semantics(
                        label: 'أيام البرنامج',
                        child: GridView.count(
                          crossAxisCount: 7,
                          mainAxisSpacing: 8,
                          crossAxisSpacing: 8,
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          children: [for (final d in program.plan) _DayCell(program: program, day: d, done: s.done, isToday: active && d.day == today)],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                SanadCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text('نموذج من اليوم الأول: ${sampleDay.title}', style: const TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 12),
                      for (final task in sampleDay.tasks)
                        Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          decoration: BoxDecoration(color: t.surface2, borderRadius: BorderRadius.circular(Radii.xl)),
                          child: Row(
                            children: [
                              Text(content.slotLabel[task.slot]!, style: TextStyle(fontSize: 12, color: t.muted)),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(content.item(task.itemId).title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          // شريط الإجراء ثابت أسفل الصفحة (sticky في الويب)
          Container(
            margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: t.surface.withValues(alpha: 0.95),
              borderRadius: BorderRadius.circular(Radii.x2l),
              border: Border.all(color: t.border),
              boxShadow: [BoxShadow(color: t.text.withValues(alpha: 0.1), blurRadius: 15, offset: const Offset(0, 10))],
            ),
            child: _actionBar(context, content, s, program, active, today, prog.ratio),
          ),
        ],
      ),
    );
  }

  Widget _actionBar(BuildContext context, ContentRepository content, CompanionState s, Program program, bool active, int today, double ratio) {
    final t = context.t;
    final note = TextStyle(fontSize: 14, color: t.muted);
    if (active) {
      return Row(
        children: [
          ProgressRing(
            value: ratio,
            child: Text('${arNum((ratio * 100).round())}٪', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: 12),
          Expanded(child: Text('أنت في اليوم ${arNum(today)} من ${arNum(program.days)}.', style: note)),
          const SizedBox(width: 12),
          FilledButton(onPressed: () => context.go('/today'), child: const Text('متابعة اليوم')),
        ],
      );
    }
    if (s.activeProgramId != null && !confirmSwitch) {
      return Wrap(
        spacing: 12,
        runSpacing: 12,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Text('لديك برنامج قائم: ${content.programById(s.activeProgramId)?.title ?? ''}. تقدّمك فيه محفوظ إن عدت إليه.', style: note),
          OutlinedButton(onPressed: () => setState(() => confirmSwitch = true), child: const Text('بدّل إلى هذا البرنامج')),
        ],
      );
    }
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Text('يُحفظ تقدّمك على جهازك فقط — بلا حساب ولا تسجيل.', style: note),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: () {
              ref.read(companionProvider.notifier).start(program.id);
              context.go('/today');
            },
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
              textStyle: const TextStyle(fontFamily: kSans, fontWeight: FontWeight.w600, fontSize: 16),
            ),
            child: const Text('ابدأ البرنامج اليوم'),
          ),
        ),
      ],
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({required this.program, required this.day, required this.done, required this.isToday});
  final Program program;
  final ProgramDay day;
  final Set<String> done;
  final bool isToday;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final r = dayProgress(program.id, day, done).ratio;
    final complete = r == 1;
    final cell = Container(
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: complete ? t.primary : null,
        borderRadius: BorderRadius.circular(Radii.xl),
        border: Border.all(color: complete ? Colors.transparent : (r > 0 ? t.primary : t.border)),
      ),
      child: Text(
        arNum(day.day),
        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: complete ? t.primaryContrast : (r > 0 ? t.primary : t.muted)),
      ),
    );
    return Tooltip(
      message: day.title,
      child: Semantics(
        label: 'اليوم ${day.day}: ${day.title}${complete ? ' — مكتمل' : ''}',
        excludeSemantics: true,
        // حلقة «اليوم» بلون المصباح مع فاصل بلون السطح (ring-offset في الويب)
        child: isToday
            ? Container(
                padding: const EdgeInsets.all(2),
                decoration: BoxDecoration(
                  color: t.surface,
                  borderRadius: BorderRadius.circular(Radii.xl + 2),
                  boxShadow: [BoxShadow(color: t.lamp, spreadRadius: 2)],
                ),
                child: cell,
              )
            : cell,
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
    decoration: BoxDecoration(
      color: context.t.surface,
      borderRadius: BorderRadius.circular(Radii.x2l),
      border: Border.all(color: context.t.border),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(fontSize: 12, color: context.t.muted)),
        const SizedBox(height: 2),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
      ],
    ),
  );
}

/// نظير NotFoundPage في الويب.
class NotFound extends StatelessWidget {
  const NotFound({super.key});

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('الصفحة غير موجودة', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          TextButton(onPressed: () => context.go('/today'), child: const Text('العودة للرئيسية')),
        ],
      ),
    ),
  );
}
