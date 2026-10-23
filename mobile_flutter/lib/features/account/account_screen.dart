import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/platform_services.dart';
import '../../core/push.dart';
import '../../core/session.dart';
import '../../theme/theme.dart';
import '../../ui/components.dart';
import '../care/booking_screens.dart';
import '../care/care_models.dart';
import '../care/chat_screens.dart';
import '../companion/companion_store.dart';
import '../privacy/local_data.dart';
import 'auth.dart';

/*
  «حسابي» — نظير DashboardPage وAccountPage في الويب بالنصوص نفسها: مواعيدك وتوصياتك، والبيانات الأساسية،
  والخصوصية، والموافقات، وسجل الاطلاع، وتصدير البيانات، وحذف الحساب داخل التطبيق (إرشاد Apple 5.1.1).
*/

typedef ConsentStatus = ({String type, bool accepted, String? acceptedVersion, bool needsReacceptance, String? acceptedAtUtc});
typedef ConsentHistoryItem = ({String type, String policyVersion, String acceptedAtUtc, String? revokedAtUtc});
typedef AccessLogEntry = ({String occurredAtUtc, String action, String actorRole});

final consentsProvider = FutureProvider.autoDispose<List<ConsentStatus>>((ref) async {
  final list = await ref.read(apiProvider).get<List<dynamic>>('/api/v1/me/consent');
  return [
    for (final c in list.cast<Map<String, dynamic>>())
      (
        type: c['type'] as String,
        accepted: c['accepted'] as bool,
        acceptedVersion: c['acceptedVersion'] as String?,
        needsReacceptance: c['needsReacceptance'] as bool? ?? false,
        acceptedAtUtc: c['acceptedAtUtc'] as String?,
      ),
  ];
});

final consentHistoryProvider = FutureProvider.autoDispose<List<ConsentHistoryItem>>((ref) async {
  final list = await ref.read(apiProvider).get<List<dynamic>>('/api/v1/me/consent/history');
  return [
    for (final h in list.cast<Map<String, dynamic>>())
      (
        type: h['type'] as String,
        policyVersion: h['policyVersion'] as String,
        acceptedAtUtc: h['acceptedAtUtc'] as String,
        revokedAtUtc: h['revokedAtUtc'] as String?,
      ),
  ];
});

final accessLogProvider = FutureProvider.autoDispose<List<AccessLogEntry>>((ref) async {
  final list = await ref.read(apiProvider).get<List<dynamic>>('/api/v1/me/access-log');
  return [
    for (final e in list.cast<Map<String, dynamic>>())
      (occurredAtUtc: e['occurredAtUtc'] as String, action: e['action'] as String, actorRole: e['actorRole'] as String),
  ];
});

/// الشروط والخصوصية لا تُسحب من الحساب (سحبها = حذف الحساب)؛ الباقي اختياري (isOptionalConsent).
bool isOptionalConsent(String type) => type == 'MarketingCommunication' || type == 'SensitiveDataProcessing';

String _friendly(Object e, String fallback) => e is ApiError ? e.friendly : fallback;

