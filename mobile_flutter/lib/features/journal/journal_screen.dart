import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../content/arabic.dart';
import '../../content/journal.dart';
import '../../core/platform_services.dart';
import '../../core/vault.dart';
import '../../theme/theme.dart';
import '../../theme/tokens.g.dart';
import '../../ui/components.dart';
import '../../ui/emergency.dart';
import '../companion/companion_store.dart';
import 'journal_store.dart';

/*
  «مذكّرتي» — نظير JournalPage في frontend/src/features/companion/JournalPage.tsx، بالنصوص نفسها.
  مشفّرة على الجهاز ولا تصل لأي خادم. الشاشة محمية من اللقطات (أندرويد) ومغطّاة عند ترك التطبيق (iOS).
  نعرض الاتجاه والتزامن مع أيام الالتزام بلغة محايدة؛ لا «تحسّنت بسبب الرقية» ولا تشخيص.
*/

const _weekdays = ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];

/// «الأربعاء ١٤» — كـ shortDayLabel في الويب.
String shortDayLabel(String day) {
  final p = day.split('-').map(int.parse).toList();
  final d = DateTime(p[0], p[1], p[2]);
  return '${_weekdays[d.weekday - 1]} ${arNum(d.day)}';
}

String _one(double x) => arNum(x.toStringAsFixed(1));

class JournalScreen extends ConsumerStatefulWidget {
  const JournalScreen({super.key});

  @override
  ConsumerState<JournalScreen> createState() => _JournalScreenState();
}

class _JournalScreenState extends ConsumerState<JournalScreen> with WidgetsBindingObserver {
  late final _privacy = ref.read(privacyPlatformProvider);
  bool covered = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _privacy.setSecure(true);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _privacy.setSecure(false);
    super.dispose();
  }

  // iOS لا يمنع اللقطات، فنغطّي المذكّرة قبل أن يلتقط النظام صورة المهام الأخيرة
  @override
  void didChangeAppLifecycleState(AppLifecycleState s) => setState(() => covered = s != AppLifecycleState.resumed);

  @override
  Widget build(BuildContext context) {
    final j = ref.watch(journalProvider);
    final notifier = ref.read(journalProvider.notifier);
    final t = context.t;
    return Scaffold(
      appBar: AppBar(
        actions: [
          if (j.unlocked)
            Padding(
              padding: const EdgeInsetsDirectional.only(end: 8),
              child: OutlinedButton(onPressed: notifier.lock, child: const Text('🔒 قفل')),
            ),
        ],
      ),
      body: Stack(
        children: [
          Listener(
            onPointerDown: (_) => notifier.touch(),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
              children: [
                const PageHeader(
                  title: 'مذكّرتي',
                  subtitle: 'دقيقة كل يوم تسجّل فيها حالتك. بعد أسبوعين ترى بعينك كيف تتغيّر أيامك مع التزامك. مشفّرة على جهازك فقط — لا نراها نحن ولا أحد غيرك.',
                ),
                if (j.unlocked) _JournalBody(data: j.data!) else const _LockScreen(),
              ],
            ),
          ),
          if (covered) Positioned.fill(child: ColoredBox(color: t.bg)),
        ],
      ),
    );
  }
}

class _LockScreen extends ConsumerStatefulWidget {
  const _LockScreen();

  @override
  ConsumerState<_LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends ConsumerState<_LockScreen> {
  final _pin = TextEditingController();
  final _confirm = TextEditingController();
  String? error;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    // كالويب: إن فُعّلت البصمة تُطلب فور فتح المذكّرة
    if (ref.read(journalProvider).hasBio) WidgetsBinding.instance.addPostFrameCallback((_) => _run(ref.read(journalProvider.notifier).unlockBio));
  }

