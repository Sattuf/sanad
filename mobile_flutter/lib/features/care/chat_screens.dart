import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/session.dart';
import '../../theme/theme.dart';
import '../../ui/components.dart';
import '../companion/companion_store.dart';
import '../library/library_screens.dart' show TrackCard, favoritesProvider;
import 'care_models.dart';

/*
  المحادثة الإدارية وتوصياتي والبلاغات والإشعارات — نظير ConversationPage وMyRecommendations وReportPage
  وNotificationsPage في الويب بالنصوص نفسها. المحادثة نص فقط (لا مرفقات — 12 §12.5)، مشفّرة في الخادم (ADR-0007).
  الوقت الفعلي تحسين فقط (realtime.dart)؛ الرسائل تُجلب دورياً كل 30 ثانية بدونه، كالويب.
*/

final conversationsProvider = FutureProvider.autoDispose<List<Conversation>>((ref) async {
  final list = await ref.read(apiProvider).get<List<dynamic>>('/api/v1/me/conversations');
  return [for (final c in list) Conversation.fromJson(c as Map<String, dynamic>)];
});

final messagesProvider = FutureProvider.autoDispose.family<List<ChatMessage>, String>((ref, id) async {
  final list = await ref.read(apiProvider).get<List<dynamic>>('/api/v1/conversations/$id/messages?take=100');
  return [for (final m in list) ChatMessage.fromJson(m as Map<String, dynamic>)];
});

final recommendationsProvider = FutureProvider.autoDispose<List<Recommendation>>((ref) async {
  final list = await ref.read(apiProvider).get<List<dynamic>>('/api/v1/me/recommendations');
  return [for (final r in list) Recommendation.fromJson(r as Map<String, dynamic>)];
});

class AppNotification {
  const AppNotification({required this.id, required this.title, required this.body, this.link, required this.isRead, required this.createdAtUtc});

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
    id: j['id'] as String,
    title: j['title'] as String,
    body: j['body'] as String,
    link: j['link'] as String?,
    isRead: j['isRead'] as bool,
    createdAtUtc: j['createdAtUtc'] as String,
  );

  final String id;
  final String title;
  final String body;
  final String? link;
  final bool isRead;
  final String createdAtUtc;
}

final notificationsProvider = FutureProvider.autoDispose<List<AppNotification>>((ref) async {
  final list = await ref.read(apiProvider).get<List<dynamic>>('/api/v1/me/notifications');
  return [for (final n in list) AppNotification.fromJson(n as Map<String, dynamic>)];
});

const reportCategories = ['UnauthorizedClaim', 'Impersonation', 'FinancialExploitation', 'Harassment', 'PrivacyViolation', 'Other'];
const conversationReportCategories = ['Harassment', 'FinancialExploitation', 'Impersonation', 'UnauthorizedClaim', 'PrivacyViolation', 'Other'];
const reportSeverities = ['Low', 'Medium', 'High', 'Critical'];

String _friendly(Object e, String fallback) => e is ApiError ? e.friendly : fallback;

/// UnmonitoredChatWarning في الويب.
class UnmonitoredChatWarning extends StatelessWidget {
  const UnmonitoredChatWarning({super.key});

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(color: t.warningBg, borderRadius: BorderRadius.circular(Radii.xl)),
      child: Text.rich(
        TextSpan(
          style: TextStyle(fontSize: 14, height: 1.75, color: t.warning),
          children: const [
            TextSpan(text: 'هذه محادثة إدارية لتنسيق الموعد، '),
            TextSpan(
              text: 'وليست مراقَبة لحظياً',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
            TextSpan(text: '. لا تشارك بيانات حساسة غير لازمة.'),
          ],
        ),
      ),
    );
  }
}

class ConversationScreen extends ConsumerStatefulWidget {
  const ConversationScreen({super.key, required this.id});
  final String id;

  @override
  ConsumerState<ConversationScreen> createState() => _ConversationScreenState();
}

class _ConversationScreenState extends ConsumerState<ConversationScreen> {
  final _body = TextEditingController();
  final _scroll = ScrollController();
  Timer? _poll;
  bool sending = false;
  bool reporting = false;
  String? error;

  @override
  void initState() {
    super.initState();
    _body.addListener(() => setState(() {}));
    _poll = Timer.periodic(const Duration(seconds: 30), (_) => ref.invalidate(messagesProvider(widget.id)));
  }