class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.t;
    final content = ref.watch(contentProvider);
    final signedIn = ref.watch(signedInProvider);
    final me = ref.watch(meProvider);
    final links = [
      (to: '/directory', label: content.label('nav.directory')),
      if (signedIn) ...[
        (to: '/bookings', label: content.label('nav.bookings')),
        (to: '/recommendations', label: content.label('nav.recommendations')),
        (to: '/notifications', label: content.label('nav.notifications')),
      ],
      (to: '/journal', label: 'مذكّرتي'),
      (to: '/privacy-mode', label: 'الخصوصية والتمويه'),
    ];

    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(meProvider);
          ref.invalidate(myBookingsProvider);
          ref.invalidate(recommendationsProvider);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 120),
          children: [
            PageHeader(title: content.label('nav.account'), subtitle: signedIn ? me.value?.roles.map((r) => content.label('role.$r')).join(' · ') : null),
            if (!signedIn)
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  gradient: t.dawn,
                  borderRadius: BorderRadius.circular(Radii.x3l),
                  border: Border.all(color: t.border),
                ),
                child: Column(
                  children: [
                    const Text(
                      'حسابك اختياري',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'ادخل بحساب جوجل لتحفظ وِردك وتتابع حجوزاتك من أي جهاز.',
                      textAlign: TextAlign.center,
                      style: TextStyle(height: 1.75, color: t.muted),
                    ),
                    const SizedBox(height: 16),
                    FilledButton(key: const ValueKey('login'), onPressed: () => context.push('/login'), child: Text(content.label('nav.login'))),
                  ],
                ),
              )
            else
              me.when(
                loading: () => const Loading(),
                error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(meProvider)),
                data: (p) => p == null ? const SizedBox.shrink() : _SignedInSections(me: p),
              ),
            const SizedBox(height: 16),
            for (final l in links)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: OutlinedButton(key: ValueKey('link-${l.to}'), onPressed: () => context.push(l.to), child: Text(l.label)),
              ),
            if (signedIn) ...[
              const SizedBox(height: 8),
              TextButton(
                key: const ValueKey('logout'),
                onPressed: () => ref.read(authProvider).signOut(),
                style: TextButton.styleFrom(foregroundColor: t.danger),
                child: Text(content.label('nav.logout')),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _SignedInSections extends StatelessWidget {
  const _SignedInSections({required this.me});
  final MyProfile me;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const _Upcoming(),
      const SizedBox(height: 16),
      // المفتاح بالمعرّف: حساب آخر بعد خروج ودخول يبدأ بقيمه هو
      _BasicInfo(key: ValueKey('basic-${me.id}'), me: me),
      const SizedBox(height: 16),
      _PrivacyPreferences(key: ValueKey('privacy-${me.id}'), me: me),
      const SizedBox(height: 16),
      const _Consents(),
      const SizedBox(height: 16),
      const _AccessLog(),
      const SizedBox(height: 16),
      const _ExportData(),
      const SizedBox(height: 16),
      const _DeleteAccount(),
    ],
  );
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children, this.danger = false});
  final String title;
  final List<Widget> children;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(Radii.x2l),
        border: Border.all(color: danger ? t.danger.withValues(alpha: 0.4) : t.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            header: true,
            child: Text(
              title,
              style: TextStyle(fontWeight: FontWeight.w700, color: danger ? t.danger : null),
            ),
          ),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    );
  }
}

/// مواعيدك القادمة وتوصياتك الجديدة — من DashboardPage في الويب.
class _Upcoming extends ConsumerWidget {
  const _Upcoming();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.t;
    final now = DateTime.now();
    final upcoming = (ref.watch(myBookingsProvider).value ?? const <BookingSummary>[])
        .where((b) => DateTime.parse(b.slotStartUtc).isAfter(now) && b.status != 'Cancelled' && b.status != 'Rejected')
        .take(3)
        .toList();
    final unread = (ref.watch(recommendationsProvider).value ?? const <Recommendation>[]).where((r) => r.acknowledgedAtUtc == null).length;
    return _Section(
      title: 'مواعيدك القادمة',
      children: [
        if (upcoming.isEmpty)
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text('لا مواعيد قادمة. ', style: TextStyle(color: t.muted)),
              TapTarget(
                onTap: () => context.push('/directory'),
                child: Semantics(
                  link: true,
                  child: Text(
                    'تصفّح الدليل',
                    style: TextStyle(color: t.primary, decoration: TextDecoration.underline),
                  ),
                ),
              ),
            ],
          )
        else
          for (final b in upcoming)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: BookingRow(booking: b),
            ),
        const SizedBox(height: 8),
        Text(unread > 0 ? 'لديك $unread توصية جديدة من مختصك.' : 'لا توصيات جديدة.', style: TextStyle(color: t.muted)),
      ],
    );
  }
}

class _BasicInfo extends ConsumerStatefulWidget {
  const _BasicInfo({super.key, required this.me});
  final MyProfile me;

  @override
  ConsumerState<_BasicInfo> createState() => _BasicInfoState();
}

class _BasicInfoState extends ConsumerState<_BasicInfo> {
  late final _name = TextEditingController(text: widget.me.displayName);
  bool busy = false;
  ({bool ok, String text})? message;

