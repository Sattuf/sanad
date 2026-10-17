import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/platform_services.dart';
import '../../theme/theme.dart';
import '../../ui/components.dart';
import '../privacy/discreet.dart';
import 'companion_store.dart';

/*
  «ذكّرني كل يوم» — نظير Reminders في ProgramPages.tsx بالأوقات نفسها.
  الويب يضيف حدثاً لتقويم الهاتف؛ هنا إشعار محلي يجدوله النظام، فيصل والتطبيق مغلق وبلا شبكة.
  العنوان محايد عمداً «وِرد اليوم» حتى لا يكشف شيئاً على شاشة القفل.
*/
typedef ReminderSlot = ({String id, int notificationId, int hour, int minute, String label});

const reminderSlots = <ReminderSlot>[
  (id: 'morning', notificationId: 1, hour: 6, minute: 30, label: 'صباحاً ٦:٣٠'),
  (id: 'evening', notificationId: 2, hour: 17, minute: 30, label: 'مساءً ٥:٣٠'),
  (id: 'night', notificationId: 3, hour: 22, minute: 0, label: 'قبل النوم ١٠:٠٠'),
];

const remindersKey = 'sanad.reminders';

class RemindersNotifier extends Notifier<Set<String>> {
  @override
  Set<String> build() {
    final raw = ref.read(prefsProvider).getString(remindersKey);
    try {
      return raw == null ? {} : (jsonDecode(raw) as List).cast<String>().toSet();
    } catch (_) {
      return {};
    }
  }

  /// يشغّل التذكير أو يلغيه. يعيد false إن رفض المستخدم إذن الإشعارات.
  Future<bool> toggle(ReminderSlot slot) async {
    final scheduler = ref.read(reminderSchedulerProvider);
    if (state.contains(slot.id)) {
      await scheduler.cancel(slot.notificationId);
      await _save({...state}..remove(slot.id));
      return true;
    }
    if (!await scheduler.requestPermission()) return false;
    await scheduler.scheduleDaily(slot.notificationId, slot.hour, slot.minute, neutral: ref.read(discreetProvider));
    await _save({...state, slot.id});
    return true;
  }

  /// يعيد جدولة التذكيرات المفعّلة: عند بدء التطبيق (قد يتغيّر إذن المنبّهات الدقيقة أو المنطقة الزمنية)،
  /// وعند تبديل الوضع المتحفّظ لتتبدّل أيقونة الإشعار.
  Future<void> refresh() async {
    final scheduler = ref.read(reminderSchedulerProvider);
    for (final s in reminderSlots) {
      if (state.contains(s.id)) await scheduler.scheduleDaily(s.notificationId, s.hour, s.minute, neutral: ref.read(discreetProvider));
    }
  }

  /// عند مسح كل البيانات.
  Future<void> cancelAll() async {
    for (final s in reminderSlots) {
      if (state.contains(s.id)) await ref.read(reminderSchedulerProvider).cancel(s.notificationId);
    }
    await ref.read(prefsProvider).remove(remindersKey);
    state = {};
  }

  Future<void> _save(Set<String> s) async {
    state = s;
    await ref.read(prefsProvider).setString(remindersKey, jsonEncode(s.toList()));
  }
}

final remindersProvider = NotifierProvider<RemindersNotifier, Set<String>>(RemindersNotifier.new);

class RemindersCard extends ConsumerStatefulWidget {
  const RemindersCard({super.key});

  @override
  ConsumerState<RemindersCard> createState() => _RemindersCardState();
}

class _RemindersCardState extends ConsumerState<RemindersCard> {
  bool denied = false;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final on = ref.watch(remindersProvider);
    return SanadCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('ذكّرني كل يوم', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(
            'تذكير يومي من جهازك نفسه بعنوان محايد «وِرد اليوم» — بلا حساب ولا خادم، ويصل حتى دون إنترنت. ألغِه متى شئت بلمسة أخرى.',
            style: TextStyle(fontSize: 14, color: t.muted),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final s in reminderSlots)
                Semantics(
                  toggled: on.contains(s.id),
                  child: OutlinedButton(
                    key: ValueKey('reminder-${s.id}'),
                    onPressed: () async {
                      final ok = await ref.read(remindersProvider.notifier).toggle(s);
                      if (mounted) setState(() => denied = !ok);
                    },
                    style: on.contains(s.id)
                        ? OutlinedButton.styleFrom(backgroundColor: t.successBg, foregroundColor: t.success, side: BorderSide(color: t.success))
                        : null,
                    child: Text(on.contains(s.id) ? '✓ ${s.label}' : s.label),
                  ),
                ),
            ],
          ),
          if (denied)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('لم يُسمح بالإشعارات — فعّلها لسند من إعدادات الجهاز.', style: TextStyle(fontSize: 14, color: t.warning)),
            ),
        ],
      ),
    );
  }
}
