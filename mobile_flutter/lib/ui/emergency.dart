import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../content/models.dart';
import '../core/platform_services.dart';
import '../features/companion/companion_store.dart';
import '../theme/theme.dart';

/*
  الإحالة العاجلة (البند 5) — نظير stores/emergency.ts وEmergencyReferralBanner في الويب:
  حين يُكتشف خطر في نص يكتبه المستخدم يظهر الشريط فوق كل شاشة فوراً.
  روابط صفحة الطوارئ أُزيلت من الواجهة بقرار المالك؛ الإحالة التلقائية نفسها باقية.
*/
class EmergencyNotifier extends Notifier<EmergencyReferral?> {
  @override
  EmergencyReferral? build() => null;

  void raise([EmergencyReferral? referral]) => state = referral ?? ref.read(contentProvider).fallbackReferral;

  void dismiss() => state = null;
}

final emergencyProvider = NotifierProvider<EmergencyNotifier, EmergencyReferral?>(EmergencyNotifier.new);

/// يضع شريط الإحالة فوق التطبيق كله.
class EmergencyOverlay extends ConsumerWidget {
  const EmergencyOverlay({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final referral = ref.watch(emergencyProvider);
    if (referral == null) return child;
    final t = context.t;
    return Column(
      children: [
        Material(
          color: t.dangerBg,
          child: Container(
            width: double.infinity,
            decoration: BoxDecoration(border: Border(bottom: BorderSide(color: t.danger, width: 4))),
            child: SafeArea(
              bottom: false,
              child: Semantics(
                liveRegion: true,
                container: true,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('نحن قلقون عليك — إن كنت في خطر، اطلب المساعدة الآن', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: t.danger)),
                      const SizedBox(height: 4),
                      Text(referral.message, style: TextStyle(fontSize: 14, height: 1.75, color: t.danger)),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          for (final c in referral.contacts)
                            FilledButton(
                              onPressed: () => ref.read(outboundProvider).dial(c.phoneNumber),
                              style: FilledButton.styleFrom(backgroundColor: t.danger, foregroundColor: t.primaryContrast),
                              child: Text.rich(
                                TextSpan(children: [
                                  TextSpan(text: 'اتصل ${c.phoneNumber} '),
                                  TextSpan(text: '— ${c.label}', style: const TextStyle(fontWeight: FontWeight.w400)),
                                ]),
                              ),
                            ),
                          TextButton(
                            onPressed: () => ref.read(emergencyProvider.notifier).dismiss(),
                            style: TextButton.styleFrom(foregroundColor: t.danger, textStyle: const TextStyle(fontFamily: kSans, fontSize: 12, decoration: TextDecoration.underline)),
                            child: const Text('إخفاء'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        // الشريط أخذ مساحة الحافة العليا، فلا تُضاف مرة أخرى تحته
        Expanded(child: MediaQuery.removePadding(context: context, removeTop: true, child: child)),
      ],
    );
  }
}