  @override
  void initState() {
    super.initState();
    _name.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      busy = true;
      message = null;
    });
    try {
      await ref.read(apiProvider).patch<Object?>('/api/v1/me', body: {'displayName': _name.text.trim()});
      ref.invalidate(meProvider);
      if (mounted) setState(() => message = (ok: true, text: 'تم الحفظ.'));
    } catch (e) {
      if (mounted) setState(() => message = (ok: false, text: _friendly(e, 'تعذّر الحفظ')));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final me = widget.me;
    final name = _name.text.trim();
    return _Section(
      title: 'البيانات الأساسية',
      children: [
        const Text('الاسم الظاهر', style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        TextField(
          key: const ValueKey('display-name'),
          controller: _name,
          maxLength: 100,
          decoration: sanadInput(context).copyWith(counterText: ''),
        ),
        const SizedBox(height: 4),
        Text('هو ما يراه المختصون والمنسقون في حجوزاتك.', style: TextStyle(fontSize: 12, color: t.muted)),
        if (me.email != null) ...[
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Text(
                  me.email!,
                  textDirection: TextDirection.ltr,
                  style: TextStyle(color: t.muted),
                ),
              ),
              SanadBadge(tone: me.emailConfirmed ? 'success' : 'warning', label: me.emailConfirmed ? 'موثّق' : 'غير موثّق'),
            ],
          ),
        ],
        if (me.phoneNumber != null) Text('رقم الجوال: ${me.phoneNumber}', style: TextStyle(fontSize: 14, color: t.muted)),
        if (message != null) ...[const SizedBox(height: 12), SanadBanner(tone: message!.ok ? 'success' : 'danger', child: Text(message!.text))],
        const SizedBox(height: 12),
        FilledButton(key: const ValueKey('save-name'), onPressed: name.isEmpty || name == me.displayName || busy ? null : _save, child: const Text('حفظ')),
      ],
    );
  }
}

class _PrivacyPreferences extends ConsumerStatefulWidget {
  const _PrivacyPreferences({super.key, required this.me});
  final MyProfile me;

  @override
  ConsumerState<_PrivacyPreferences> createState() => _PrivacyPreferencesState();
}

class _PrivacyPreferencesState extends ConsumerState<_PrivacyPreferences> {
  late bool hideIdentity = widget.me.hideIdentityUntilBookingConfirmed;
  late int? start = widget.me.quietHoursStartHourUtc;
  late int? end = widget.me.quietHoursEndHourUtc;
  bool busy = false;
  ({bool ok, String text})? message;

  bool get dirty =>
      hideIdentity != widget.me.hideIdentityUntilBookingConfirmed || start != widget.me.quietHoursStartHourUtc || end != widget.me.quietHoursEndHourUtc;

