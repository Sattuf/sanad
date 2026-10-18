import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../content/arabic.dart';
import '../../content/content_repository.dart' show localDay;
import '../../content/ruqyah.dart';
import '../../core/session.dart';
import '../../theme/theme.dart';
import '../../ui/components.dart';
import '../../ui/share_card.dart';
import '../companion/companion_store.dart';
import '../companion/programs_screen.dart' show NotFound;
import 'progress.dart';
import 'recitation.dart';
import 'ruqyah_reminders.dart';
import 'scene.dart';

/*
  «الرقية والتحصين» — نظير RuqyahPages.tsx قسماً بقسم وبالنصوص نفسها.
  المحتوى كله من ruqyah.json المولَّد (المجموعات والأدلة والآيات من المصحف المشترك).
*/

/// روابط الأدلة الموجودة في التطبيق؛ الدليل (/directory) في الأسابيع 7–9.
bool _routeInApp(String to) => to.startsWith('/ruqyah') || to == '/self-ruqyah' || to == '/sakina' || to == '/journal';

class _LampButton extends StatelessWidget {
  const _LampButton({required this.label, required this.onPressed});
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    return FilledButton(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: t.lampGlow,
        foregroundColor: t.sceneOnGold,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        textStyle: const TextStyle(fontFamily: kSans, fontWeight: FontWeight.w700, fontSize: 15),
      ),
      child: Text(label),
    );
  }
}

class _GlassButton extends StatelessWidget {
  const _GlassButton({required this.label, required this.onPressed});
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        backgroundColor: t.sceneText.withValues(alpha: 0.1),
        foregroundColor: t.sceneText,
        side: BorderSide(color: t.sceneText.withValues(alpha: 0.25)),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      ),
      child: Text(label),
    );
  }
}

Widget _sectionTitle(BuildContext context, String title, String sub) => Padding(
  padding: const EdgeInsets.only(bottom: 16),
  child: Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Semantics(
        header: true,
        child: Text(title, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
      ),
      const SizedBox(height: 4),
      Text(sub, style: TextStyle(color: context.t.muted)),
    ],
  ),
);

// ── الصفحة الرئيسية ─────────────────────────────────────────────────────────

class RuqyahHubScreen extends ConsumerWidget {
  const RuqyahHubScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.t;
    final r = ref.watch(contentProvider).ruqyah;
    final wird = r.suggestedWird(ref.watch(clockProvider)().hour);
    final myWird = ref.watch(myWirdProvider).value;
    final signedIn = ref.watch(signedInProvider);