  @override
  void dispose() {
    _poll?.cancel();
    _body.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _toEnd() => WidgetsBinding.instance.addPostFrameCallback((_) {
    if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
  });

  Future<void> _send() async {
    final text = _body.text.trim();
    if (text.isEmpty) return;
    setState(() {
      sending = true;
      error = null;
    });
    try {
      await ref.read(apiProvider).post<Object?>('/api/v1/conversations/${widget.id}/messages', body: {'body': text});
      _body.clear();
      ref.invalidate(messagesProvider(widget.id));
    } catch (e) {
      if (mounted) setState(() => error = _friendly(e, 'تعذّر الإرسال.'));
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final messages = ref.watch(messagesProvider(widget.id));
    final current = ref.watch(conversationsProvider).value?.where((c) => c.id == widget.id).firstOrNull;
    final active = current == null || current.active;
    ref.listen(messagesProvider(widget.id), (prev, next) {
      if (next.value?.length != prev?.value?.length) _toEnd();
    });

    return Scaffold(
      appBar: AppBar(
        title: Text(current == null ? 'المحادثة' : 'محادثة مع ${current.counterpartDisplayName}', style: const TextStyle(fontSize: 18)),
        actions: [TextButton(key: const ValueKey('report-toggle'), onPressed: () => setState(() => reporting = !reporting), child: const Text('إبلاغ'))],
      ),
      body: messages.when(
        loading: () => const Loading(),
        error: (e, _) => ListView(
          padding: const EdgeInsets.all(16),
          children: [ErrorState(error: e, onRetry: () => ref.invalidate(messagesProvider(widget.id)))],
        ),
        data: (list) => Column(
          children: [
            Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 0), child: const UnmonitoredChatWarning()),
            if (reporting)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: ReportForm(
                  title: 'الإبلاغ عن هذه المحادثة',
                  categories: conversationReportCategories,
                  initialCategory: 'Harassment',
                  withSeverity: false,
                  submit: (category, severity, description) => ref
                      .read(apiProvider)
                      .post<Object?>(
                        '/api/v1/conversations/${widget.id}/report',
                        body: {'category': category, 'severity': 'Medium', 'description': description},
                      ),
                  onDone: () => setState(() => reporting = false),
                ),
              ),
            Expanded(
              child: Semantics(
                liveRegion: true,
                child: list.isEmpty
                    ? Center(
                        child: Text('لا رسائل بعد. ابدأ بتنسيق تفاصيل موعدك.', style: TextStyle(color: t.muted)),
                      )
                    : ListView.builder(
                        controller: _scroll,
                        padding: const EdgeInsets.all(16),
                        itemCount: list.length,
                        itemBuilder: (_, i) => _Bubble(message: list[i]),
                      ),
              ),
            ),
            if (!active)
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 16),
                child: SanadBanner(tone: 'warning', child: Text('هذه المحادثة مقيّدة إدارياً ولا تقبل رسائل جديدة.')),
              ),
            if (error != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: SanadBanner(tone: 'danger', child: Text(error!)),
              ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: Semantics(
                        label: 'رسالتك',
                        child: TextField(
                          key: const ValueKey('message'),
                          controller: _body,
                          enabled: active,
                          maxLength: 4000,
                          minLines: 1,
                          maxLines: 5,
                          decoration: sanadInput(context, hint: 'اكتب رسالة إدارية…').copyWith(counterText: ''),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    FilledButton(
                      key: const ValueKey('send'),
                      onPressed: active && !sending && _body.text.trim().isNotEmpty ? _send : null,
                      child: sending ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('إرسال'),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message});
  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final mine = message.isMine;
    return Align(
      // ms-auto في الويب: رسائلي في جهة النهاية (اليسار في RTL)، ورسائل الطرف الآخر في البداية
      alignment: mine ? AlignmentDirectional.centerEnd : AlignmentDirectional.centerStart,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.8),
        child: Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          decoration: BoxDecoration(color: mine ? t.primary : t.surface2, borderRadius: BorderRadius.circular(Radii.x2l)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(message.body, style: TextStyle(height: 1.75, color: mine ? t.primaryContrast : t.text)),
              Text(formatTime(message.sentAtUtc), style: TextStyle(fontSize: 11, color: mine ? t.primaryContrast.withValues(alpha: 0.8) : t.muted)),
            ],
          ),
        ),
      ),
    );
  }
}

/// نموذج بلاغ — نوع المشكلة، والخطورة (للبلاغ العام)، ووصف مختصر يُحفظ مشفّراً.
class ReportForm extends ConsumerStatefulWidget {
  const ReportForm({
    super.key,
    required this.title,
    required this.categories,
    required this.initialCategory,
    required this.withSeverity,
    required this.submit,
    this.onDone,
  });

  final String? title;
  final List<String> categories;
  final String initialCategory;
  final bool withSeverity;
  final Future<Object?> Function(String category, String severity, String? description) submit;
  final VoidCallback? onDone;