  @override
  void dispose() {
    _pin.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() fn) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await fn();
    } on WrongPinError {
      if (mounted) setState(() => error = 'الرمز غير صحيح.');
    } catch (e) {
      if (mounted) setState(() => error = e is StateError ? e.message : 'تعذّر الفتح.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void _submit(bool exists) {
    final notifier = ref.read(journalProvider.notifier);
    if (!exists) {
      if (_pin.text.length < 4) return setState(() => error = 'الرمز ٤ خانات على الأقل.');
      if (_pin.text != _confirm.text) return setState(() => error = 'الرمزان غير متطابقين.');
      _run(() => notifier.create(_pin.text));
    } else {
      _run(() => notifier.unlockPin(_pin.text));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final j = ref.watch(journalProvider);
    final exists = j.exists;
    return SanadCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: ExcludeSemantics(
              child: Container(
                width: 64,
                height: 64,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: t.sky, shape: BoxShape.circle),
                child: const Text('🔐', style: TextStyle(fontSize: 24)),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(exists ? 'افتح مذكّرتك' : 'أنشئ مذكّرتك الخاصة', textAlign: TextAlign.center, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Text(
            exists
                ? 'أدخل رمزك، أو استخدم بصمتك إن فعّلتها.'
                : 'اختر رمزاً من ٤ أرقام أو أكثر. تُشفَّر المذكّرة به على جهازك. لا يمكن استرجاعها إن نسيته — هذا ثمن ألا يملك مفتاحها أحد غيرك.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 14, height: 2, color: t.muted),
          ),
          const SizedBox(height: 20),
          _PinField(key: const ValueKey('pin'), label: 'الرمز', controller: _pin, onSubmitted: exists ? (_) => _submit(exists) : null),
          if (!exists) ...[
            const SizedBox(height: 12),
            _PinField(key: const ValueKey('pin2'), label: 'أعد كتابة الرمز', controller: _confirm, onSubmitted: (_) => _submit(exists)),
          ],
          if (error != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Semantics(liveRegion: true, child: Text(error!, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: t.danger))),
            ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: busy ? null : () => _submit(exists),
            child: busy
                ? SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2, color: t.primaryContrast))
                : Text(exists ? 'فتح' : 'إنشاء المذكّرة'),
          ),
          if (exists && j.hasBio) ...[
            const SizedBox(height: 12),
            OutlinedButton(onPressed: busy ? null : () => _run(ref.read(journalProvider.notifier).unlockBio), child: const Text('فتح بالبصمة / الوجه')),
          ],
        ],
      ),
    );
  }
}

class _PinField extends StatelessWidget {
  const _PinField({super.key, required this.label, required this.controller, this.onSubmitted});
  final String label;
  final TextEditingController controller;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          TextField(
            controller: controller,
            obscureText: true,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            textDirection: TextDirection.ltr,
            textAlign: TextAlign.center,
            autocorrect: false,
            enableSuggestions: false,
            style: const TextStyle(letterSpacing: 8, fontSize: 18),
            onSubmitted: onSubmitted,
            decoration: _inputDecoration(context),
          ),
        ],
      );
}

InputDecoration _inputDecoration(BuildContext context, {String? hint}) {
  final t = context.t;
  return InputDecoration(
    hintText: hint,
    hintStyle: TextStyle(color: t.muted),
    filled: true,
    fillColor: t.surface,
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.xl), borderSide: BorderSide(color: t.border)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.xl), borderSide: BorderSide(color: t.focus, width: 2)),
  );
}

class _JournalBody extends ConsumerStatefulWidget {
  const _JournalBody({required this.data});
  final JournalData data;

  @override
  ConsumerState<_JournalBody> createState() => _JournalBodyState();
}

class _JournalBodyState extends ConsumerState<_JournalBody> {
  late String day = ref.read(todayProvider);

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _CheckInForm(key: ValueKey(day), day: day, existing: widget.data.checkIns[day], onPickDay: (d) => setState(() => day = d)),
          const SizedBox(height: 24),
          _Trends(data: widget.data),
          if (widget.data.sessions.isNotEmpty) ...[const SizedBox(height: 24), _Sessions(data: widget.data)],
          const SizedBox(height: 24),
          _JournalSettings(data: widget.data),
        ],
      );
}

class _ScalePicker extends StatelessWidget {
  const _ScalePicker({required this.metric, required this.value, required this.onChanged});
  final JournalMetric metric;
  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(metric.label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        Row(
          children: [
            for (var v = 0; v <= 4; v++) ...[
              if (v > 0) const SizedBox(width: 6),
              Expanded(
                child: Semantics(
                  selected: value == v,
                  button: true,
                  label: '${metric.label}: ${arNum(v + 1)} من ٥',
                  excludeSemantics: true,
                  child: Material(
                    // تدرّج خفيف نحو الأعلى، كـ color-mix في الويب
                    color: value == v ? t.primary : Color.lerp(t.surface, t.primary, v * 0.06),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.xl), side: BorderSide(color: value == v ? t.primary : t.border)),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(Radii.xl),
                      onTap: () => onChanged(v),
                      child: SizedBox(
                        height: 44,
                        child: Center(
                          child: Text(arNum(v + 1), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: value == v ? t.primaryContrast : t.text)),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 4),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(metric.low, style: TextStyle(fontSize: 12, color: t.muted)),
            Text(metric.high, style: TextStyle(fontSize: 12, color: t.muted)),
          ],
        ),
      ],
    );
  }
}

