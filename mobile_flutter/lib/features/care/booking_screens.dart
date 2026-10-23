import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/session.dart';
import '../../theme/theme.dart';
import '../../ui/components.dart';
import '../companion/companion_store.dart';
import 'care_models.dart';
import 'directory_screens.dart';

/*
  الحجز وحجوزاتي وتفاصيل الحجز — نظير frontend/src/features/booking/{BookPage,BookingPages}.tsx بالنصوص نفسها.
  «ملاحظتك للمختص» اختيارية ومشفّرة، بلا أي حركة زخرفية (13 §13.4)، ومفتاح تكرار ثابت لكل محاولة إرسال.
*/

const maxBookingNote = 2000;

final availabilityProvider = FutureProvider.autoDispose.family<List<Slot>, String>((ref, providerId) async {
  final list = await ref.read(apiProvider).get<List<dynamic>>('/api/v1/providers/$providerId/availability');
  return [for (final s in list) Slot.fromJson(s as Map<String, dynamic>)];
});

final myBookingsProvider = FutureProvider.autoDispose<List<BookingSummary>>((ref) async {
  final list = await ref.read(apiProvider).get<List<dynamic>>('/api/v1/me/bookings');
  return [for (final b in list) BookingSummary.fromJson(b as Map<String, dynamic>)];
});

final bookingProvider = FutureProvider.autoDispose.family<BookingSummary, String>(
  (ref, id) async => BookingSummary.fromJson(await ref.read(apiProvider).get<Map<String, dynamic>>('/api/v1/bookings/$id')),
);

final bookingNoteProvider = FutureProvider.autoDispose.family<String?, String>((ref, id) async {
  final j = await ref.read(apiProvider).get<Map<String, dynamic>>('/api/v1/bookings/$id/note');
  return j['note'] as String?;
});

String _friendly(Object e, String fallback) => e is ApiError ? e.friendly : fallback;

class BookScreen extends ConsumerStatefulWidget {
  const BookScreen({super.key, required this.providerId, this.offeringId});
  final String providerId;
  final String? offeringId;

  @override
  ConsumerState<BookScreen> createState() => _BookScreenState();
}

class _BookScreenState extends ConsumerState<BookScreen> {
  late String offeringId = widget.offeringId ?? '';
  String slotId = '';
  bool consent = false;
  bool busy = false;
  String? error;
  String idempotencyKey = newIdempotencyKey();
  final _note = TextEditingController();