  @override
  ConsumerState<ReportForm> createState() => _ReportFormState();
}

class _ReportFormState extends ConsumerState<ReportForm> {
  late String category = widget.initialCategory;
  String severity = 'Medium';
  final _description = TextEditingController();
  bool busy = false;
  bool done = false;
  String? error;

  @override
  void dispose() {
    _description.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final d = _description.text.trim();
      await widget.submit(category, severity, d.isEmpty ? null : d);
      if (mounted) setState(() => done = true);
    } catch (e) {
      if (mounted) setState(() => error = _friendly(e, 'تعذّر الإرسال'));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final content = ref.watch(contentProvider);
    if (done) {
      return SanadBanner(
        tone: 'success',
        title: 'وصل بلاغك',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.withSeverity ? 'سيراجعه فريق التنسيق. شكراً لمساعدتك في حماية الآخرين.' : 'سيراجعه فريق التنسيق.'),
            if (widget.onDone != null)
              TextButton(
                onPressed: widget.onDone,
                style: TextButton.styleFrom(padding: EdgeInsets.zero),
                child: const Text('إغلاق'),
              ),
          ],
        ),
      );
    }
    return SanadCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (widget.title != null) ...[Text(widget.title!, style: const TextStyle(fontWeight: FontWeight.w700)), const SizedBox(height: 12)],
          const Text('نوع المشكلة', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            key: const ValueKey('report-category'),
            initialValue: category,
            isExpanded: true,
            decoration: sanadInput(context),
            items: [for (final c in widget.categories) DropdownMenuItem(value: c, child: Text(content.label('reportCategory.$c')))],
            onChanged: (v) => setState(() => category = v ?? category),
          ),
          if (widget.withSeverity) ...[
            const SizedBox(height: 12),
            const Text('الخطورة', style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              key: const ValueKey('report-severity'),
              initialValue: severity,
              isExpanded: true,
              decoration: sanadInput(context),
              items: [for (final s in reportSeverities) DropdownMenuItem(value: s, child: Text(content.label('reportSeverity.$s')))],
              onChanged: (v) => setState(() => severity = v ?? severity),
            ),
          ],
          const SizedBox(height: 12),
          TextField(
            key: const ValueKey('report-description'),
            controller: _description,
            maxLength: 3000,
            minLines: 3,
            maxLines: 6,
            decoration: sanadInput(
              context,
              hint: widget.withSeverity ? 'وصف مختصر (يُحفظ مشفّراً)' : 'وصف مختصر (اختياري، يُحفظ مشفّراً)',
            ).copyWith(counterText: ''),
          ),
          if (error != null) ...[const SizedBox(height: 12), SanadBanner(tone: 'danger', child: Text(error!))],
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton(
                key: const ValueKey('send-report'),
                onPressed: busy ? null : _send,
                child: busy ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('إرسال البلاغ'),
              ),
              if (widget.onDone != null) TextButton(onPressed: widget.onDone, child: const Text('إلغاء')),
            ],
          ),
        ],
      ),
    );
  }
}

/// بلاغ عام عن مقدّم خدمة أو جهة أو مستخدم — مفتاح تكرار ثابت للنموذج كالويب.
class ReportScreen extends ConsumerStatefulWidget {
  const ReportScreen({super.key, this.targetType, this.targetId});
  final String? targetType;
  final String? targetId;

  @override
  ConsumerState<ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends ConsumerState<ReportScreen> {
  final key = newIdempotencyKey();

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(),
    body: ListView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
      children: [
        const PageHeader(title: 'إبلاغ', subtitle: 'البلاغات الموثَّقة تؤثر تدريجياً على ظهور الحساب، ولا تُتخذ قرارات آلياً دون مراجعة منسق.'),
        if (widget.targetId == null)
          const SanadBanner(tone: 'warning', child: Text('افتح الإبلاغ من صفحة المختص أو الجهة المعنية.'))
        else
          ReportForm(
            title: null,
            categories: reportCategories,
            initialCategory: 'UnauthorizedClaim',
            withSeverity: true,
            submit: (category, severity, description) => ref
                .read(apiProvider)
                .post<Object?>(
                  '/api/v1/reports',
                  body: {'targetType': widget.targetType, 'targetId': widget.targetId, 'category': category, 'severity': severity, 'description': description},
                  headers: {'Idempotency-Key': key},
                ),
          ),
      ],
    ),
  );
}

class RecommendationsScreen extends ConsumerStatefulWidget {
  const RecommendationsScreen({super.key});

  @override
  ConsumerState<RecommendationsScreen> createState() => _RecommendationsScreenState();
}

class _RecommendationsScreenState extends ConsumerState<RecommendationsScreen> {
  String? acking;

