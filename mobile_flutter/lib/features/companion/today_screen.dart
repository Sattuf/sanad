import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../content/arabic.dart';
import '../../content/content_repository.dart';
import '../../content/models.dart';
import '../../theme/theme.dart';
import '../../ui/components.dart';
import 'companion_store.dart';

/*
  «يومي» — نظير TodayPage في frontend/src/features/companion/ProgramPages.tsx، قسماً بقسم وبالنصوص نفسها:
  الترحيب، بطاقة التقدّم الملوّنة بلون البرنامج، أيام البرنامج، المهام حسب الوقت، تهنئة الإتمام، والاختصارات.
*/

const _slotOrder = [Slot.anytime, Slot.morning, Slot.evening, Slot.night];
const _weekdays = ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
const _months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

({String title, String sub}) _greeting(int hour) {
  if (hour < 5) return (title: 'ليلة هادئة', sub: 'إن جافاك النوم، فالسكينة على بُعد لمسة.');
  if (hour < 12) return (title: 'صباح الخير', sub: 'ابدأ يومك محصّناً بأذكار الصباح.');
  if (hour < 17) return (title: 'طاب يومك', sub: 'دقائق قليلة تكفي لتبقى على وِردك.');
  if (hour < 21) return (title: 'مساء الخير', sub: 'أذكار المساء في انتظارك.');
  return (title: 'مساء السكينة', sub: 'اختم يومك بأذكار النوم.');
}

class TodayScreen extends ConsumerStatefulWidget {
  const TodayScreen({super.key});

  @override
  ConsumerState<TodayScreen> createState() => _TodayScreenState();
}

class _TodayScreenState extends ConsumerState<TodayScreen> {
  int? viewDay;
  String? openTask;