  Future<void> _save() async {
    setState(() {
      busy = true;
      message = null;
    });
    try {
      await ref
          .read(apiProvider)
          .patch<Object?>(
            '/api/v1/me/privacy-preferences',
            body: {'hideIdentityUntilBookingConfirmed': hideIdentity, 'quietHoursStartHourUtc': start, 'quietHoursEndHourUtc': end},
          );
      ref.invalidate(meProvider);
      if (mounted) setState(() => message = (ok: true, text: 'تم حفظ تفضيلات الخصوصية.'));
    } catch (e) {
      if (mounted) setState(() => message = (ok: false, text: _friendly(e, 'تعذّر الحفظ')));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget _hour(int value, ValueChanged<int> onChanged, String semantic) => Semantics(
    label: semantic,
    child: DropdownButton<int>(
      value: value,
      items: [for (var h = 0; h < 24; h++) DropdownMenuItem(value: h, child: Text('${h.toString().padLeft(2, '0')}:00'))],
      onChanged: (v) => setState(() => onChanged(v ?? value)),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final quiet = start != null && end != null;
    return _Section(
      title: 'الخصوصية',
      children: [
        SanadCheck(
          key: const ValueKey('hide-identity'),
          value: hideIdentity,
          onChanged: (v) => setState(() => hideIdentity = v),
          label: 'إخفاء اسمي عن المختص حتى تأكيد الحجز',
          hint: 'يظهر اسمك للمختص باسم «مستفيد» إلى أن يقبل طلب حجزك، ثم يظهر اسمك الحقيقي.',
        ),
        SanadCheck(
          key: const ValueKey('quiet-hours'),
          value: quiet,
          onChanged: (v) => setState(() {
            start = v ? (start ?? 22) : null;
            end = v ? (end ?? 7) : null;
          }),
          label: 'ساعات هدوء (بتوقيت UTC)',
          hint: 'لا تصلك خلالها إشعارات غير عاجلة عبر القنوات الخارجية.',
        ),
        if (quiet)
          Padding(
            padding: const EdgeInsetsDirectional.only(start: 28),
            child: Row(
              children: [
                _hour(start!, (v) => start = v, 'بداية ساعات الهدوء'),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Text('إلى', style: TextStyle(fontSize: 14, color: t.muted)),
                ),
                _hour(end!, (v) => end = v, 'نهاية ساعات الهدوء'),
              ],
            ),
          ),
        if (message != null) ...[const SizedBox(height: 12), SanadBanner(tone: message!.ok ? 'success' : 'danger', child: Text(message!.text))],
        const SizedBox(height: 12),
        FilledButton(key: const ValueKey('save-privacy'), onPressed: dirty && !busy ? _save : null, child: const Text('حفظ تفضيلات الخصوصية')),
      ],
    );
  }
}

class _Consents extends ConsumerStatefulWidget {
  const _Consents();

  @override
  ConsumerState<_Consents> createState() => _ConsentsState();
}

class _ConsentsState extends ConsumerState<_Consents> {
  String? busy;
  bool showHistory = false;

  Future<void> _toggle(ConsentStatus c) async {
    setState(() => busy = c.type);
    try {
      final api = ref.read(apiProvider);
      c.accepted ? await api.del<Object?>('/api/v1/me/consent/${c.type}') : await api.post<Object?>('/api/v1/me/consent', body: {'type': c.type});
      ref.invalidate(consentsProvider);
      ref.invalidate(consentHistoryProvider);
    } catch (_) {
      // كالويب: تبقى الحالة كما هي
    } finally {
      if (mounted) setState(() => busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final content = ref.watch(contentProvider);
    final consents = ref.watch(consentsProvider);
    return _Section(
      title: 'الموافقات',
      children: [
        consents.when(
          loading: () => const Loading(),
          error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(consentsProvider)),
          data: (list) => Column(
            children: [
              for (final c in list)
                Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(color: t.surface2, borderRadius: BorderRadius.circular(Radii.xl)),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Wrap(
                              spacing: 6,
                              crossAxisAlignment: WrapCrossAlignment.center,
                              children: [
                                Text(content.label('consent.${c.type}')),
                                if (c.needsReacceptance) const SanadBadge(tone: 'lamp', label: 'إصدار جديد'),
                              ],
                            ),
                            if (c.accepted && c.acceptedAtUtc != null)
                              Text(
                                'وافقتَ على الإصدار ${c.acceptedVersion} بتاريخ ${formatDate(c.acceptedAtUtc!)}',
                                style: TextStyle(fontSize: 12, color: t.muted),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      if (isOptionalConsent(c.type))
                        OutlinedButton(
                          key: ValueKey('consent-${c.type}'),
                          onPressed: busy == null ? () => _toggle(c) : null,
                          child: Text(c.accepted ? 'سحب الموافقة' : 'موافقة'),
                        )
                      else
                        SanadBadge(tone: c.accepted ? 'success' : 'warning', label: c.accepted ? 'موافق' : 'مطلوبة'),
                    ],
                  ),
                ),
            ],
          ),
        ),
        TextButton(
          key: const ValueKey('consent-history'),
          onPressed: () => setState(() => showHistory = !showHistory),
          style: TextButton.styleFrom(padding: EdgeInsets.zero, foregroundColor: t.primary),
          child: Text(
            showHistory ? 'إخفاء سجل الموافقات السابقة' : 'عرض سجل الموافقات السابقة',
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
          ),
        ),
        if (showHistory)
          ref
              .watch(consentHistoryProvider)
              .when(
                loading: () => const Loading(),
                error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(consentHistoryProvider)),
                data: (list) => list.isEmpty
                    ? Text('لا سجل سابق.', style: TextStyle(fontSize: 14, color: t.muted))
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          for (final h in list)
                            Text(
                              '${content.label('consent.${h.type}')} — الإصدار ${h.policyVersion} — ${formatDateTime(h.acceptedAtUtc)}'
                              '${h.revokedAtUtc == null ? '' : ' (سُحبت بتاريخ ${formatDateTime(h.revokedAtUtc!)})'}',
                              style: TextStyle(fontSize: 12, color: t.muted),
                            ),
                        ],
                      ),
              ),
      ],
    );
  }
}