class _CheckInForm extends ConsumerStatefulWidget {
  const _CheckInForm({super.key, required this.day, required this.existing, required this.onPickDay});
  final String day;
  final CheckIn? existing;
  final ValueChanged<String> onPickDay;

  @override
  ConsumerState<_CheckInForm> createState() => _CheckInFormState();
}

class _CheckInFormState extends ConsumerState<_CheckInForm> {
  late final Map<String, int> v = {
    for (final k in const ['calm', 'sleep', 'energy', 'mood']) k: widget.existing?[k] ?? 2,
  };
  late final _note = TextEditingController(text: widget.existing?.note ?? '');
  bool saved = false;
  bool risk = false;
  Timer? _savedTimer;

  @override
  void dispose() {
    _savedTimer?.cancel();
    _note.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final content = ref.read(contentProvider);
    // البند 5: مؤشر خطر في نص المذكرة ← إحالة فورية، حتى لو لم يغادر النص الجهاز
    if (content.requiresEmergencyReferral(_note.text)) {
      setState(() => risk = true);
      ref.read(emergencyProvider.notifier).raise();
    }
    final note = _note.text.trim();
    await ref.read(journalProvider.notifier).saveCheckIn(day: widget.day, values: v, note: note.isEmpty ? null : note);
    if (!mounted) return;
    setState(() => saved = true);
    _savedTimer?.cancel();
    _savedTimer = Timer(const Duration(milliseconds: 2500), () {
      if (mounted) setState(() => saved = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final content = ref.watch(contentProvider);
    final today = ref.watch(todayProvider);
    final day = widget.day;
    final navStyle = TextButton.styleFrom(foregroundColor: t.muted, minimumSize: const Size(40, 36), padding: const EdgeInsets.symmetric(horizontal: 8));
    return SanadCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(day == today ? 'كيف حالك اليوم؟' : 'حالتك يوم ${shortDayLabel(day)}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              ),
              Semantics(
                label: 'اليوم السابق',
                excludeSemantics: true,
                child: TextButton(onPressed: () => widget.onPickDay(addDays(day, -1)), style: navStyle, child: const Text('→')),
              ),
              if (day != today)
                TextButton(
                  onPressed: () => widget.onPickDay(today),
                  style: navStyle.copyWith(foregroundColor: WidgetStatePropertyAll(t.primary)),
                  child: const Text('اليوم', style: TextStyle(fontWeight: FontWeight.w600)),
                ),
              if (day.compareTo(today) < 0)
                Semantics(
                  label: 'اليوم التالي',
                  excludeSemantics: true,
                  child: TextButton(onPressed: () => widget.onPickDay(addDays(day, 1)), style: navStyle, child: const Text('←')),
                ),
            ],
          ),
          const SizedBox(height: 16),
          for (final m in content.journalMetrics) ...[
            _ScalePicker(metric: m, value: v[m.key]!, onChanged: (x) => setState(() => v[m.key] = x)),
            const SizedBox(height: 20),
          ],
          const Text('ملاحظة لنفسك (اختياري)', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          TextField(
            key: const ValueKey('note'),
            controller: _note,
            minLines: 3,
            maxLines: 6,
            maxLength: 1000,
            decoration: _inputDecoration(context, hint: 'ما الذي أثقلك أو أسعدك اليوم؟').copyWith(counterText: ''),
          ),
          Text('لا يقرؤها أحد غيرك.', style: TextStyle(fontSize: 12, color: t.muted)),
          if (risk)
            Container(
              margin: const EdgeInsets.only(top: 16),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(color: t.dangerBg, borderRadius: BorderRadius.circular(Radii.xl)),
              child: Semantics(
                liveRegion: true,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('نحن قلقون عليك', style: TextStyle(fontWeight: FontWeight.w700, color: t.danger)),
                    const SizedBox(height: 4),
                    Text(
                      'ما كتبته يوحي بأنك تمرّ بوقت صعب جداً. لست وحدك — تحدّث الآن مع شخص تثق به، أو اطلب المساعدة العاجلة.',
                      style: TextStyle(fontSize: 14, height: 1.75, color: t.danger),
                    ),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 16),
          Row(
            children: [
              FilledButton(onPressed: _submit, child: Text(widget.existing != null ? 'تحديث' : 'حفظ')),
              const SizedBox(width: 12),
              if (saved) Semantics(liveRegion: true, child: Text('حُفظ مشفّراً ✓', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: t.success))),
            ],
          ),
        ],
      ),
    );
  }
}