  @override
  Widget build(BuildContext context) {
    final content = ref.watch(contentProvider);
    final s = ref.watch(companionProvider);
    final program = content.programById(s.activeProgramId);
    final now = DateTime.now();
    final g = _greeting(now.hour);

    return SafeArea(
      bottom: false,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 120),
        children: [
          _Header(title: g.title, sub: g.sub, date: '${_weekdays[now.weekday - 1]}، ${arNum(now.day)} ${_months[now.month - 1]}'),
          const SizedBox(height: 24),
          if (program == null) const _EmptyToday() else ..._programDay(context, content, s, program),
          const SizedBox(height: 28),
          const _QuickActions(),
        ],
      ),
    );
  }

  List<Widget> _programDay(BuildContext context, ContentRepository content, CompanionState s, Program program) {
    final t = context.t;
    final tint = tintColors(t, program.tint);
    final today = currentProgramDay(s.startedOn, program.days, ref.watch(todayProvider));
    final dayNum = viewDay ?? today;
    final day = program.plan[dayNum - 1];
    final dp = dayProgress(program.id, day, s.done);
    final pp = programProgress(program, s.done);
    final notifier = ref.read(companionProvider.notifier);

    return [
      // بطاقة التقدّم بلون البرنامج
      Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(color: tint.bg, borderRadius: BorderRadius.circular(Radii.x3l), border: Border.all(color: t.border)),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(20),
              child: Row(
                children: [
                  ProgressRing(
                    value: dp.ratio,
                    size: 84,
                    stroke: 8,
                    color: tint.ring,
                    child: Text('${arNum(dp.completed)}/${arNum(dp.total)}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${program.title} · اليوم ${arNum(dayNum)} من ${arNum(program.days)}', style: TextStyle(fontSize: 13, color: t.muted)),
                        const SizedBox(height: 2),
                        Text(day.title, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, height: 1.4)),
                        const SizedBox(height: 10),
                        ProgressBar(value: pp.ratio, color: tint.ring, label: 'تقدّم البرنامج كاملاً'),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Column(
                    children: [
                      Text(arNum(s.activeDays.length), style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: tint.ink)),
                      Text('أيام التزام', style: TextStyle(fontSize: 11, color: t.muted)),
                    ],
                  ),
                ],
              ),
            ),
            // أيام البرنامج حتى اليوم
            Container(
              color: t.surface.withValues(alpha: 0.5),
              height: 46,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                children: [
                  for (final d in program.plan.take(today))
                    Padding(
                      padding: const EdgeInsetsDirectional.only(end: 4),
                      child: _DayChip(
                        label: d.day == today ? 'اليوم' : 'يوم ${arNum(d.day)}',
                        selected: d.day == dayNum,
                        complete: dayProgress(program.id, d, s.done).ratio == 1,
                        onTap: () => setState(() => viewDay = d.day == today ? null : d.day),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
      if (viewDay != null && viewDay != today)
        Padding(
          padding: const EdgeInsets.only(top: 16),
          child: _Note(color: t.sky, text: 'تعرض يوماً سابقاً — لا بأس بإكماله الآن، المهم أن تستمر.'),
        ),
      const SizedBox(height: 24),
      // المهام حسب الوقت
      for (final slot in _slotOrder)
        if (day.tasks.any((x) => x.slot == slot)) ...[
          Text(content.slotLabel[slot]!, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: t.muted)),
          const SizedBox(height: 8),
          for (final task in day.tasks.where((x) => x.slot == slot))
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _TaskTile(
                key: ValueKey('task-${task.id}'),
                item: content.item(task.itemId),
                content: content,
                checked: s.done.contains('${program.id}:$dayNum:${task.id}'),
                open: openTask == '$dayNum:${task.id}',
                link: task.to,
                onToggle: () {
                  final wasChecked = s.done.contains('${program.id}:$dayNum:${task.id}');
                  notifier.toggle(dayNum, task.id);
                  if (!wasChecked) HapticFeedback.selectionClick();
                },
                onOpen: () => setState(() => openTask = openTask == '$dayNum:${task.id}' ? null : '$dayNum:${task.id}'),
                onCounted: () {
                  if (!s.done.contains('${program.id}:$dayNum:${task.id}')) notifier.toggle(dayNum, task.id);
                },
              ),
            ),
          const SizedBox(height: 16),
        ],
      if (dp.ratio == 1 && pp.ratio < 1)
        _Note(
          color: t.successBg,
          ink: t.success,
          title: 'أتممت وِرد اليوم — تقبّل الله منك.',
          text: 'نلقاك غداً بإذن الله. سجّل حالتك في المذكّرة إن أحببت.',
        ),
      if (pp.ratio == 1)
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(gradient: t.dawn, borderRadius: BorderRadius.circular(Radii.x3l), border: Border.all(color: t.border)),
          child: Column(
            children: [
              Text('أتممت «${program.title}» 🌿', textAlign: TextAlign.center, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Text('صار الوِرد عادة. ماذا بعد؟ يمكنك الإبقاء عليه أو بدء برنامج آخر.', textAlign: TextAlign.center, style: TextStyle(color: t.muted)),
              const SizedBox(height: 16),
              FilledButton(onPressed: notifier.finish, child: const Text('اختر برنامجاً جديداً')),
            ],
          ),
        ),
    ];
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.title, required this.sub, required this.date});
  final String title;
  final String sub;
  final String date;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(date, style: TextStyle(fontSize: 13, color: context.t.muted)),
          const SizedBox(height: 4),
          Semantics(header: true, child: Text(title, style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w700, height: 1.3))),
          const SizedBox(height: 4),
          Text(sub, style: TextStyle(color: context.t.muted)),
        ],
      );
}

class _EmptyToday extends ConsumerWidget {
  const _EmptyToday();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.t;
    return Container(
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(gradient: t.dawn, borderRadius: BorderRadius.circular(Radii.x3l), border: Border.all(color: t.border)),
      child: Column(
        children: [
          const Text('ابدأ رحلتك بخطوة صغيرة', textAlign: TextAlign.center, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Text(
            'اختر برنامج التزام، وسيرتّب لك سند مهام يومية واضحة: ماذا تقرأ، ومتى، وكم مرة — مع مصدر كل ذكر.',
            textAlign: TextAlign.center,
            style: TextStyle(color: t.muted, height: 1.9),
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: () => ref.read(companionProvider.notifier).start('foundation-7'),
            style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14)),
            child: const Text('ابدأ بـ«أساس التحصين» (٧ أيام)'),
          ),
          const SizedBox(height: 10),
          OutlinedButton(onPressed: () => context.go('/programs'), child: const Text('كل البرامج')),
        ],
      ),
    );
  }
}

