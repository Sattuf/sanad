import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/platform_services.dart';
import '../../core/session.dart';
import '../../theme/theme.dart';
import '../../ui/components.dart';
import '../../ui/door_tabs.dart';
import '../companion/companion_store.dart';
import 'care_models.dart';

/*
  الدليل وصفحة المختص وصفحة الجهة — نظير frontend/src/features/directory/DirectoryPages.tsx بالنصوص نفسها.
  الدليل عام بلا حساب (auth: false)؛ الحجز وحده يطلب الدخول.
*/

const directoryTracks = ['WaqfFree', 'DawahGuidance', 'IndependentConsultant'];
const directoryPageSize = 12;

typedef DirectoryQuery = ({String q, String track, String deliveryMode, int page});

final directoryProvider = FutureProvider.autoDispose.family<DirectoryPage, DirectoryQuery>((ref, query) async {
  final qs = {
    if (query.q.isNotEmpty) 'q': query.q,
    if (query.track.isNotEmpty) 'track': query.track,
    if (query.deliveryMode.isNotEmpty) 'deliveryMode': query.deliveryMode,
    if (query.page > 1) 'page': '${query.page}',
    'pageSize': '$directoryPageSize',
  };
  final path = Uri(path: '/api/v1/directory', queryParameters: qs).toString();
  return DirectoryPage.fromJson(await ref.read(apiProvider).get<Map<String, dynamic>>(path, auth: false));
});

final providerProfileProvider = FutureProvider.autoDispose.family<ProviderPublic, String>(
  (ref, id) async => ProviderPublic.fromJson(await ref.read(apiProvider).get<Map<String, dynamic>>('/api/v1/providers/$id', auth: false)),
);

final organizationProvider = FutureProvider.autoDispose.family<OrganizationPublic, String>(
  (ref, id) async => OrganizationPublic.fromJson(await ref.read(apiProvider).get<Map<String, dynamic>>('/api/v1/organizations/$id', auth: false)),
);

/// شارة التوثيق الإداري — VerificationBadge في components/safety بالويب.
class VerificationChip extends ConsumerWidget {
  const VerificationChip({super.key, required this.verification});
  final Verification verification;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.t;
    final v = verification;
    final label = v.isValid ? (v.isConditional ? 'موثّق إدارياً (مشروط)' : 'موثّق إدارياً') : ref.read(contentProvider).label('verificationStatus.${v.status}');
    final chip = Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
      decoration: BoxDecoration(color: v.isValid ? t.successBg : t.surface2, borderRadius: BorderRadius.circular(Radii.full)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.check_rounded, size: 12, color: v.isValid ? t.success : t.muted),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: v.isValid ? t.success : t.muted),
          ),
        ],
      ),
    );
    return v.lastCheckedAtUtc == null ? chip : Tooltip(message: 'آخر تحقق: ${formatDate(v.lastCheckedAtUtc!)}', child: chip);
  }
}

class DirectoryScreen extends ConsumerStatefulWidget {
  const DirectoryScreen({super.key, this.initialTrack = ''});
  final String initialTrack;

  @override
  ConsumerState<DirectoryScreen> createState() => _DirectoryScreenState();
}

class _DirectoryScreenState extends ConsumerState<DirectoryScreen> {
  final _q = TextEditingController();
  late DirectoryQuery query = (q: '', track: widget.initialTrack, deliveryMode: '', page: 1);

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  void _set({String? q, String? track, String? deliveryMode, int page = 1}) =>
      setState(() => query = (q: q ?? query.q, track: track ?? query.track, deliveryMode: deliveryMode ?? query.deliveryMode, page: page));

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final content = ref.watch(contentProvider);
    final result = ref.watch(directoryProvider(query));