class _AccessLog extends ConsumerWidget {
  const _AccessLog();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.t;
    final labels = ref.watch(contentProvider).account;
    final log = ref.watch(accessLogProvider);
    return _Section(
      title: 'من اطّلع على بياناتك؟',
      children: [
        Text('سجل شفاف بكل مرة اطّلع فيها مختص أو منسق أو مشرف على ملاحظاتك أو ملف حجزك.', style: TextStyle(fontSize: 14, color: t.muted)),
        const SizedBox(height: 12),
        log.when(
          loading: () => const Loading(),
          error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(accessLogProvider)),
          data: (list) => list.isEmpty
              ? Text('لا أحد اطّلع على بياناتك حتى الآن.', style: TextStyle(fontSize: 14, color: t.muted))
              : Column(
                  children: [
                    for (final e in list)
                      Container(
                        width: double.infinity,
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        decoration: BoxDecoration(color: t.surface2, borderRadius: BorderRadius.circular(Radii.xl)),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(labels.accessLogActions[e.action] ?? e.action, style: const TextStyle(fontSize: 14)),
                            Text(
                              '${labels.accessLogRoles[e.actorRole] ?? e.actorRole} — ${formatDateTime(e.occurredAtUtc)}',
                              style: TextStyle(fontSize: 12, color: t.muted),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}

class _ExportData extends ConsumerStatefulWidget {
  const _ExportData();

  @override
  ConsumerState<_ExportData> createState() => _ExportDataState();
}

class _ExportDataState extends ConsumerState<_ExportData> {
  bool busy = false;
  String? error;

  /// نسخة JSON من كل البيانات تُسلَّم لورقة المشاركة في النظام (حفظ في الملفات أو إرسال) — downloadJson في الويب.
  Future<void> _export() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final data = await ref.read(apiProvider).post<Object?>('/api/v1/me/export');
      final bytes = Uint8List.fromList(utf8.encode(const JsonEncoder.withIndent('  ').convert(data)));
      await ref.read(outboundProvider).shareFile(bytes, name: 'sanad-my-data.json', mimeType: 'application/json');
    } catch (e) {
      if (mounted) setState(() => error = _friendly(e, 'تعذّر التصدير.'));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => _Section(
    title: 'بياناتي',
    children: [
      Text('نزّل نسخة من كل بياناتك في سند (JSON).', style: TextStyle(fontSize: 14, color: context.t.muted)),
      if (error != null) ...[const SizedBox(height: 12), SanadBanner(tone: 'danger', child: Text(error!))],
      const SizedBox(height: 12),
      OutlinedButton(
        key: const ValueKey('export'),
        onPressed: busy ? null : _export,
        child: busy ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('تصدير بياناتي'),
      ),
    ],
  );
}

class _DeleteAccount extends ConsumerStatefulWidget {
  const _DeleteAccount();

  @override
  ConsumerState<_DeleteAccount> createState() => _DeleteAccountState();
}

class _DeleteAccountState extends ConsumerState<_DeleteAccount> {
  final _confirm = TextEditingController();
  bool busy = false;
  String? error;

  @override
  void initState() {
    super.initState();
    _confirm.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _confirm.dispose();
    super.dispose();
  }

  /// حذف نهائي على الخادم (ADR-0005)، ثم مسح الجلسة وكل بيانات سند من هذا الجهاز (المذكّرة والتقدّم والتذكيرات).
  Future<void> _delete() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      // الخادم يحذف رموز الأجهزة مع الحساب؛ نبطله هنا أيضاً قبل أن تنتهي الجلسة
      await ref.read(pushRegistrationProvider).unregister();
      await ref.read(apiProvider).del<Object?>('/api/v1/me', body: {'confirmation': _confirm.text});
      // المسح قبل إنهاء الجلسة: إنهاؤها يُخرج هذا القسم من الشاشة
      await wipeLocalData(ref);
      if (!mounted) return;
      final router = GoRouter.of(context);
      ref.read(sessionProvider.notifier).clear();
      router.go('/today');
    } catch (e) {
      if (mounted) setState(() => error = _friendly(e, 'تعذّر الحذف'));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final phrase = ref.watch(contentProvider).account.deleteConfirmation;
    return _Section(
      title: 'حذف الحساب',
      danger: true,
      children: [
        Text(
          'تُحذف بياناتك الشخصية نهائياً، وتُجرَّد السجلات المرتبطة (حجوزات، توصيات مستلمة) من هويتك دون حذف أثرها الإداري. '
          'وتُمسح بيانات سند من هذا الجهاز أيضاً (المذكّرة والتقدّم والتذكيرات). لا يمكن التراجع.',
          style: TextStyle(fontSize: 14, height: 1.75, color: t.muted),
        ),
        const SizedBox(height: 12),
        Text('اكتب «$phrase» للتأكيد', style: const TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        TextField(key: const ValueKey('delete-confirm'), controller: _confirm, decoration: sanadInput(context)),
        if (error != null) ...[const SizedBox(height: 12), SanadBanner(tone: 'danger', child: Text(error!))],
        const SizedBox(height: 12),
        FilledButton(
          key: const ValueKey('delete-account'),
          style: FilledButton.styleFrom(backgroundColor: t.danger, foregroundColor: t.primaryContrast),
          onPressed: _confirm.text == phrase && !busy ? _delete : null,
          child: busy ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('حذف حسابي نهائياً'),
        ),
      ],
    );
  }
}