class _Trends extends ConsumerWidget {
  const _Trends({required this.data});
  final JournalData data;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.t;
    final content = ref.watch(contentProvider);
    final activeDays = ref.watch(companionProvider).activeDays;
    final tr = journalTrends(data.checkIns, activeDays, ref.watch(todayProvider), trendDays: content.trendDays);

    if (tr.count < content.trendMinEntries) {
      return SanadCard(
        child: Column(
          children: [
            ProgressRing(
              value: tr.count / content.trendDays,
              size: 72,
              stroke: 7,
              child: Text('${arNum(tr.count)}/١٤', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            ),
            const SizedBox(height: 12),
            const Text('رسمك البياني يتشكّل', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text('سجّل ٣ أيام على الأقل لترى الاتجاه، و١٤ يوماً لترى الصورة كاملة.', textAlign: TextAlign.center, style: TextStyle(fontSize: 14, color: t.muted)),
          ],
        ),
      );
    }

    final highlight = [for (final d in tr.days) activeDays.contains(d)];
    Widget note(Widget child) => Container(
          width: double.infinity,
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          decoration: BoxDecoration(color: t.surface2, borderRadius: BorderRadius.circular(Radii.xl)),
          child: DefaultTextStyle.merge(style: const TextStyle(fontSize: 14, height: 1.75), child: child),
        );
    Widget insight(String label, Shift s) {
      final diff = s.now - s.before;
      if (diff.abs() < content.stableDelta) return note(Text('$label: مستقر خلال الأسبوعين.'));
      return note(Text(
        '$label في الأسبوع الأخير ${diff > 0 ? 'أعلى' : 'أقل'} من الأسبوع الذي قبله (${_one(s.before + 1)} ← ${_one(s.now + 1)} من ٥).'
        '${diff < 0 ? ' لا بأس — الأيام تتقلّب، والمهم الاستمرار.' : ''}',
      ));
    }

    return SanadCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('آخر ١٤ يوماً', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text.rich(
            TextSpan(children: [
              WidgetSpan(
                alignment: PlaceholderAlignment.middle,
                child: Container(
                  width: 12,
                  height: 12,
                  margin: const EdgeInsetsDirectional.only(end: 4),
                  decoration: BoxDecoration(color: t.lampGlow.withValues(alpha: 0.4), borderRadius: BorderRadius.circular(2)),
                ),
              ),
              const TextSpan(text: 'الأعمدة المظلّلة أيام أنجزت فيها شيئاً من برنامجك.'),
            ]),
            style: TextStyle(fontSize: 14, color: t.muted),
          ),
          const SizedBox(height: 16),
          for (final m in content.journalMetrics) ...[
            MiniChart(title: m.label, days: tr.days, values: [for (final d in tr.days) data.checkIns[d]?[m.key]], highlight: highlight),
            const SizedBox(height: 16),
          ],
          if (tr.calm != null) insight('الهدوء', tr.calm!),
          if (tr.sleep != null) insight('النوم', tr.sleep!),
          if (tr.committedCalm != null)
            note(Text.rich(TextSpan(children: [
              const TextSpan(text: 'في أيام التزامك كان متوسط هدوئك '),
              TextSpan(text: _one(tr.committedCalm!.committed + 1), style: const TextStyle(fontWeight: FontWeight.w700)),
              const TextSpan(text: ' من ٥، مقابل '),
              TextSpan(text: _one(tr.committedCalm!.other + 1), style: const TextStyle(fontWeight: FontWeight.w700)),
              const TextSpan(text: ' في غيرها.'),
            ]))),
          Text('هذه ملاحظات عن أيامك أنت، لا حكم طبي — والتزامن بين أمرين لا يعني بالضرورة أن أحدهما سبب الآخر.', style: TextStyle(fontSize: 12, color: t.muted)),
          if (tr.low != null)
            Container(
              margin: const EdgeInsets.only(top: 16),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(color: t.surface2, borderRadius: BorderRadius.circular(Radii.xl), border: Border.all(color: t.border)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('خذ بالأسباب أيضاً', style: TextStyle(fontWeight: FontWeight.w700, color: t.primary)),
                  const SizedBox(height: 4),
                  // دليل المختصين في الأسابيع 7–9 من الخطة؛ حتى ذلك الحين النص بلا رابط
                  Text(
                    'لاحظنا أن ${tr.low == 'sleep' ? 'نومك' : 'هدوءك'} منخفض معظم الأيام الماضية. استمر على وِردك، واستشر طبيباً كذلك — أسباب كثيرة للأرق والقلق '
                    'قابلة للفحص والعلاج، والتداوي لا ينافي الرقية.',
                    style: TextStyle(fontSize: 14, height: 1.75, color: t.primary),
                  ),
                ],
              ),
            ),
          Theme(
            data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
            child: ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: Text('عرض كجدول', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: t.primary)),
              children: [_TrendTable(days: tr.days, data: data, activeDays: activeDays, metrics: content.journalMetrics)],
            ),
          ),
        ],
      ),
    );
  }
}

