import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/audio.dart';
import '../../theme/theme.dart';
import '../../ui/components.dart';
import '../companion/companion_store.dart';
import '../companion/reminders.dart';
import '../journal/journal_store.dart';
import '../ruqyah/ruqyah_reminders.dart';
import 'discreet.dart';

/*
  الخصوصية والتمويه — نظير PrivacyModePage في الويب: ماذا يُحفظ وأين، والوضع المتحفّظ، والخروج السريع، والمسح.
  على الجوال يبدّل الوضع المتحفّظ أيقونة التطبيق واسمه فعلاً (أيقونة بديلة)، بدل عنوان التبويب في الويب.
*/
class PrivacyScreen extends ConsumerStatefulWidget {
  const PrivacyScreen({super.key});

  @override
  ConsumerState<PrivacyScreen> createState() => _PrivacyScreenState();
}

class _PrivacyScreenState extends ConsumerState<PrivacyScreen> {
  bool confirm = false;
  bool wiped = false;

  Future<void> _wipeAll() async {
    await ref.read(journalProvider.notifier).wipe();
    await ref.read(remindersProvider.notifier).cancelAll();
    await ref.read(ruqyahRemindersProvider.notifier).cancelAll();
    await ref.read(discreetProvider.notifier).set(false);
    await ref.read(prefsProvider).remove('sanad.companion.v1');
    ref.invalidate(companionProvider);
    await ref.read(recitationAudioProvider).clearCache();
    if (!mounted) return;
    setState(() => wiped = true);
    await Future<void>.delayed(const Duration(milliseconds: 800));
    if (mounted) context.go('/today');
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final on = ref.watch(discreetProvider);
    final muted = TextStyle(fontSize: 14, height: 2, color: t.muted);
    Widget bullet(String head, String text) => Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Text.rich(
            TextSpan(children: [
              const TextSpan(text: '•  '),
              TextSpan(text: head, style: TextStyle(fontWeight: FontWeight.w700, color: t.text)),
              TextSpan(text: text),
            ]),
            style: muted,
          ),
        );
    return Scaffold(
      appBar: AppBar(),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
        children: [
          const PageHeader(title: 'الخصوصية والتمويه', subtitle: 'رحلتك شأن خاص بك. هذه أدوات تجعل سند هادئاً ومتحفّظاً على شاشتك أمام الآخرين.'),
          SanadCard(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            child: SwitchListTile(
              key: const ValueKey('discreet'),
              value: on,
              onChanged: (v) => ref.read(discreetProvider.notifier).set(v),
              title: const Text('الوضع المتحفّظ', style: TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text(
                'يظهر التطبيق باسم «ملاحظاتي» وبأيقونة محايدة في قائمة التطبيقات والمهام الأخيرة، وتُستبدل التسميات مثل «الرقية» بأخرى عامة، ويُفعَّل الخروج السريع.',
                style: TextStyle(fontSize: 14, color: t.muted),
              ),
            ),
          ),
          const SizedBox(height: 16),
          SanadCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('الخروج السريع', style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text('في الوضع المتحفّظ: زر «✕» أعلى الشاشة يقفل مذكّرتك ويعيد التطبيق لشاشة عادية ويغلقه فوراً.', style: muted),
              ],
            ),
          ),
          const SizedBox(height: 16),
          SanadCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('أين تُحفظ بياناتك؟', style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                bullet('مذكّرتي: ', 'مشفّرة على جهازك فقط برمزك أو بصمتك. لا تصل لخوادمنا أبداً.'),
                bullet('تقدّم البرامج ونتيجة الاختبار: ', 'على جهازك فقط، بلا حساب.'),
                bullet('التلاوات المحفوظة: ', 'نسخ صوتية على جهازك لتعمل دون إنترنت.'),
                bullet('', 'لا نستخدم أدوات تتبّع أو إعلانات في هذه الصفحات.'),
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: TextButton(
                    onPressed: () => context.push('/journal'),
                    style: TextButton.styleFrom(foregroundColor: t.primary, padding: EdgeInsets.zero),
                    child: const Text('إعدادات قفل المذكّرة بالبصمة ←', style: TextStyle(fontWeight: FontWeight.w600)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          SanadCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('مسح كل بياناتي من هذا الجهاز', style: TextStyle(fontWeight: FontWeight.w700, color: t.danger)),
                const SizedBox(height: 4),
                Text('يحذف المذكّرة والتقدّم والتذكير والتلاوات المحفوظة. لا يمكن التراجع.', style: TextStyle(fontSize: 14, color: t.muted)),
                const SizedBox(height: 12),
                if (wiped)
                  Semantics(liveRegion: true, child: Text('مُسحت البيانات المحلية.', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: t.success)))
                else if (!confirm)
                  TextButton(onPressed: () => setState(() => confirm = true), style: TextButton.styleFrom(foregroundColor: t.danger), child: const Text('مسح…'))
                else
                  FilledButton(
                    onPressed: _wipeAll,
                    style: FilledButton.styleFrom(backgroundColor: t.danger, foregroundColor: t.primaryContrast),
                    child: const Text('تأكيد المسح النهائي'),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
