import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../content/arabic.dart';
import '../../content/ruqyah.dart';
import '../../core/platform_services.dart';
import '../../theme/theme.dart';
import '../companion/companion_store.dart';
import '../privacy/discreet.dart';

/*
  «ذكّرني بأذكاري» — نظير ReminderCard في ReminderWidgets.tsx بالأوقات نفسها (slots في wird.ts).
  الويب يرسلها إشعارات من الخادم أو ملف تقويم؛ هنا إشعار محلي يجدوله النظام، فيصل والتطبيق مغلق وبلا شبكة
  وبلا حساب، ويفتح الورد مباشرة. عنوانه اسم الورد، ومحايد «وِرد اليوم» في الوضع المتحفّظ.
*/
const ruqyahRemindersKey = 'sanad.ruqyah.reminders';
const _ids = {'morning': 11, 'evening': 12, 'sleep': 13};

/// الأوقات المفعّلة: معرّف الوقت ← "HH:mm".
class RuqyahReminders extends Notifier<Map<String, String>> {
  @override
  Map<String, String> build() {
    try {
      final raw = ref.read(prefsProvider).getString(ruqyahRemindersKey);
      return raw == null ? {} : (jsonDecode(raw) as Map<String, dynamic>).cast<String, String>();
    } catch (_) {
      return {};
    }
  }

  WirdSlot _slot(String id) => ref.read(contentProvider).ruqyah.slots.firstWhere((s) => s.id == id);

  Future<void> _schedule(String id, String time) async {
    final t = parseTime(time)!;
    final discreet = ref.read(discreetProvider);
    final s = _slot(id);
    await ref.read(reminderSchedulerProvider).scheduleDaily(
          _ids[id]!,
          t.hour,
          t.minute,
          neutral: discreet,
          title: discreet ? neutralReminderTitle : s.label,
          route: '/ruqyah/${s.collection}',
        );
  }

  /// يفعّل وقتاً أو يغيّره. يعيد false إن رفض المستخدم إذن الإشعارات.
  Future<bool> enable(String id, String time) async {
    if (!await ref.read(reminderSchedulerProvider).requestPermission()) return false;
    await _schedule(id, time);
    await _save({...state, id: time});
    return true;
  }

  Future<void> disable(String id) async {
    await ref.read(reminderSchedulerProvider).cancel(_ids[id]!);
    await _save({...state}..remove(id));
  }

  /// عند بدء التطبيق وتبديل الوضع المتحفّظ (العنوان والأيقونة).
  Future<void> refresh() async {
    for (final e in state.entries) {
      await _schedule(e.key, e.value);
    }
  }

  Future<void> cancelAll() async {
    for (final id in state.keys) {
      await ref.read(reminderSchedulerProvider).cancel(_ids[id]!);
    }
    await _save({});
  }

  Future<void> _save(Map<String, String> s) async {
    state = s;
    await ref.read(prefsProvider).setString(ruqyahRemindersKey, jsonEncode(s));
  }
}

final ruqyahRemindersProvider = NotifierProvider<RuqyahReminders, Map<String, String>>(RuqyahReminders.new);

class RuqyahReminderCard extends ConsumerStatefulWidget {
  const RuqyahReminderCard({super.key});

  @override
  ConsumerState<RuqyahReminderCard> createState() => _RuqyahReminderCardState();
}

class _RuqyahReminderCardState extends ConsumerState<RuqyahReminderCard> {
  ({bool ok, String text})? message;

  Future<void> _enable(String id, String time) async {
    final ok = await ref.read(ruqyahRemindersProvider.notifier).enable(id, time);
    if (mounted) {
      setState(() => message = ok ? null : (ok: false, text: 'لم يُسمح بالإشعارات. فعّلها لسند من إعدادات الجوال ثم حاول مجدداً.'));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final slots = ref.watch(contentProvider).ruqyah.slots;
    final on = ref.watch(ruqyahRemindersProvider);
    String label(String hhmm) => arNum(hhmm);
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: t.surface, borderRadius: BorderRadius.circular(Radii.x3l), border: Border.all(color: t.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(header: true, child: const Text('ذكّرني بأذكاري', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700))),
          const SizedBox(height: 4),
          Text('اختر الأوقات؛ يصلك التنبيه يومياً من جهازك نفسه — حتى والتطبيق مغلق وبلا إنترنت — ويفتح الورد مباشرة.', style: TextStyle(color: t.muted)),
          const SizedBox(height: 16),
          for (final s in slots)
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(borderRadius: BorderRadius.circular(Radii.xl), border: Border.all(color: t.border)),
              child: Row(
                children: [
                  // TalkBack يقرأ المفتاح باسم الوقت، لا «مفتاح» وحده
                  Semantics(
                    label: 'تذكير ${s.label}',
                    child: Switch(
                      key: ValueKey('ruqyah-reminder-${s.id}'),
                      value: on.containsKey(s.id),
                      onChanged: (v) => v ? _enable(s.id, on[s.id] ?? s.defaultTime) : ref.read(ruqyahRemindersProvider.notifier).disable(s.id),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(child: Text(s.label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600))),
                  TextButton(
                    onPressed: () async {
                      final current = parseTime(on[s.id] ?? s.defaultTime)!;
                      final picked = await showTimePicker(context: context, initialTime: TimeOfDay(hour: current.hour, minute: current.minute));
                      if (picked == null) return;
                      final hhmm = '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
                      await _enable(s.id, hhmm);
                    },
                    child: Semantics(label: 'وقت ${s.label}', child: Text(label(on[s.id] ?? s.defaultTime), textDirection: TextDirection.ltr)),
                  ),
                ],
              ),
            ),
          if (message != null)
            Semantics(liveRegion: true, child: Text(message!.text, style: TextStyle(fontSize: 14, color: message!.ok ? t.success : t.lamp))),
        ],
      ),
    );
  }
}
