import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/session.dart';
import '../features/privacy/discreet.dart';
import '../theme/theme.dart';

/*
  تبويبات الأبواب — نظير DoorTabs في الويب (frontend/src/app/layout/doors.tsx).
  كل باب في الشريط السفلي يجمع صفحاته في تبويبات أعلى الشاشة، فلا يتوه المستخدم بين روابط متشابهة.
  push: الصفحة خارج الشريط السفلي (شاشة كاملة)، فتُفتح فوق الباب بدل استبداله.
*/
typedef DoorTab = ({String to, String label, String? discreet, bool auth, bool push});

const List<DoorTab> todayDoorTabs = [
  (to: '/today', label: 'اليوم', discreet: null, auth: false, push: false),
  (to: '/journal', label: 'مذكّرتي', discreet: null, auth: false, push: true),
];

const List<DoorTab> ruqyahDoorTabs = [
  (to: '/programs', label: 'الخطط', discreet: null, auth: false, push: false),
  (to: '/ruqyah', label: 'الآيات والأذكار', discreet: 'الأذكار', auth: false, push: false),
  (to: '/self-ruqyah', label: 'جلسة رقية', discreet: 'جلسة', auth: false, push: true),
  (to: '/library', label: 'الاستماع', discreet: null, auth: true, push: true),
];

const List<DoorTab> directoryDoorTabs = [
  (to: '/directory', label: 'الدليل', discreet: null, auth: false, push: false),
  (to: '/bookings', label: 'حجوزاتي', discreet: null, auth: true, push: true),
  (to: '/recommendations', label: 'توصياتي', discreet: null, auth: true, push: true),
];

const List<DoorTab> awarenessDoorTabs = [
  (to: '/awareness', label: 'الميزان والأدلة', discreet: null, auth: false, push: false),
  (to: '/awareness/quiz', label: 'اختبر وعيك', discreet: null, auth: false, push: false),
];

class DoorTabs extends ConsumerWidget {
  const DoorTabs({super.key, required this.tabs, required this.current});
  final List<DoorTab> tabs;

  /// مسار التبويب الحالي (to)
  final String current;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.t;
    final signedIn = ref.watch(signedInProvider);
    final shown = tabs.where((x) => !x.auth || signedIn).toList();
    if (shown.length < 2) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Align(
        alignment: AlignmentDirectional.centerStart,
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: t.surface,
              borderRadius: BorderRadius.circular(Radii.x2l),
              border: Border.all(color: t.border),
            ),
            child: Row(
              children: [
                for (final tab in shown)
                  Semantics(
                    button: true,
                    selected: tab.to == current,
                    child: InkWell(
                      key: ValueKey('door-tab-${tab.to}'),
                      borderRadius: BorderRadius.circular(Radii.xl),
                      onTap: tab.to == current ? null : () => tab.push ? context.push(tab.to) : context.go(tab.to),
                      child: Container(
                        constraints: const BoxConstraints(minHeight: 48),
                        alignment: Alignment.center,
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        decoration: BoxDecoration(
                          color: tab.to == current ? t.primary : null,
                          borderRadius: BorderRadius.circular(Radii.xl),
                        ),
                        child: Text(
                          tab.discreet == null ? tab.label : discreetLabel(ref, tab.label, tab.discreet!),
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: tab.to == current ? t.primaryContrast : t.muted,
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