class _TrendTable extends StatelessWidget {
  const _TrendTable({required this.days, required this.data, required this.activeDays, required this.metrics});
  final List<String> days;
  final JournalData data;
  final Set<String> activeDays;
  final List<JournalMetric> metrics;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final head = TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: t.muted);
    const cell = TextStyle(fontSize: 13);
    Widget c(String s, [TextStyle style = cell, TextAlign align = TextAlign.center]) =>
        Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Text(s, style: style, textAlign: align));
    return Table(
      columnWidths: const {0: FlexColumnWidth(1.6)},
      border: TableBorder(horizontalInside: BorderSide(color: t.border)),
      children: [
        TableRow(children: [c('اليوم', head, TextAlign.start), for (final m in metrics) c(m.label, head), c('التزام', head)]),
        for (final d in days)
          TableRow(children: [
            c(shortDayLabel(d), cell, TextAlign.start),
            for (final m in metrics) c(data.checkIns[d] == null ? '—' : arNum(data.checkIns[d]![m.key] + 1)),
            c(activeDays.contains(d) ? '✓' : ''),
          ]),
      ],
    );
  }
}

/// مخطط خطي صغير لمقياس واحد — نظير MiniChart في الويب: لون واحد، بلا محاور، الأحدث يساراً،
/// وأعمدة مظلّلة لأيام الالتزام. اللمس يعرض قيمة اليوم.
class MiniChart extends StatefulWidget {
  const MiniChart({super.key, required this.title, required this.days, required this.values, required this.highlight});
  final String title;
  final List<String> days;
  final List<int?> values;
  final List<bool> highlight;

  @override
  State<MiniChart> createState() => _MiniChartState();
}