    return SafeArea(
      bottom: false,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
        children: [
          Scene(
            theme: SceneTheme.lantern,
            radius: Radii.x3l,
            padding: const EdgeInsets.fromLTRB(24, 48, 24, 48),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'سند · الرقية والتحصين',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: t.lampGlow),
                ),
                const SizedBox(height: 12),
                Semantics(
                  header: true,
                  child: const Text('الرقية الشرعية والتحصين', style: TextStyle(fontSize: 32, fontWeight: FontWeight.w700, height: 1.25)),
                ),
                const SizedBox(height: 16),
                Text(
                  'آيات الرقية، وأدعية السنة الثابتة بتخريجها، وأذكار اليوم والليلة، ومنهج عملي للوقاية والرقية على النفس — مكتوبة بخط المصحف ومرتّبة لتقرأها بقلب حاضر.',
                  style: TextStyle(fontSize: 17, height: 1.85, color: t.sceneSoft),
                ),
                const SizedBox(height: 28),
                const _VerseCarousel(),
                const SizedBox(height: 28),
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    _LampButton(label: 'ابدأ ${wird.label}', onPressed: () => context.go('/ruqyah/${wird.id}')),
                    _GlassButton(label: 'كيف أرقي نفسي؟', onPressed: () => context.go('/ruqyah/guide/treatment')),
                  ],
                ),
              ],
            ),
          ),
          const _DueWirdNudge(),
          if (myWird != null) ...[const SizedBox(height: 24), _StreakCard(wird: myWird)],
          for (final g in r.groupOrder) ...[
            const SizedBox(height: 48),
            _sectionTitle(context, r.groups[g]!.title, r.groups[g]!.text),
            for (final c in r.collections.where((c) => c.group == g))
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: _CollectionCard(collection: c),
              ),
          ],
          const SizedBox(height: 40),
          const Ornament(),
          const SizedBox(height: 24),
          _sectionTitle(context, 'منهج الوقاية والعلاج الشرعي', 'خطوات عملية مدعومة بالدليل: كيف تتحصّن، وكيف ترقي نفسك، وما الذي تحذره.'),
          GuideGrid(guides: r.guidesOf('method'), action: 'اقرأ المنهج ←'),
          const SizedBox(height: 40),
          const Ornament(),
          const SizedBox(height: 24),
          _sectionTitle(context, 'توعية وتحذير', 'السحر وأنواعه والموقف الشرعي منه، وحكم اليوغا و«الطاقة» والممارسات المعاصرة — تعريف وتحذير بالدليل.'),
          GuideGrid(guides: r.guidesOf('awareness'), action: 'اقرأ ←'),
          const SizedBox(height: 40),
          const RuqyahReminderCard(),
          const SizedBox(height: 24),
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: t.surface,
              borderRadius: BorderRadius.circular(Radii.x3l),
              border: Border.all(color: t.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('استمع للرقية بأصوات القرّاء', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text('سور كاملة وآيات الرقية وأذكار حصن المسلم مسموعة من مصادر موثوقة، في المكتبة الصوتية.', style: TextStyle(color: t.muted)),
                const SizedBox(height: 16),
                FilledButton(onPressed: () => context.push(signedIn ? '/library' : '/login'), child: const Text('المكتبة الصوتية')),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// آيات قصيرة تتناوب كل ٧ ثوانٍ — إلا مع «تقليل الحركة».
class _VerseCarousel extends ConsumerStatefulWidget {
  const _VerseCarousel();

  @override
  ConsumerState<_VerseCarousel> createState() => _VerseCarouselState();
}

class _VerseCarouselState extends ConsumerState<_VerseCarousel> {
  int i = 0;
  Timer? _timer;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _timer?.cancel();
    if (!MediaQuery.disableAnimationsOf(context)) {
      final n = ref.read(contentProvider).ruqyah.heroVerses.length;
      _timer = Timer.periodic(const Duration(seconds: 7), (_) => setState(() => i = (i + 1) % n));
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final content = ref.watch(contentProvider);
    final verses = content.ruqyah.heroVerses;
    final v = verses[i];
    final p = content.quran[v.ref]!;
    return Semantics(
      liveRegion: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 112),
            child: AnimatedSwitcher(
              duration: MediaQuery.disableAnimationsOf(context) ? Duration.zero : const Duration(milliseconds: 800),
              child: Column(
                key: ValueKey(i),
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '﴿${p.ayat[v.index]}﴾',
                    style: TextStyle(fontFamily: kQuran, fontFamilyFallback: kQuranFallback, fontSize: 24, height: 2.3, color: t.sceneVerse),
                  ),
                  const SizedBox(height: 4),
                  Text('[${p.surahName}: ${arNum(p.from + v.index)}]', style: TextStyle(fontSize: 14, color: t.lampGlow)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              for (var k = 0; k < verses.length; k++)
                Semantics(
                  label: 'الآية ${arNum(k + 1)}',
                  selected: k == i,
                  button: true,
                  child: GestureDetector(
                    key: ValueKey('verse-dot-$k'),
                    behavior: HitTestBehavior.opaque,
                    onTap: () => setState(() => i = k),
                    // مساحة لمس ٢٤ بكسل حول نقطة ارتفاعها ٦
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 9),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 500),
                        margin: const EdgeInsetsDirectional.only(end: 6),
                        width: k == i ? 32 : 12,
                        height: 6,
                        decoration: BoxDecoration(
                          color: k == i ? t.lampGlow : t.sceneText.withValues(alpha: 0.3),
                          borderRadius: BorderRadius.circular(Radii.full),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DueWirdNudge extends ConsumerStatefulWidget {
  const _DueWirdNudge();

  @override
  ConsumerState<_DueWirdNudge> createState() => _DueWirdNudgeState();
}

class _DueWirdNudgeState extends ConsumerState<_DueWirdNudge> {
  bool hidden = false;

  @override
  Widget build(BuildContext context) {
    final due = ref.watch(dueWirdProvider);
    if (due == null || hidden) return const SizedBox.shrink();
    final t = context.t;
    return Container(
      margin: const EdgeInsets.only(top: 24),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(Radii.x2l),
        border: Border.all(color: t.lamp.withValues(alpha: 0.4)),
      ),
      child: Semantics(
        liveRegion: true,
        child: Wrap(
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 12,
          runSpacing: 8,
          children: [
            Text('حان وقت ${due.label} — لم تُتمّها اليوم بعد.', style: const TextStyle(fontWeight: FontWeight.w600)),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                FilledButton(onPressed: () => context.go('/ruqyah/${due.collection}'), child: const Text('ابدأ الآن')),
                TextButton(
                  onPressed: () => setState(() => hidden = true),
                  child: Text('لاحقاً', style: TextStyle(color: t.muted)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// المداومة: أيام متتالية أُتمّ فيها ورد واحد على الأقل، وآخر ٣٠ يوماً كنقاط.
class _StreakCard extends ConsumerWidget {
  const _StreakCard({required this.wird});
  final MyWird wird;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.t;
    final done = wird.completedDays.toSet();
    final today = ref.watch(clockProvider)();
    final days = [for (var k = 29; k >= 0; k--) localDay(today.subtract(Duration(days: k)))];
    final n = wird.streak;
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(Radii.x3l),
        border: Border.all(color: t.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('مداومتك على الورد', style: TextStyle(fontSize: 14, color: t.muted)),
          const SizedBox(height: 4),
          if (n > 0)
            Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: arNum(n),
                    style: TextStyle(color: t.lamp),
                  ),
                  TextSpan(
                    text:
                        ' ${n == 1
                            ? 'يوم'
                            : n == 2
                            ? 'يومان'
                            : n <= 10
                            ? 'أيام'
                            : 'يوماً'}',
                  ),
                ],
              ),
              style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w700),
            )
          else
            const Text('ابدأ مداومتك اليوم بإتمام ورد واحد', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
          const SizedBox(height: 16),
          Semantics(
            label: 'آخر ٣٠ يوماً',
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final d in days)
                  Semantics(
                    label: '$d${done.contains(d) ? ' — مكتمل' : ''}',
                    excludeSemantics: true,
                    child: Container(
                      width: 14,
                      height: 14,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: done.contains(d) ? t.lampGlow : t.surface2,
                        border: done.contains(d) ? null : Border.all(color: t.border),
                        boxShadow: done.contains(d) ? [BoxShadow(color: t.lampGlow, blurRadius: 8)] : null,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text('«أحبّ الأعمال إلى الله أدومها وإن قلّ»', style: TextStyle(fontSize: 14, color: t.muted)),
        ],
      ),
    );
  }
}

class _CollectionCard extends StatelessWidget {
  const _CollectionCard({required this.collection});
  final Collection collection;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final c = collection;
    final n = c.items.length;
    return Semantics(
      button: true,
      child: GestureDetector(
        onTap: () => context.go('/ruqyah/${c.id}'),
        child: Scene(
          theme: c.theme,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 168),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Align(
                  alignment: AlignmentDirectional.centerEnd,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                    decoration: BoxDecoration(color: t.sceneNightB.withValues(alpha: 0.3), borderRadius: BorderRadius.circular(Radii.full)),
                    child: Text('${arNum(n)} ${n > 10 ? 'مقطعاً' : 'مقاطع'}', style: TextStyle(fontSize: 12, color: t.sceneSoft)),
                  ),
                ),
                const SizedBox(height: 48),
                Text(c.title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(c.subtitle, style: TextStyle(fontSize: 14, color: t.sceneMuted)),
                const SizedBox(height: 12),
                Text(
                  'اقرأ الآن ←',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: t.lampGlow),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class GuideGrid extends StatelessWidget {
  const GuideGrid({super.key, required this.guides, required this.action});
  final List<Guide> guides;
  final String action;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    return Column(
      children: [
        for (final g in guides)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Semantics(
              button: true,
              child: GestureDetector(
                onTap: () => context.push(g.path),
                child: Scene(
                  theme: g.theme,
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: 136),
                    child: Align(
                      alignment: AlignmentDirectional.bottomStart,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(g.title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                          const SizedBox(height: 4),
                          Text(g.subtitle, style: TextStyle(fontSize: 14, color: t.sceneMuted)),
                          const SizedBox(height: 12),
                          Text(
                            action,
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: t.lampGlow),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

// ── قارئ المجموعة ───────────────────────────────────────────────────────────

const _fontKey = 'sanad.ruqyah.fontScale';
const _fontScales = [0.9, 1.0, 1.15, 1.3, 1.5];

class CollectionScreen extends ConsumerStatefulWidget {
  const CollectionScreen({super.key, required this.collectionId});
  final String collectionId;

  @override
  ConsumerState<CollectionScreen> createState() => _CollectionScreenState();
}

class _CollectionScreenState extends ConsumerState<CollectionScreen> {
  late double scale = () {
    final v = ref.read(prefsProvider).getDouble(_fontKey);
    return _fontScales.contains(v) ? v! : 1.0;
  }();
  bool showSources = true;
  late final RecitationController _recitation;

  @override
  void initState() {
    super.initState();
    _recitation = ref.read(recitationProvider.notifier);
  }

  @override
  void dispose() {
    // لا تستمر التلاوة بعد مغادرة المجموعة (فهارس الطابور تخصّها وحدها)
    _recitation.leave();
    super.dispose();
  }

  void _changeScale(int dir) {
    final k = (_fontScales.indexOf(scale) + dir).clamp(0, _fontScales.length - 1);
    setState(() => scale = _fontScales[k]);
    ref.read(prefsProvider).setDouble(_fontKey, scale);
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final r = ref.watch(contentProvider).ruqyah;
    final c = r.collection(widget.collectionId);
    if (c == null) return const NotFound();
    final entries = ref.watch(entriesProvider(c.id));
    final counts = ref.watch(dailyProgressProvider(c.id));
    final progress = ref.read(dailyProgressProvider(c.id).notifier);
    final done = countCompleted(entries, counts);
    final pct = entries.isEmpty ? 0.0 : done / entries.length;
    final synced = ref.watch(signedInProvider);
    final next = r.collections[(r.collections.indexOf(c) + 1) % r.collections.length];
    final queue = [
      for (final (i, e) in entries.indexed)
        if (e.item.isQuran) (itemIndex: i, ref: e.item.ref!),
    ];

    return SafeArea(
      bottom: false,
      child: CustomScrollView(
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            sliver: SliverToBoxAdapter(
              child: Scene(
                theme: c.theme,
                radius: Radii.x3l,
                padding: const EdgeInsets.fromLTRB(24, 40, 24, 40),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Semantics(
                      label: 'مسار التنقل',
                      child: Wrap(
                        children: [
                          GestureDetector(
                            onTap: () => context.go('/ruqyah'),
                            child: Text(
                              'الرقية والتحصين',
                              style: TextStyle(fontSize: 14, color: t.sceneMuted, decoration: TextDecoration.underline),
                            ),
                          ),
                          Text(' / ${r.groups[c.group]!.title}', style: TextStyle(fontSize: 14, color: t.sceneMuted)),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    Semantics(
                      header: true,
                      child: Text(c.title, style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w700, height: 1.3)),
                    ),
                    const SizedBox(height: 12),
                    Text(c.intro, style: TextStyle(height: 2, color: t.sceneSoft)),
                    const SizedBox(height: 24),
                    Row(
                      children: [
                        Expanded(
                          child: Text('ورد اليوم${synced ? ' · محفوظ في حسابك' : ''}', style: TextStyle(fontSize: 12, color: t.sceneMuted)),
                        ),
                        Text('${arNum(done)} / ${arNum(entries.length)}', style: TextStyle(fontSize: 12, color: t.sceneMuted)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Semantics(
                      label: 'التقدّم',
                      value: '${(pct * 100).round()}٪',
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(Radii.full),
                        child: LinearProgressIndicator(value: pct, minHeight: 6, color: t.lampGlow, backgroundColor: t.sceneText.withValues(alpha: 0.15)),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          SliverPersistentHeader(
            pinned: true,
            delegate: _ToolbarDelegate(
              child: Container(
                color: t.bg.withValues(alpha: 0.95),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      // التلاوة أولاً: على شاشة الجوال يظهر الشريط بعرضها، والباقي بالتمرير
                      if (queue.isNotEmpty) ...[_RecitationControls(queue: queue), const SizedBox(width: 8)],
                      _FontButtons(onSmaller: () => _changeScale(-1), onLarger: () => _changeScale(1)),
                      const SizedBox(width: 8),
                      _ToggleChip(label: 'التخريج والفوائد', selected: showSources, onTap: () => setState(() => showSources = !showSources)),
                      if (done > 0) ...[
                        const SizedBox(width: 8),
                        TextButton(
                          onPressed: progress.reset,
                          child: Text('إعادة الورد', style: TextStyle(color: t.muted)),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
            sliver: SliverList.list(
              children: [
                for (final (i, e) in entries.indexed)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 20),
                    child: _ItemCard(
                      key: ValueKey(e.key),
                      index: i,
                      item: e.item,
                      n: i + 1,
                      scale: scale,
                      showSources: showSources,
                      count: counts[e.key] ?? 0,
                      onCount: () => progress.bump(e),
                    ),
                  ),
                if (pct == 1)
                  Container(
                    margin: const EdgeInsets.only(top: 12),
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: t.surface,
                      borderRadius: BorderRadius.circular(Radii.x2l),
                      border: Border.all(color: t.lamp.withValues(alpha: 0.4)),
                    ),
                    child: Column(
                      children: [
                        const Ornament(),
                        const SizedBox(height: 12),
                        Text(
                          'أتممت ${c.title} — تقبّل الله منك',
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '«أحبّ الأعمال إلى الله أدومها وإن قلّ» — رواه البخاري (6464) ومسلم (783)',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: t.muted),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 20),
                Semantics(
                  button: true,
                  child: GestureDetector(
                    onTap: () => context.go('/ruqyah/${next.id}'),
                    child: Scene(
                      theme: next.theme,
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('التالي', style: TextStyle(fontSize: 12, color: t.sceneMuted)),
                                Text(next.title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                              ],
                            ),
                          ),
                          Text('←', style: TextStyle(fontSize: 24, color: t.lampGlow)),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ToolbarDelegate extends SliverPersistentHeaderDelegate {
  _ToolbarDelegate({required this.child});
  final Widget child;

  @override
  double get minExtent => 60;
  @override
  double get maxExtent => 60;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) => DecoratedBox(
    decoration: BoxDecoration(
      border: Border(bottom: BorderSide(color: context.t.border)),
    ),
    child: child,
  );

  @override
  bool shouldRebuild(_ToolbarDelegate old) => old.child != child;
}

class _FontButtons extends StatelessWidget {
  const _FontButtons({required this.onSmaller, required this.onLarger});
  final VoidCallback onSmaller;
  final VoidCallback onLarger;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    Widget b(String label, String semantics, double size, VoidCallback onTap) => Semantics(
      label: semantics,
      button: true,
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          child: Text(
            label,
            style: TextStyle(fontSize: size, fontWeight: FontWeight.w700),
          ),
        ),
      ),
    );
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(Radii.xl),
        border: Border.all(color: t.border),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [b('أ−', 'تصغير الخط', 14, onSmaller), b('أ+', 'تكبير الخط', 18, onLarger)]),
    );
  }
}

class _ToggleChip extends StatelessWidget {
  const _ToggleChip({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    return Semantics(
      toggled: selected,
      child: OutlinedButton(
        onPressed: onTap,
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(44, 36),
          foregroundColor: selected ? t.primary : t.muted,
          side: BorderSide(color: selected ? t.primary : t.border),
          padding: const EdgeInsets.symmetric(horizontal: 12),
          textStyle: const TextStyle(fontFamily: kSans, fontSize: 14, fontWeight: FontWeight.w600),
        ),
        child: Text(label),
      ),
    );
  }
}

/// اختيار القارئ وتشغيل آيات المجموعة كلها متتابعة.
class _RecitationControls extends ConsumerWidget {
  const _RecitationControls({required this.queue});
  final List<QueueEntry> queue;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.t;
    final s = ref.watch(recitationProvider);
    final c = ref.read(recitationProvider.notifier);
    final reciters = ref.watch(contentProvider).ruqyah.reciters;
    // الرمز أيقونة لا حرفاً: أندرويد يرسم ▶ رمزاً تعبيرياً ملوّناً
    final (Widget icon, String label) = switch (s.status) {
      RecitationStatus.playing || RecitationStatus.loading => (const PlayIcon(playing: true, size: 18), 'إيقاف مؤقت'),
      RecitationStatus.paused => (const PlayIcon(playing: false, size: 18), 'متابعة'),
      RecitationStatus.error => (const Icon(Icons.refresh_rounded, size: 18), 'أعد المحاولة'),
      RecitationStatus.idle => (const PlayIcon(playing: false, size: 18), 'استمع للآيات'),
    };
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(Radii.xl),
        border: Border.all(color: t.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          FilledButton(
            key: const ValueKey('recite-all'),
            onPressed: () => s.active ? c.toggle() : c.play(queue),
            style: FilledButton.styleFrom(
              minimumSize: const Size(44, 32),
              padding: const EdgeInsets.symmetric(horizontal: 12),
              textStyle: const TextStyle(fontFamily: kSans, fontSize: 14, fontWeight: FontWeight.w600),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [icon, const SizedBox(width: 6), Text(label)]),
          ),
          if (s.active)
            IconButton(
              onPressed: c.stop,
              tooltip: 'إنهاء التلاوة',
              icon: Icon(Icons.stop_rounded, color: t.muted),
              visualDensity: VisualDensity.compact,
            ),
          Semantics(
            label: 'القارئ',
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: s.reciter,
                padding: const EdgeInsets.symmetric(horizontal: 8),
                style: TextStyle(fontFamily: kSans, fontSize: 14, color: t.muted),
                items: [for (final r in reciters) DropdownMenuItem(value: r.id, child: Text(r.name))],
                onChanged: (id) => id == null ? null : c.setReciter(id),
              ),
            ),
          ),
          if (s.status == RecitationStatus.loading)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Text('يُحمَّل…', style: TextStyle(fontSize: 12, color: t.muted)),
            ),
          if (s.status == RecitationStatus.error)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Text('تعذّر التشغيل', style: TextStyle(fontSize: 12, color: t.warning)),
            ),
        ],
      ),
    );
  }
}

class _ItemCard extends ConsumerStatefulWidget {
  const _ItemCard({
    super.key,
    required this.index,
    required this.item,
    required this.n,
    required this.scale,
    required this.showSources,
    required this.count,
    required this.onCount,
  });
  final int index;
  final RuqyahItem item;
  final int n;
  final double scale;
  final bool showSources;
  final int count;
  final VoidCallback onCount;

  @override
  ConsumerState<_ItemCard> createState() => _ItemCardState();
}

class _ItemCardState extends ConsumerState<_ItemCard> {
  bool copied = false;
  Timer? _copiedTimer;

  @override
  void dispose() {
    _copiedTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final content = ref.watch(contentProvider);
    final item = widget.item;
    final passage = item.isQuran ? content.quran[item.ref]! : null;
    final activeAyah = ref.watch(recitationProvider).activeAyah(widget.index);
    final complete = widget.count >= item.target;
    final plain = passage != null ? passage.ayat.join(' ') : (item.text ?? '');
    final actionStyle = TextButton.styleFrom(
      minimumSize: const Size(40, 32),
      padding: const EdgeInsets.symmetric(horizontal: 8),
      textStyle: const TextStyle(fontFamily: kSans, fontSize: 12, fontWeight: FontWeight.w600),
    );

    return AnimatedContainer(
      duration: const Duration(milliseconds: 500),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(Radii.x2l),
        border: Border.all(color: complete ? t.lamp.withValues(alpha: 0.5) : t.border),
        boxShadow: complete ? [BoxShadow(color: t.lampGlow.withValues(alpha: 0.35), blurRadius: 40, offset: const Offset(0, 12), spreadRadius: -20)] : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 36,
                height: 36,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: t.lamp.withValues(alpha: 0.4)),
                ),
                child: Text(
                  arNum(widget.n),
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: t.lamp),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                    if (passage != null)
                      Text(
                        'سورة ${passage.surahName} · ${passage.from == passage.to ? 'الآية\u00A0${arNum(passage.from)}' : 'الآيات\u00A0${arNum(passage.from)}\u2060–\u2060${arNum(passage.to)}'}',
                        style: TextStyle(fontSize: 12, color: t.muted),
                      ),
                  ],
                ),
              ),
              if (passage != null)
                Semantics(
                  label: activeAyah != null ? 'إيقاف التلاوة مؤقتاً' : 'استمع إلى ${item.title}',
                  excludeSemantics: true,
                  child: TextButton(
                    onPressed: () {
                      final c = ref.read(recitationProvider.notifier);
                      activeAyah == null ? c.play([(itemIndex: widget.index, ref: item.ref!)]) : c.toggle();
                    },
                    style: actionStyle.copyWith(foregroundColor: WidgetStatePropertyAll(activeAyah != null ? t.lamp : t.primary)),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [PlayIcon(playing: activeAyah != null, size: 16), const SizedBox(width: 4), Text(activeAyah != null ? 'إيقاف' : 'استمع')],
                    ),
                  ),
                ),
              Semantics(
                label: 'مشاركة كصورة',
                excludeSemantics: true,
                child: TextButton(
                  onPressed: () => showDialog<void>(
                    context: context,
                    builder: (_) => ShareCardDialog(
                      content: passage != null
                          ? (
                              kicker: item.title,
                              body: passage.ayat.join(' ۝ '),
                              source: '[${passage.surahName}: ${arNum(passage.from)}${passage.to > passage.from ? '–${arNum(passage.to)}' : ''}]',
                              quran: true,
                            )
                          : (kicker: item.title, body: item.text ?? '', source: item.source, quran: false),
                    ),
                  ),
                  style: actionStyle.copyWith(foregroundColor: WidgetStatePropertyAll(t.muted)),
                  child: const Text('صورة'),
                ),
              ),
              Semantics(
                label: 'نسخ النص',
                excludeSemantics: true,
                child: TextButton(
                  onPressed: () {
                    Clipboard.setData(
                      ClipboardData(
                        text: passage != null ? '$plain\n[${passage.surahName}: ${passage.from}${passage.to > passage.from ? '–${passage.to}' : ''}]' : plain,
                      ),
                    );
                    setState(() => copied = true);
                    _copiedTimer?.cancel();
                    _copiedTimer = Timer(const Duration(milliseconds: 1800), () => mounted ? setState(() => copied = false) : null);
                  },
                  style: actionStyle.copyWith(foregroundColor: WidgetStatePropertyAll(t.muted)),
                  child: Text(copied ? 'نُسخ ✓' : 'نسخ'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          if (passage != null)
            Text.rich(
              TextSpan(
                children: [
                  for (final (k, a) in passage.ayat.indexed)
                    TextSpan(
                      style: activeAyah == k ? TextStyle(backgroundColor: t.lampGlow.withValues(alpha: 0.22)) : null,
                      children: [
                        TextSpan(text: '$a '),
                        TextSpan(
                          text: '﴿${arNum(passage.from + k)}﴾ ',
                          style: TextStyle(color: t.lamp),
                        ),
                      ],
                    ),
                ],
              ),
              style: TextStyle(fontFamily: kQuran, fontFamilyFallback: kQuranFallback, fontSize: 22.4 * widget.scale, height: 2.3, color: t.text),
            )
          else
            Text(
              item.text ?? '',
              style: TextStyle(fontFamily: kNaskh, fontSize: 20.8 * widget.scale, height: 2.1, color: t.text),
            ),
          AnimatedSize(
            duration: const Duration(milliseconds: 300),
            alignment: Alignment.topCenter,
            child: widget.showSources && (!item.isQuran || item.note != null)
                ? Container(
                    width: double.infinity,
                    margin: const EdgeInsets.only(top: 16),
                    padding: const EdgeInsets.only(top: 12),
                    decoration: BoxDecoration(
                      border: Border(top: BorderSide(color: t.border)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (!item.isQuran && item.source != null)
                          Text(
                            item.source!,
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: t.primary),
                          ),
                        if (item.note != null) Text(item.note!, style: TextStyle(fontSize: 14, height: 1.85, color: t.muted)),
                      ],
                    ),
                  )
                : const SizedBox(width: double.infinity),
          ),
          const SizedBox(height: 20),
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: _Counter(count: widget.count, repeat: item.target, onCount: widget.onCount),
          ),
        ],
      ),
    );
  }
}

/// عدّاد الذكر: حلقة تمتلئ مع كل نقرة، واهتزاز خفيف، وتوهّج عند الإتمام.
class _Counter extends StatelessWidget {
  const _Counter({required this.count, required this.repeat, required this.onCount});
  final int count;
  final int repeat;
  final VoidCallback onCount;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final complete = count >= repeat;
    final label = complete ? 'تمّ' : (repeat > 1 ? '${arNum(repeat)} ${repeat > 10 ? 'مرة' : 'مرات'} — اضغط مع كل مرة' : 'قرأتُها');
    return Semantics(
      button: true,
      label: complete ? 'تمّ' : (repeat > 1 ? 'عدّ: $count من $repeat' : 'تمّت القراءة'),
      excludeSemantics: true,
      child: InkWell(
        key: const ValueKey('counter'),
        customBorder: const StadiumBorder(),
        onTap: complete
            ? null
            : () {
                onCount();
                count + 1 >= repeat ? HapticFeedback.mediumImpact() : HapticFeedback.selectionClick();
              },
        child: Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(4, 4, 16, 4),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              ProgressRing(
                value: count / repeat,
                size: 56,
                stroke: 3,
                color: t.lampGlow,
                child: Text(
                  complete ? '✓' : (repeat > 1 ? arNum(repeat - count) : '•'),
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: complete ? t.lamp : t.text),
                ),
              ),
              const SizedBox(width: 12),
              Flexible(
                child: Text(
                  label,
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: complete ? t.lamp : t.muted),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── صفحة الدليل ─────────────────────────────────────────────────────────────

class GuideScreen extends ConsumerWidget {
  const GuideScreen({super.key, required this.guideId});
  final String guideId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.t;
    final r = ref.watch(contentProvider).ruqyah;
    final g = r.guide(guideId);
    if (g == null) return const Scaffold(body: NotFound());
    final meta = switch (g.kind) {
      'awareness' => (root: '/ruqyah', label: 'الرقية والتحصين', crumb: 'توعية وتحذير', tag: 'توعية'),
      _ => (root: '/ruqyah', label: 'الرقية والتحصين', crumb: 'المنهج', tag: 'منهج'),
    };
    final related = r.guidesOf(g.kind).where((x) => x.id != g.id).toList();

    return Scaffold(
      appBar: AppBar(),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
        children: [
          Scene(
            theme: g.theme,
            radius: Radii.x3l,
            padding: const EdgeInsets.fromLTRB(24, 40, 24, 40),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(
                  label: 'مسار التنقل',
                  child: Wrap(
                    children: [
                      GestureDetector(
                        onTap: () => context.go(meta.root),
                        child: Text(
                          meta.label,
                          style: TextStyle(fontSize: 14, color: t.sceneMuted, decoration: TextDecoration.underline),
                        ),
                      ),
                      Text(' / ${meta.crumb}', style: TextStyle(fontSize: 14, color: t.sceneMuted)),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Semantics(
                  header: true,
                  child: Text(g.title, style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w700, height: 1.3)),
                ),
                const SizedBox(height: 12),
                Text(g.intro, style: TextStyle(height: 2, color: t.sceneSoft)),
              ],
            ),
          ),
          const SizedBox(height: 32),
          for (final (si, s) in g.sections.indexed)
            Padding(
              padding: const EdgeInsets.only(bottom: 24),
              child: SanadCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 32,
                          height: 32,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(color: t.primary, borderRadius: BorderRadius.circular(8)),
                          child: Text(arNum(si + 1), style: TextStyle(fontSize: 14, color: t.primaryContrast)),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(s.heading, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    for (final p in s.points)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Padding(
                              padding: const EdgeInsets.only(top: 12),
                              child: Transform.rotate(angle: 0.785398, child: Container(width: 8, height: 8, color: t.lamp)),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(p.text, style: const TextStyle(height: 2)),
                                  if (p.evidence != null)
                                    Container(
                                      margin: const EdgeInsets.only(top: 4),
                                      padding: const EdgeInsetsDirectional.only(start: 12),
                                      decoration: BoxDecoration(
                                        border: BorderDirectional(start: BorderSide(color: t.lamp.withValues(alpha: 0.5), width: 2)),
                                      ),
                                      child: Text(
                                        p.evidence!,
                                        style: TextStyle(fontFamily: kNaskh, fontSize: 16.8, height: 2, color: t.muted),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    if (s.cta != null && _routeInApp(s.cta!.to))
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: FilledButton(onPressed: () => context.push(s.cta!.to), child: Text(s.cta!.label)),
                      ),
                  ],
                ),
              ),
            ),
          for (final x in related)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Semantics(
                button: true,
                child: GestureDetector(
                  onTap: () => context.pushReplacement(x.path),
                  child: Scene(
                    theme: x.theme,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(meta.tag, style: TextStyle(fontSize: 12, color: t.sceneMuted)),
                        Text(x.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