class _DayChip extends StatelessWidget {
  const _DayChip({required this.label, required this.selected, required this.complete, required this.onTap});
  final String label;
  final bool selected;
  final bool complete;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    return Material(
      color: selected ? t.primary : Colors.transparent,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: Text(
            '$label${complete && !selected ? ' ✓' : ''}',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: selected ? t.primaryContrast : (complete ? t.success : t.muted),
            ),
          ),
        ),
      ),
    );
  }
}

class _TaskTile extends StatelessWidget {
  const _TaskTile({
    super.key,
    required this.item,
    required this.content,
    required this.checked,
    required this.open,
    required this.onToggle,
    required this.onOpen,
    required this.onCounted,
    this.link,
  });

  final LibraryItem item;
  final ContentRepository content;
  final bool checked;
  final bool open;
  final String? link;
  final VoidCallback onToggle;
  final VoidCallback onOpen;
  final VoidCallback onCounted;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      decoration: BoxDecoration(
        color: checked ? t.surface2 : t.surface,
        borderRadius: BorderRadius.circular(Radii.x2l),
        border: Border.all(color: checked ? Colors.transparent : t.border),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Semantics(
                  checked: checked,
                  label: '${item.title}${checked ? ' — تم' : ''}',
                  child: InkResponse(
                    key: const ValueKey('check'),
                    onTap: onToggle,
                    radius: 24,
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: checked ? t.primary : Colors.transparent,
                        border: Border.all(color: checked ? t.primary : t.border, width: 2),
                      ),
                      child: checked ? Icon(Icons.check_rounded, size: 18, color: t.primaryContrast) : null,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.title,
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          color: checked ? t.muted : t.text,
                          decoration: checked ? TextDecoration.lineThrough : null,
                        ),
                      ),
                      if ((item.repeat ?? 0) > 1) Text('${arNum(item.repeat!)} مرات', style: TextStyle(fontSize: 12, color: t.muted)),
                    ],
                  ),
                ),
                TextButton(
                  onPressed: link != null ? () => context.push(link!) : onOpen,
                  style: TextButton.styleFrom(
                    backgroundColor: t.surface2,
                    foregroundColor: t.primary,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.xl)),
                    textStyle: const TextStyle(fontFamily: kSans, fontWeight: FontWeight.w600, fontSize: 14),
                  ),
                  child: Text(link != null ? 'افتح' : (open ? 'إخفاء' : 'اقرأ')),
                ),
              ],
            ),
          ),
          AnimatedSize(
            duration: MediaQuery.disableAnimationsOf(context) ? Duration.zero : const Duration(milliseconds: 250),
            curve: Curves.easeOut,
            child: open
                ? Container(
                    width: double.infinity,
                    decoration: BoxDecoration(border: Border(top: BorderSide(color: t.border))),
                    padding: const EdgeInsets.fromLTRB(16, 20, 16, 16),
                    child: ItemView(item: item, content: content, onCounted: onCounted),
                  )
                : const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note({required this.color, required this.text, this.title, this.ink});
  final Color color;
  final Color? ink;
  final String? title;
  final String text;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(Radii.x2l)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (title != null) Text(title!, style: TextStyle(fontWeight: FontWeight.w700, color: ink)),
            Text(text, style: TextStyle(fontSize: 14, color: ink ?? context.t.text)),
          ],
        ),
      );
}

class _QuickActions extends StatelessWidget {
  const _QuickActions();

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final actions = [
      (to: '/journal', title: 'كيف حالك اليوم؟', sub: 'سجّل حالتك في دقيقة', bg: t.sky),
      (to: '/self-ruqyah', title: 'ارقِ نفسك', sub: 'مرشد خطوة بخطوة', bg: t.sage),
      (to: '/awareness', title: 'هل هذا صحيح؟', sub: 'ميزان الوعي', bg: t.sand),
    ];
    return Column(
      children: [
        for (final a in actions)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Material(
              color: a.bg,
              borderRadius: BorderRadius.circular(Radii.x2l),
              child: InkWell(
                borderRadius: BorderRadius.circular(Radii.x2l),
                onTap: () => context.push(a.to),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(a.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                            Text(a.sub, style: TextStyle(fontSize: 14, color: t.muted)),
                          ],
                        ),
                      ),
                      Icon(Icons.chevron_right_rounded, color: t.muted),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