class _MiniChartState extends State<MiniChart> {
  int? hover;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final h = hover;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(Radii.x2l), border: Border.all(color: t.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(widget.title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600))),
              if (h != null)
                Text(
                  '${shortDayLabel(widget.days[h])}: ${widget.values[h] == null ? 'لم يُسجَّل' : '${arNum(widget.values[h]! + 1)} من ٥'}',
                  style: TextStyle(fontSize: 12, color: t.muted),
                ),
            ],
          ),
          const SizedBox(height: 4),
          Semantics(
            label: '${widget.title} خلال ١٤ يوماً',
            image: true,
            child: AspectRatio(
              aspectRatio: 300 / 120,
              child: LayoutBuilder(
                builder: (context, box) => GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTapDown: (d) => setState(() => hover = _ChartPainter.indexAt(d.localPosition.dx, box.maxWidth, widget.days.length)),
                  onHorizontalDragUpdate: (d) => setState(() => hover = _ChartPainter.indexAt(d.localPosition.dx, box.maxWidth, widget.days.length)),
                  child: CustomPaint(
                    painter: _ChartPainter(values: widget.values, highlight: widget.highlight, hover: hover, t: t),
                  ),
                ),
              ),
            ),
          ),
          ExcludeSemantics(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('قبل أسبوعين', style: TextStyle(fontSize: 11, color: t.muted)),
                Text('اليوم', style: TextStyle(fontSize: 11, color: t.muted)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ChartPainter extends CustomPainter {
  _ChartPainter({required this.values, required this.highlight, required this.hover, required this.t});
  final List<int?> values;
  final List<bool> highlight;
  final int? hover;
  final SanadTokens t;

  // نفس هندسة الويب في مربع 300×120، مكبّرة إلى العرض الفعلي
  static const _w = 300.0, _h = 120.0, _padT = 10.0, _padB = 6.0, _padX = 8.0;

  static double _step(int n) => (_w - _padX * 2) / (n - 1);

  /// الأحدث يساراً (RTL): اليوم i من الأقدم ← x من اليمين.
  static double _x(int i, int n) => _w - _padX - i * _step(n);
  static double _y(num v) => _padT + (1 - v / 4) * (_h - _padT - _padB);

  static int indexAt(double dx, double width, int n) => ((_w - _padX - dx * _w / width) / _step(n)).round().clamp(0, n - 1);

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / _w, size.height / _h);
    final n = values.length;
    final step = _step(n);
    final grid = Paint()
      ..color = t.border
      ..strokeWidth = 1;
    for (final v in const [0, 2, 4]) {
      canvas.drawLine(Offset(_padX, _y(v)), Offset(_w - _padX, _y(v)), grid);
    }
    final band = Paint()..color = t.lampGlow.withValues(alpha: 0.3);
    for (var i = 0; i < n; i++) {
      if (highlight[i]) {
        canvas.drawRRect(RRect.fromLTRBR(_x(i, n) - step / 2 + 1, _padT, _x(i, n) + step / 2 - 1, _h - _padB, const Radius.circular(4)), band);
      }
    }
    if (hover != null) {
      final dash = Paint()
        ..color = t.muted
        ..strokeWidth = 1;
      for (var y = _padT; y < _h - _padB; y += 6) {
        canvas.drawLine(Offset(_x(hover!, n), y), Offset(_x(hover!, n), math.min(y + 3, _h - _padB)), dash);
      }
    }
    final line = Paint()
      ..color = t.primary
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke
      ..strokeJoin = StrokeJoin.round
      ..strokeCap = StrokeCap.round;
    Path? seg;
    void flush() {
      if (seg != null) canvas.drawPath(seg!, line);
      seg = null;
    }

    for (var i = 0; i < n; i++) {
      final v = values[i];
      if (v == null) {
        flush();
      } else if (seg == null) {
        seg = Path()..moveTo(_x(i, n), _y(v));
      } else {
        seg!.lineTo(_x(i, n), _y(v));
      }
    }
    flush();
    final dot = Paint()..color = t.primary;
    final ring = Paint()
      ..color = t.surface
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    for (var i = 0; i < n; i++) {
      final v = values[i];
      if (v == null) continue;
      final r = hover == i ? 5.0 : 4.0;
      canvas
        ..drawCircle(Offset(_x(i, n), _y(v)), r, dot)
        ..drawCircle(Offset(_x(i, n), _y(v)), r, ring);
    }
  }

  @override
  bool shouldRepaint(_ChartPainter old) => old.values != values || old.highlight != highlight || old.hover != hover || old.t != t;
}

