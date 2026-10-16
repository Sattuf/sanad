import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../content/arabic.dart';
import '../../theme/theme.dart';
import '../../ui/components.dart';
import '../../ui/share_card.dart';
import 'companion_store.dart';

/*
  «ميزان الوعي» و«اختبر وعيك» — نظير AwarenessPage وQuizPage في
  frontend/src/features/companion/AwarenessPages.tsx، بالنصوص نفسها.
  الحكم والدليل والبديل من المحتوى المشترك (myths.ts وquiz.ts) فقط.
*/

const _filters = ['all', 'prohibited', 'baseless', 'detail', 'legit'];

class AwarenessScreen extends ConsumerStatefulWidget {
  const AwarenessScreen({super.key});

  @override
  ConsumerState<AwarenessScreen> createState() => _AwarenessScreenState();
}

class _AwarenessScreenState extends ConsumerState<AwarenessScreen> {
  final _q = TextEditingController();
  String filter = 'all';

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final content = ref.watch(contentProvider);
    final t = context.t;
    final q = _q.text.trim();
    final results = q.isEmpty ? content.myths : content.searchMyths(_q.text);
    final shown = filter == 'all' ? results : results.where((m) => m.verdict == filter).toList();

    return SafeArea(
      bottom: false,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 120),
        children: [
          const PageHeader(
            title: 'ميزان الوعي: هل هذا صحيح؟',
            subtitle:
                'سمعت عن ممارسة لـ«الطاقة» أو «الحماية» ولا تعرف حكمها؟ اكتبها هنا، وسيظهر لك الحكم الشرعي بدليله، والتفسير العلمي والنفسي، والبديل الصحيح — بهدوء ودون تخويف.',
          ),
          TextField(
            controller: _q,
            onChanged: (_) => setState(() {}),
            autocorrect: false,
            style: const TextStyle(fontSize: 18),
            decoration: InputDecoration(
              hintText: 'مثال: التبخير بملح الهملايا لطرد الطاقة السلبية',
              hintStyle: TextStyle(color: t.muted, fontSize: 16),
              filled: true,
              fillColor: t.surface,
              contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(Radii.x2l),
                borderSide: BorderSide(color: t.border),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(Radii.x2l),
                borderSide: BorderSide(color: t.focus, width: 2),
              ),
            ),
            textInputAction: TextInputAction.search,
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final s in content.mythSuggestions)
                Material(
                  color: t.surface2,
                  shape: const StadiumBorder(),
                  child: InkWell(
                    customBorder: const StadiumBorder(),
                    onTap: () => setState(() => _q.text = s),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                      child: Text(s, style: TextStyle(fontSize: 14, color: t.muted)),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 24),
          Semantics(
            label: 'تصفية حسب الحكم',
            child: Wrap(
              spacing: 4,
              runSpacing: 4,
              children: [
                for (final v in _filters)
                  Semantics(
                    selected: filter == v,
                    button: true,
                    child: Material(
                      color: filter == v ? t.primary : Colors.transparent,
                      shape: const StadiumBorder(),
                      child: InkWell(
                        customBorder: const StadiumBorder(),
                        onTap: () => setState(() => filter = v),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          child: Text(
                            v == 'all' ? 'الكل' : content.verdictLabel[v]!,
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: filter == v ? t.primaryContrast : t.muted),
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          for (final (i, m) in shown.indexed)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              // يُعاد بناؤها مع كل بحث، فتنفتح النتيجة الأولى كالويب
              child: MythCard(key: ValueKey('${m.id}|$q|$filter'), myth: m, content: content, defaultOpen: q.isNotEmpty && i == 0),
            ),
          if (shown.isEmpty)
            SanadCard(
              child: Column(
                children: [
                  const Text(
                    'لم نجد هذه الممارسة في الميزان بعد',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'القاعدة العامة: كل ما يُعتقد أنه ينفع أو يدفع الضرّ بذاته — من خرز أو أحجار أو «طاقة» — بلا دليل شرعي ولا تجربة علمية، فاجتنبه. وللفتوى في '
                    'مسألتك اسأل أهل العلم الموثوقين.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 14, height: 2, color: t.muted),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 20),
          Text(
            'محتوى توعوي عام مبني على نصوص معروفة ومصادرها — ليس فتوى في حالة بعينها. راجعه مختصون قبل النشر، ونرحّب بتصويباتكم عبر صفحة البلاغات.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, height: 2, color: t.muted),
          ),
          const SizedBox(height: 24),
          DawnLink(
            title: 'اختبر وعيك',
            sub: 'هل ممارساتك اليومية صحية أم مدخل للوهم؟ ${arNum(content.quizQuestions.length)} أسئلة سريعة.',
            cta: 'ابدأ',
            onTap: () => context.go('/awareness/quiz'),
          ),
        ],
      ),
    );
  }
}

/// «اختبر وعيك» — ينتهي بخطة تحصين مقترحة. الاختبار يقيس عادات ووعياً عاماً ولا يصنّف الحالة (البند 3).
class QuizScreen extends ConsumerStatefulWidget {
  const QuizScreen({super.key});

  @override
  ConsumerState<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends ConsumerState<QuizScreen> {
  Map<String, int> answers = {};
  int step = 0;
  int? picked;

  @override
  Widget build(BuildContext context) {
    final content = ref.watch(contentProvider);
    final quiz = content.quizQuestions;
    final t = context.t;
    final body = step >= quiz.length ? _result(context) : _question(context);
    return SafeArea(
      bottom: false,
      // كل سؤال يبدأ من أعلى الشاشة
      child: ListView(
        key: ValueKey('quiz-$step'),
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 120),
        children: [
          if (step < quiz.length)
            Text(
              'اختبر وعيك',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: t.primary),
            ),
          ...body,
        ],
      ),
    );
  }

  List<Widget> _question(BuildContext context) {
    final content = ref.read(contentProvider);
    final quiz = content.quizQuestions;
    final t = context.t;
    final q = quiz[step];
    final myth = content.mythById(q.mythId);
    return [
      const SizedBox(height: 12),
      ExcludeSemantics(
        child: Row(
          children: [
            for (var i = 0; i < quiz.length; i++) ...[
              if (i > 0) const SizedBox(width: 4),
              Expanded(
                child: Container(
                  height: 6,
                  decoration: BoxDecoration(
                    color: i < step ? t.primary : (i == step ? t.primary.withValues(alpha: 0.5) : t.border),
                    borderRadius: BorderRadius.circular(Radii.full),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
      const SizedBox(height: 8),
      Text('السؤال ${arNum(step + 1)} من ${arNum(quiz.length)}', style: TextStyle(fontSize: 12, color: t.muted)),
      const SizedBox(height: 24),
      Semantics(
        header: true,
        child: Text(q.question, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700, height: 1.65)),
      ),
      const SizedBox(height: 24),
      for (final (i, o) in q.options.indexed)
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: _Option(
            label: o.label,
            state: picked == null ? _OptState.open : (picked == i ? (o.score == 2 ? _OptState.right : _OptState.other) : _OptState.dimmed),
            onTap: picked != null
                ? null
                : () => setState(() {
                    picked = i;
                    answers = {...answers, q.id: o.score};
                  }),
          ),
        ),
      if (picked != null)
        Container(
          margin: const EdgeInsets.only(top: 8),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(gradient: t.dawn, borderRadius: BorderRadius.circular(Radii.x2l)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (myth != null) ...[
                Text('${content.verdictLabel[myth.verdict]}: ${myth.title}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(myth.alternative, style: TextStyle(fontSize: 14, height: 2, color: t.muted)),
              ] else
                Text('كل خطوة صغيرة ثابتة أفضل من كثير متقطّع. سنقترح عليك خطة بسيطة في النهاية.', style: TextStyle(fontSize: 14, height: 2, color: t.muted)),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () {
                  final n = step + 1;
                  setState(() {
                    picked = null;
                    step = n;
                  });
                  if (n >= quiz.length) {
                    final r = content.evaluateQuiz(answers);
                    ref.read(companionProvider.notifier).saveQuiz(r.score, r.programId);
                  }
                },
                child: Text(step + 1 == quiz.length ? 'اعرض نتيجتي' : 'التالي'),
              ),
            ],
          ),
        ),
    ];
  }

  List<Widget> _result(BuildContext context) {
    final content = ref.read(contentProvider);
    final t = context.t;
    final r = content.evaluateQuiz(answers);
    final program = content.programById(r.programId)!;
    return [
      Text(
        'نتيجتك',
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: t.primary),
      ),
      const SizedBox(height: 8),
      Semantics(
        header: true,
        child: Text(
          r.tierTitle,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 36, fontWeight: FontWeight.w700),
        ),
      ),
      const SizedBox(height: 8),
      Text(
        '${arNum(r.score)} من ${arNum(content.quizMaxScore)}',
        textAlign: TextAlign.center,
        style: TextStyle(color: t.muted),
      ),
      const SizedBox(height: 16),
      Text(r.tierMessage, textAlign: TextAlign.center, style: const TextStyle(height: 2)),
      const SizedBox(height: 32),
      SanadCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('خطة التحصين المقترحة لك', style: TextStyle(fontSize: 14, color: t.muted)),
            const SizedBox(height: 4),
            Text(program.title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
            Text(
              program.tagline,
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: t.primary),
            ),
            const SizedBox(height: 8),
            Text(r.reason, style: TextStyle(fontSize: 14, height: 2, color: t.muted)),
            const SizedBox(height: 16),
            FilledButton(onPressed: () => context.go('/programs/${program.id}'), child: const Text('اطّلع على البرنامج وابدأ')),
          ],
        ),
      ),
      const SizedBox(height: 24),
      Wrap(
        alignment: WrapAlignment.center,
        spacing: 12,
        runSpacing: 8,
        children: [
          ShareButton(
            bordered: true,
            content: (
              kicker: 'اختبرتُ وعيي في سند',
              body: 'نتيجتي: ${r.tierTitle}\nهل ممارساتك اليومية صحية أم مدخل للوهم؟ جرّب الاختبار.',
              source: '$siteHost/awareness/quiz',
              quran: false,
            ),
          ),
          TextButton(
            onPressed: () => setState(() {
              answers = {};
              step = 0;
            }),
            style: TextButton.styleFrom(foregroundColor: t.muted, shape: const StadiumBorder()),
            child: const Text('أعد الاختبار'),
          ),
        ],
      ),
      const SizedBox(height: 24),
      Text(
        'الاختبار يقيس عادات ووعياً عاماً، ولا يقيّم حالتك أو يصنّفها. لا تُرسل إجاباتك لأي مكان.',
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 12, color: t.muted),
      ),
    ];
  }
}

enum _OptState { open, right, other, dimmed }

class _Option extends StatelessWidget {
  const _Option({required this.label, required this.state, required this.onTap});
  final String label;
  final _OptState state;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final (bg, border) = switch (state) {
      _OptState.right => (t.successBg, t.success),
      _OptState.other => (t.sky, t.skyStrong),
      _ => (t.surface, t.border),
    };
    return Opacity(
      opacity: state == _OptState.dimmed ? 0.6 : 1,
      child: Material(
        color: bg,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(Radii.x2l),
          side: BorderSide(color: border),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(Radii.x2l),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            child: SizedBox(
              width: double.infinity,
              child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
            ),
          ),
        ),
      ),
    );
  }
}