  Future<void> _ack(String id) async {
    setState(() => acking = id);
    try {
      await ref.read(apiProvider).post<Object?>('/api/v1/me/recommendations/$id/acknowledge');
      ref.invalidate(recommendationsProvider);
    } catch (_) {
      // كالويب: يبقى الزر ليعاد المحاولة
    } finally {
      if (mounted) setState(() => acking = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final recs = ref.watch(recommendationsProvider);
    final favIds = {...?ref.watch(favoritesProvider).value?.map((f) => f.id)};
    return Scaffold(
      appBar: AppBar(),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(recommendationsProvider.future).catchError((_) => <Recommendation>[]),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
          children: [
            const PageHeader(title: 'توصياتي', subtitle: 'توجيهات أرسلها مختصك لك مباشرة. هي توجيه عام ومحتوى للاستماع، والشفاء بيد الله وحده.'),
            recs.when(
              loading: () => const Loading(),
              error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(recommendationsProvider)),
              data: (list) => list.isEmpty
                  ? const EmptyState(title: 'لا توصيات بعد', child: Text('بعد تأكيد موعدك، قد يرسل لك مختصك توجيهاً أو مقاطع للاستماع.'))
                  : Column(
                      children: [
                        for (final r in list)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 16),
                            child: SanadCard(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Expanded(
                                        child: Text(r.providerDisplayName, style: const TextStyle(fontWeight: FontWeight.w700)),
                                      ),
                                      Text(formatDateTime(r.recordedAtUtc), style: TextStyle(fontSize: 14, color: t.muted)),
                                    ],
                                  ),
                                  const SizedBox(height: 12),
                                  Text(r.guidanceText, style: const TextStyle(height: 2)),
                                  if (r.recommendedTracks.isNotEmpty) ...[
                                    const SizedBox(height: 16),
                                    Text(
                                      'مقاطع مقترحة للاستماع',
                                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: t.muted),
                                    ),
                                    const SizedBox(height: 8),
                                    for (final track in r.recommendedTracks)
                                      Padding(
                                        padding: const EdgeInsets.only(bottom: 8),
                                        child: TrackCard(track: track, isFavorite: favIds.contains(track.id)),
                                      ),
                                  ],
                                  const SizedBox(height: 16),
                                  if (r.acknowledgedAtUtc != null)
                                    const SanadBadge(tone: 'success', label: 'اطّلعت عليها')
                                  else
                                    OutlinedButton(
                                      key: ValueKey('ack-${r.id}'),
                                      onPressed: acking == null ? () => _ack(r.id) : null,
                                      child: acking == r.id
                                          ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                                          : const Text('تم الاطّلاع'),
                                    ),
                                ],
                              ),
                            ),
                          ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.t;
    final items = ref.watch(notificationsProvider);
    final hasUnread = items.value?.any((n) => !n.isRead) ?? false;
    return Scaffold(
      appBar: AppBar(
        actions: [
          if (hasUnread)
            Padding(
              padding: const EdgeInsetsDirectional.only(end: 12),
              child: OutlinedButton(
                key: const ValueKey('read-all'),
                onPressed: () async {
                  await ref.read(apiProvider).post<Object?>('/api/v1/me/notifications/read-all').catchError((_) => null);
                  ref.invalidate(notificationsProvider);
                },
                child: const Text('تعليم الكل كمقروء'),
              ),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(notificationsProvider.future).catchError((_) => <AppNotification>[]),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
          children: [
            PageHeader(title: ref.read(contentProvider).label('nav.notifications')),
            items.when(
              loading: () => const Loading(),
              error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(notificationsProvider)),
              data: (list) => list.isEmpty
                  ? const EmptyState(title: 'لا إشعارات')
                  : Column(
                      children: [
                        for (final n in list)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: Opacity(
                              opacity: n.isRead ? 0.75 : 1,
                              child: InkWell(
                                borderRadius: BorderRadius.circular(Radii.x2l),
                                onTap: n.link == null ? null : () => context.push(n.link!),
                                child: Container(
                                  padding: const EdgeInsets.all(20),
                                  decoration: BoxDecoration(
                                    color: t.surface,
                                    borderRadius: BorderRadius.circular(Radii.x2l),
                                    border: Border.all(color: n.isRead ? t.border : t.lamp.withValues(alpha: 0.5)),
                                  ),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Expanded(
                                            child: Text(n.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                                          ),
                                          Text(formatDateTime(n.createdAtUtc), style: TextStyle(fontSize: 12, color: t.muted)),
                                        ],
                                      ),
                                      const SizedBox(height: 4),
                                      Text(n.body, style: TextStyle(fontSize: 14, color: t.muted)),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