class _Sessions extends StatelessWidget {
  const _Sessions({required this.data});
  final JournalData data;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final last = data.sessions.length > 10 ? data.sessions.sublist(data.sessions.length - 10) : data.sessions;
    final delta = sessionsDelta(data.sessions);
    return SanadCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('جلساتك', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text.rich(
            TextSpan(children: [
              TextSpan(text: 'سجّلت ${arNum(data.sessions.length)} جلسة رقية أو سكينة.'),
              if (delta.isFinite && delta > 0) ...[
                const TextSpan(text: ' في المتوسط شعرت بهدوء أكبر بعدها بـ '),
                TextSpan(text: _one(delta), style: const TextStyle(fontWeight: FontWeight.w700)),
                const TextSpan(text: ' درجة (من ١٠).'),
              ],
            ]),
            style: TextStyle(fontSize: 14, color: t.muted),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final s in last)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(color: t.surface2, borderRadius: BorderRadius.circular(Radii.full)),
                  child: Text('${s.kind == 'ruqyah' ? 'رقية' : 'سكينة'}: ${arNum(s.before)} ← ${arNum(s.after)}', style: const TextStyle(fontSize: 12)),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _JournalSettings extends ConsumerStatefulWidget {
  const _JournalSettings({required this.data});
  final JournalData data;

  @override
  ConsumerState<_JournalSettings> createState() => _JournalSettingsState();
}

class _JournalSettingsState extends ConsumerState<_JournalSettings> {
  bool bioSupported = false;
  String? msg;
  final _newPin = TextEditingController();
  bool confirmWipe = false;

  @override
  void initState() {
    super.initState();
    ref.read(biometricKeyStoreProvider).available().then((v) {
      if (mounted) setState(() => bioSupported = v);
    });
  }

  @override
  void dispose() {
    _newPin.dispose();
    super.dispose();
  }

  Future<void> _try(Future<void> Function() fn, String ok, String fail) async {
    try {
      await fn();
      if (mounted) setState(() => msg = ok);
    } catch (_) {
      if (mounted) setState(() => msg = fail);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final j = ref.watch(journalProvider);
    final notifier = ref.read(journalProvider.notifier);
    const h = TextStyle(fontWeight: FontWeight.w600);
    final muted = TextStyle(fontSize: 14, color: t.muted);
    return SanadCard(
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          key: const ValueKey('journal-settings'),
          tilePadding: EdgeInsets.zero,
          childrenPadding: const EdgeInsets.only(top: 8),
          expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
          title: const Text('الخصوصية والقفل', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          children: [
            if (msg != null)
              Container(
                margin: const EdgeInsets.only(bottom: 16),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(color: t.surface2, borderRadius: BorderRadius.circular(Radii.xl)),
                child: Semantics(liveRegion: true, child: Text(msg!, style: const TextStyle(fontSize: 14))),
              ),
            const Text('البصمة / بصمة الوجه', style: h),
            const SizedBox(height: 4),
            Text('تفتح المذكّرة بمفتاح جهازك نفسه — البصمة لا تغادر جهازك ولا نراها.', style: muted),
            const SizedBox(height: 8),
            if (!bioSupported)
              Text('غير متاحة على هذا الجهاز.', style: muted)
            else
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: OutlinedButton(
                  onPressed: j.hasBio
                      ? () => _try(notifier.disableBio, 'أُلغي الفتح بالبصمة.', 'تعذّر الإلغاء.')
                      : () => _try(notifier.enableBio, 'فُعّل الفتح بالبصمة ✓', 'تعذّر التفعيل.'),
                  child: Text(j.hasBio ? 'إلغاء البصمة' : 'فعّل الفتح بالبصمة'),
                ),
              ),
            const SizedBox(height: 20),
            const Text('تغيير الرمز', style: h),
            const SizedBox(height: 8),
            Row(
              children: [
                SizedBox(
                  width: 160,
                  child: TextField(
                    key: const ValueKey('new-pin'),
                    controller: _newPin,
                    obscureText: true,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    textDirection: TextDirection.ltr,
                    onChanged: (_) => setState(() {}),
                    decoration: _inputDecoration(context).copyWith(labelText: 'الرمز الجديد', floatingLabelBehavior: FloatingLabelBehavior.never),
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: _newPin.text.length < 4
                      ? null
                      : () async {
                          await notifier.changePin(_newPin.text);
                          _newPin.clear();
                          if (mounted) setState(() => msg = 'تغيّر الرمز ✓');
                        },
                  child: const Text('تغيير'),
                ),
              ],
            ),
            const SizedBox(height: 20),
            const Text('بياناتك ملكك', style: h),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton(
                  onPressed: () => ref.read(outboundProvider).shareFile(
                        utf8.encode(const JsonEncoder.withIndent('  ').convert(widget.data.toJson())),
                        name: 'sanad-journal-${ref.read(todayProvider)}.json',
                        mimeType: 'application/json',
                      ),
                  child: const Text('تنزيل نسخة (غير مشفّرة)'),
                ),
                if (!confirmWipe)
                  TextButton(
                    onPressed: () => setState(() => confirmWipe = true),
                    style: TextButton.styleFrom(foregroundColor: t.danger),
                    child: const Text('حذف المذكّرة نهائياً'),
                  )
                else
                  FilledButton(
                    onPressed: notifier.wipe,
                    style: FilledButton.styleFrom(backgroundColor: t.danger, foregroundColor: t.primaryContrast),
                    child: const Text('تأكيد الحذف — لا يمكن التراجع'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