  @override
  void initState() {
    super.initState();
    _note.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      busy = true;
      error = null;
    });
    final note = _note.text.trim();
    try {
      final res = await ref
          .read(apiProvider)
          .post<Map<String, dynamic>>(
            '/api/v1/bookings',
            body: {
              'serviceOfferingId': offeringId,
              'availabilitySlotId': slotId,
              'beneficiaryNote': note.isEmpty ? null : note,
              'consentToSensitiveNoteProcessing': consent,
            },
            headers: {'Idempotency-Key': idempotencyKey},
          );
      ref.invalidate(myBookingsProvider);
      if (mounted) context.pushReplacement('/bookings/${res['id']}');
    } catch (e) {
      if (!mounted) return;
      setState(() {
        error = _friendly(e, 'تعذّر إرسال الطلب.');
        // الموعد أُخذ: تحديث المواعيد ومفتاح جديد للمحاولة التالية
        if (e is ApiError && e.status == 409) {
          ref.invalidate(availabilityProvider(widget.providerId));
          slotId = '';
          idempotencyKey = newIdempotencyKey();
        }
      });
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final provider = ref.watch(providerProfileProvider(widget.providerId));
    final slots = ref.watch(availabilityProvider(widget.providerId));
    final hasNote = _note.text.trim().isNotEmpty;
    final canSubmit = offeringId.isNotEmpty && slotId.isNotEmpty && (!hasNote || consent);

    return Scaffold(
      appBar: AppBar(),
      body: provider.when(
        loading: () => const Loading(),
        error: (e, _) => ListView(
          padding: const EdgeInsets.all(16),
          children: [ErrorState(error: e, onRetry: () => ref.invalidate(providerProfileProvider(widget.providerId)))],
        ),
        data: (p) {
          // خدمة من رابط لم تعد منشورة: لا تُختار ضمناً
          final validOffering = p.offerings.any((o) => o.id == offeringId) ? offeringId : null;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
            children: [
              PageHeader(title: 'حجز موعد مع ${p.displayName}', subtitle: 'الخدمة مجانية بالكامل. سيراجع المختص طلبك ويؤكده أو يقترح موعداً بديلاً.'),
              SanadCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text('الخدمة', style: TextStyle(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      key: const ValueKey('offering'),
                      initialValue: validOffering,
                      isExpanded: true,
                      hint: const Text('اختر خدمة'),
                      decoration: sanadInput(context),
                      items: [
                        for (final o in p.offerings)
                          DropdownMenuItem(
                            value: o.id,
                            child: Text('${o.category} — ${o.sessionDurationMinutes} دقيقة', overflow: TextOverflow.ellipsis),
                          ),
                      ],
                      onChanged: (v) => setState(() => offeringId = v ?? ''),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              SanadCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('الموعد', style: TextStyle(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 12),
                    slots.when(
                      loading: () => const Loading(),
                      error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(availabilityProvider(widget.providerId))),
                      data: (list) {
                        if (list.isEmpty) {
                          return const EmptyState(title: 'لا مواعيد متاحة حالياً', child: Text('عُد لاحقاً — يضيف المختصون مواعيدهم دورياً.'));
                        }
                        final days = <String, List<Slot>>{};
                        for (final s in list) {
                          days.putIfAbsent(formatDay(s.startUtc), () => []).add(s);
                        }
                        return Semantics(
                          label: 'المواعيد المتاحة',
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              for (final MapEntry(key: day, value: daySlots) in days.entries) ...[
                                Text(
                                  day,
                                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: t.muted),
                                ),
                                const SizedBox(height: 8),
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: [
                                    for (final s in daySlots) _SlotButton(slot: s, selected: slotId == s.id, onTap: () => setState(() => slotId = s.id)),
                                  ],
                                ),
                                const SizedBox(height: 16),
                              ],
                            ],
                          ),
                        );
                      },
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              SanadCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text('ملاحظتك للمختص (اختيارية)', style: TextStyle(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    TextField(
                      key: const ValueKey('booking-note'),
                      controller: _note,
                      maxLength: maxBookingNote,
                      minLines: 4,
                      maxLines: 8,
                      decoration: sanadInput(context, hint: 'ما الذي تودّ أن يعرفه المختص قبل الموعد؟').copyWith(counterText: ''),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'تُحفظ مشفّرة، ولا يراها إلا المختص المُسنَد لهذا الحجز. ${_note.text.length}/$maxBookingNote',
                      style: TextStyle(fontSize: 12, color: t.muted),
                    ),
                    if (hasNote) ...[
                      const SizedBox(height: 12),
                      SanadCheck(
                        key: const ValueKey('consent'),
                        value: consent,
                        onChanged: (v) => setState(() => consent = v),
                        label:
                            'أوافق على معالجة هذه الملاحظة الحساسة (تُشفَّر ولا يطّلع عليها إلا المختص المُسنَد، أو فريق التنسيق عند تصعيد بلاغ مرتبط بالحجز).',
                      ),
                    ],
                  ],
                ),
              ),
              if (error != null) ...[const SizedBox(height: 16), SanadBanner(tone: 'danger', child: Text(error!))],
              const SizedBox(height: 16),
              Wrap(
                spacing: 12,
                runSpacing: 8,
                children: [
                  FilledButton(
                    key: const ValueKey('submit-booking'),
                    onPressed: canSubmit && !busy ? _submit : null,
                    child: busy ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('إرسال طلب الحجز'),
                  ),
                  TextButton(onPressed: () => context.pop(), child: const Text('رجوع')),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}

class _SlotButton extends StatelessWidget {
  const _SlotButton({required this.slot, required this.selected, required this.onTap});
  final Slot slot;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    return Semantics(
      inMutuallyExclusiveGroup: true,
      checked: selected,
      button: true,
      child: Material(
        color: selected ? t.primary : t.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(Radii.xl),
          side: BorderSide(color: selected ? t.primary : t.border),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(Radii.xl),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Text(formatTime(slot.startUtc), style: TextStyle(fontSize: 14, color: selected ? t.primaryContrast : t.text)),
          ),
        ),
      ),
    );
  }
}

class MyBookingsScreen extends ConsumerWidget {
  const MyBookingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bookings = ref.watch(myBookingsProvider);
    return Scaffold(
      appBar: AppBar(
        actions: [
          Padding(
            padding: const EdgeInsetsDirectional.only(end: 12),
            child: FilledButton(onPressed: () => context.push('/directory'), child: const Text('حجز جديد')),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(myBookingsProvider.future).catchError((_) => <BookingSummary>[]),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
          children: [
            PageHeader(title: ref.read(contentProvider).label('nav.bookings')),
            bookings.when(
              loading: () => const Loading(),
              error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(myBookingsProvider)),
              data: (list) => list.isEmpty
                  ? const EmptyState(title: 'لا حجوزات بعد', child: Text('ابدأ من الدليل واختر من يناسبك.'))
                  : Column(
                      children: [
                        for (final b in list)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: BookingRow(booking: b),
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

/// سطر حجز: المختص والخدمة والموعد والحالة — في حجوزاتي ومواعيدك القادمة.
class BookingRow extends ConsumerWidget {
  const BookingRow({super.key, required this.booking});
  final BookingSummary booking;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.t;
    final b = booking;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(Radii.x2l),
        onTap: () => context.push('/bookings/${b.id}'),
        child: SanadCard(
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(b.providerDisplayName, style: const TextStyle(fontWeight: FontWeight.w700)),
                    Text('${b.serviceCategory} — ${formatDateTime(b.slotStartUtc)}', style: TextStyle(fontSize: 14, color: t.muted)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              SanadBadge(tone: statusTone(b.status), label: ref.read(contentProvider).label('bookingStatus.${b.status}')),
            ],
          ),
        ),
      ),
    );
  }
}

class BookingDetailScreen extends ConsumerStatefulWidget {
  const BookingDetailScreen({super.key, required this.id});
  final String id;

  @override
  ConsumerState<BookingDetailScreen> createState() => _BookingDetailScreenState();
}

class _BookingDetailScreenState extends ConsumerState<BookingDetailScreen> {
  String? busy;
  String? error;

  Future<void> _run(String action, Future<void> Function() body, String fallback) async {
    setState(() {
      busy = action;
      error = null;
    });
    try {
      await body();
    } catch (e) {
      if (mounted) setState(() => error = _friendly(e, fallback));
    } finally {
      if (mounted) setState(() => busy = null);
    }
  }

  Future<void> _act(String action) => _run(action, () async {
    await ref.read(apiProvider).post<Object?>('/api/v1/bookings/${widget.id}/$action');
    ref.invalidate(bookingProvider(widget.id));
    ref.invalidate(myBookingsProvider);
  }, 'تعذّر تنفيذ الطلب.');

  Future<void> _openChat() => _run('chat', () async {
    final c = await ref.read(apiProvider).post<Map<String, dynamic>>('/api/v1/bookings/${widget.id}/conversation');
    if (mounted) context.push('/conversations/${c['id']}');
  }, 'تعذّر فتح المحادثة.');

  Future<void> _confirmCancel() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        content: const Text('هل تريد إلغاء هذا الحجز؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('تراجع')),
          FilledButton(key: const ValueKey('confirm-cancel'), onPressed: () => Navigator.pop(context, true), child: const Text('إلغاء الحجز')),
        ],
      ),
    );
    if (ok == true) await _act('cancel');
  }

  Widget _busyLabel(String action, String label) =>
      busy == action ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : Text(label);

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final content = ref.watch(contentProvider);
    final booking = ref.watch(bookingProvider(widget.id));

    return Scaffold(
      appBar: AppBar(),
      body: booking.when(
        loading: () => const Loading(),
        error: (e, _) => ListView(
          padding: const EdgeInsets.all(16),
          children: [ErrorState(error: e, onRetry: () => ref.invalidate(bookingProvider(widget.id)))],
        ),
        data: (b) {
          final note = ref.watch(bookingNoteProvider(widget.id));
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(bookingProvider(widget.id)),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
              children: [
                PageHeader(title: 'حجز مع ${b.providerDisplayName}', subtitle: formatDateTime(b.slotStartUtc)),
                SanadCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // سطر واحد عادةً؛ مع الخط الكبير تنزل الحالة تحت الخدمة بدل أن تخرج من الشاشة
                      Wrap(
                        alignment: WrapAlignment.spaceBetween,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        spacing: 8,
                        runSpacing: 4,
                        children: [
                          Text(b.serviceCategory, style: const TextStyle(fontWeight: FontWeight.w700)),
                          SanadBadge(tone: statusTone(b.status), label: content.label('bookingStatus.${b.status}')),
                        ],
                      ),
                      if (b.status == 'AlternativeProposed') ...[
                        const SizedBox(height: 12),
                        SanadBanner(tone: 'lamp', title: 'اقترح المختص موعداً بديلاً', child: Text('الموعد الجديد: ${formatDateTime(b.slotStartUtc)}')),
                      ],
                      if (b.administrativeReasonForRejection != null) ...[
                        const SizedBox(height: 12),
                        Text('السبب الإداري: ${b.administrativeReasonForRejection}', style: TextStyle(fontSize: 14, color: t.muted)),
                      ],
                      if (error != null) ...[const SizedBox(height: 12), SanadBanner(tone: 'danger', child: Text(error!))],
                      const SizedBox(height: 16),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          if (b.status == 'AlternativeProposed')
                            FilledButton(
                              key: const ValueKey('accept'),
                              onPressed: busy == null ? () => _act('accept') : null,
                              child: _busyLabel('accept', 'قبول الموعد البديل'),
                            ),
                          if (b.chatOpen)
                            OutlinedButton(
                              key: const ValueKey('open-chat'),
                              onPressed: busy == null ? _openChat : null,
                              child: _busyLabel('chat', 'المحادثة الإدارية'),
                            ),
                          if (b.cancellable)
                            TextButton(
                              key: const ValueKey('cancel'),
                              onPressed: busy == null ? _confirmCancel : null,
                              child: _busyLabel('cancel', 'إلغاء الحجز'),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                SanadCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('ملاحظتي للمختص', style: TextStyle(fontWeight: FontWeight.w700)),
                      Text('مشفّرة — لا يراها إلا المختص المُسنَد.', style: TextStyle(fontSize: 12, color: t.muted)),
                      const SizedBox(height: 12),
                      note.when(
                        loading: () => const SizedBox.shrink(),
                        error: (_, _) => Text('تعذّر عرض الملاحظة.', style: TextStyle(color: t.muted)),
                        data: (n) => n == null ? Text('لم تكتب ملاحظة.', style: TextStyle(color: t.muted)) : Text(n, style: const TextStyle(height: 2)),
                      ),
                    ],
                  ),
                ),
                if (b.confirmed) ...[
                  const SizedBox(height: 16),
                  TextButton(
                    onPressed: () => context.push('/recommendations'),
                    style: TextButton.styleFrom(foregroundColor: t.primary, alignment: AlignmentDirectional.centerStart),
                    child: const Text('توصيات مختصك تظهر في صفحة «توصياتي» ←', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}