    return Scaffold(
      appBar: AppBar(),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(directoryProvider(query).future).catchError((_) => const DirectoryPage(items: [], page: 1, pageSize: 1, total: 0)),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
          children: [
            const DoorTabs(tabs: directoryDoorTabs, current: '/directory'),
            const PageHeader(title: 'الدليل', subtitle: 'جهات ومقدّمو خدمة موثّقون إدارياً. الترتيب من مطابقة بحثك وحالة التوثيق فقط — لا ترتيب مموَّل.'),
            SanadCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Semantics(
                    label: 'بحث',
                    child: TextField(
                      key: const ValueKey('directory-q'),
                      controller: _q,
                      textInputAction: TextInputAction.search,
                      onSubmitted: (v) => _set(q: v.trim()),
                      decoration: sanadInput(context, hint: 'ابحث باسم أو خدمة أو نطاق…'),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: _Choice(
                          semantic: 'المسار',
                          value: query.track,
                          options: [('', 'كل المسارات'), for (final k in directoryTracks) (k, content.label('track.$k'))],
                          onChanged: (v) => _set(track: v),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _Choice(
                          semantic: 'طريقة التقديم',
                          value: query.deliveryMode,
                          options: [('', 'أي طريقة'), ('Remote', content.label('deliveryMode.Remote')), ('InPerson', content.label('deliveryMode.InPerson'))],
                          onChanged: (v) => _set(deliveryMode: v),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  FilledButton(
                    key: const ValueKey('directory-search'),
                    onPressed: () => _set(q: _q.text.trim()),
                    child: const Text('بحث'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            result.when(
              skipLoadingOnReload: true,
              loading: () => const Loading(),
              error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(directoryProvider(query))),
              data: (page) => page.items.isEmpty
                  ? const EmptyState(title: 'لا نتائج مطابقة بعد', child: Text('جرّب كلمات أخرى أو أزل بعض عوامل التصفية.'))
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${page.total} نتيجة', style: TextStyle(fontSize: 14, color: t.muted)),
                        const SizedBox(height: 12),
                        for (final item in page.items)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: DirectoryCard(item: item),
                          ),
                        if (page.pages > 1)
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              OutlinedButton(
                                onPressed: query.page <= 1 ? null : () => _set(page: query.page - 1),
                                child: const Text('السابق'),
                              ),
                              Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 16),
                                child: Text('${query.page} / ${page.pages}', style: TextStyle(fontSize: 14, color: t.muted)),
                              ),
                              OutlinedButton(
                                onPressed: query.page >= page.pages ? null : () => _set(page: query.page + 1),
                                child: const Text('التالي'),
                              ),
                            ],
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

/// قائمة اختيار بنمط Select في الويب.
class _Choice extends StatelessWidget {
  const _Choice({required this.semantic, required this.value, required this.options, required this.onChanged});
  final String semantic;
  final String value;
  final List<(String, String)> options;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) => Semantics(
    label: semantic,
    child: DropdownButtonFormField<String>(
      initialValue: value,
      isExpanded: true,
      decoration: sanadInput(context),
      items: [
        for (final (v, l) in options)
          DropdownMenuItem(
            value: v,
            child: Text(l, overflow: TextOverflow.ellipsis),
          ),
      ],
      onChanged: (v) => onChanged(v ?? ''),
    ),
  );
}

class DirectoryCard extends ConsumerWidget {
  const DirectoryCard({super.key, required this.item});
  final DirectoryItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.t;
    final content = ref.read(contentProvider);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(Radii.x2l),
        onTap: () => context.push(item.path),
        child: SanadCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Semantics(
                          header: true,
                          child: Text(item.displayName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                        ),
                        if (item.title != null) Text(item.title!, style: TextStyle(fontSize: 14, color: t.muted)),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  VerificationChip(verification: item.verification),
                ],
              ),
              const SizedBox(height: 12),
              Text(item.summary, style: TextStyle(fontSize: 14, height: 1.75, color: t.muted)),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  SanadBadge(tone: 'primary', label: item.isOrganization ? 'جهة' : content.label('practitionerType.${item.practitionerType}')),
                  SanadBadge(label: content.label('track.${item.track}')),
                  if (item.deliveryMode != null) SanadBadge(label: content.label('deliveryMode.${item.deliveryMode}')),
                  if (item.city != null) SanadBadge(label: item.city!),
                  if (item.organizationName != null) SanadBadge(label: 'ضمن: ${item.organizationName}'),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ProviderScreen extends ConsumerWidget {
  const ProviderScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.t;
    final content = ref.watch(contentProvider);
    final signedIn = ref.watch(signedInProvider);
    final provider = ref.watch(providerProfileProvider(id));

    return Scaffold(
      appBar: AppBar(),
      body: provider.when(
        loading: () => const Loading(),
        error: (e, _) => ListView(
          padding: const EdgeInsets.all(16),
          children: [ErrorState(error: e, onRetry: () => ref.invalidate(providerProfileProvider(id)))],
        ),
        data: (p) => ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
          children: [
            SanadCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Semantics(
                    header: true,
                    child: Text(p.displayName, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
                  ),
                  Text(p.declaredTitle, style: TextStyle(color: t.muted)),
                  const SizedBox(height: 8),
                  VerificationChip(verification: p.verification),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      SanadBadge(tone: 'primary', label: content.label('practitionerType.${p.practitionerType}')),
                      SanadBadge(label: content.label('track.${p.track}')),
                      SanadBadge(label: content.label('deliveryMode.${p.deliveryMode}')),
                      if (p.city != null) SanadBadge(label: p.city!),
                      for (final l in p.languages) SanadBadge(label: l),
                    ],
                  ),
                  if (p.organizationName != null) ...[
                    const SizedBox(height: 12),
                    Wrap(
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        const Text('ضمن جهة: ', style: TextStyle(fontSize: 14)),
                        InkWell(
                          onTap: p.organizationId == null ? null : () => context.push('/organizations/${p.organizationId}'),
                          child: Text(
                            p.organizationName!,
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: t.primary),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 16),
            SanadCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('نطاق الممارسة', style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  Text(p.practiceScope, style: const TextStyle(height: 2)),
                  const SizedBox(height: 20),
                  const Text('حدود الممارسة المهنية', style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  Text(p.professionalBoundariesNote, style: TextStyle(height: 2, color: t.muted)),
                ],
              ),
            ),
            const SizedBox(height: 24),
            Semantics(
              header: true,
              child: const Text('الخدمات', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
            ),
            const SizedBox(height: 12),
            if (p.offerings.isEmpty)
              const EmptyState(title: 'لا خدمات منشورة بعد')
            else
              for (final o in p.offerings)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: SanadCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(o.category, style: const TextStyle(fontWeight: FontWeight.w700)),
                            ),
                            Text('${o.sessionDurationMinutes} دقيقة — مجانية', style: TextStyle(fontSize: 14, color: t.muted)),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(o.description, style: const TextStyle(height: 2)),
                        const SizedBox(height: 8),
                        Text('سياسة الإلغاء: ${o.cancellationPolicy}', style: TextStyle(fontSize: 14, color: t.muted)),
                        if (o.explicitExclusions.isNotEmpty)
                          Text('لا تشمل: ${o.explicitExclusions.join('، ')}', style: TextStyle(fontSize: 14, color: t.muted)),
                        const SizedBox(height: 12),
                        FilledButton(
                          key: ValueKey('book-${o.id}'),
                          onPressed: () => context.push(signedIn ? '/book/${p.id}?offering=${o.id}' : '/login'),
                          child: const Text('احجز موعداً'),
                        ),
                      ],
                    ),
                  ),
                ),
            const SizedBox(height: 12),
            SanadCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('قبل الحجز', style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  Text(
                    'التوثيق هنا إداري فقط. سند لا تقيّم كفاءة المختص ولا تعد بنتيجة. كل الخدمات في سند مجانية.',
                    style: TextStyle(fontSize: 14, height: 1.75, color: t.muted),
                  ),
                ],
              ),
            ),
            if (signedIn) ...[
              const SizedBox(height: 16),
              SanadCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('لاحظت مشكلة؟', style: TextStyle(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 8),
                    Text('انتحال صفة، ادعاء علاجي، أو طلب مال — أبلغنا.', style: TextStyle(fontSize: 14, color: t.muted)),
                    TextButton(
                      onPressed: () => context.push('/report?targetType=ProviderProfile&targetId=${p.id}'),
                      style: TextButton.styleFrom(padding: EdgeInsets.zero, foregroundColor: t.primary),
                      child: const Text('إبلاغ', style: TextStyle(fontWeight: FontWeight.w600)),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class OrganizationScreen extends ConsumerWidget {
  const OrganizationScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.t;
    final content = ref.watch(contentProvider);
    final org = ref.watch(organizationProvider(id));

    return Scaffold(
      appBar: AppBar(),
      body: org.when(
        loading: () => const Loading(),
        error: (e, _) => ListView(
          padding: const EdgeInsets.all(16),
          children: [ErrorState(error: e, onRetry: () => ref.invalidate(organizationProvider(id)))],
        ),
        data: (o) => ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
          children: [
            SanadCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Semantics(
                    header: true,
                    child: Text(o.displayName, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
                  ),
                  if (o.displayName != o.legalName) Text(o.legalName, style: TextStyle(color: t.muted)),
                  const SizedBox(height: 8),
                  VerificationChip(verification: o.verification),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      SanadBadge(tone: 'primary', label: content.label('track.${o.track}')),
                      if (o.city != null) SanadBadge(label: o.city!),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Text(o.publicDescription, style: const TextStyle(height: 2)),
                  if (o.verificationSourceUrl != null)
                    TextButton(
                      onPressed: () => ref.read(outboundProvider).openUrl(Uri.parse(o.verificationSourceUrl!)),
                      style: TextButton.styleFrom(padding: EdgeInsets.zero, foregroundColor: t.primary),
                      child: const Text('مصدر التحقق الرسمي', style: TextStyle(fontSize: 14, decoration: TextDecoration.underline)),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            Semantics(
              header: true,
              child: const Text('مقدّمو الخدمة في هذه الجهة', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
            ),
            const SizedBox(height: 12),
            if (o.providers.isEmpty)
              const EmptyState(title: 'لا مقدّمي خدمة منشورين بعد')
            else
              for (final p in o.providers)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: DirectoryCard(item: p),
                ),
          ],
        ),
      ),
    );
  }
}
