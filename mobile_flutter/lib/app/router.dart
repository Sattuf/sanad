import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../features/companion/today_screen.dart';
import '../theme/theme.dart';

/*
  المسارات نفسها في الويب (docs/flutter-app-plan.md §4)، فتعمل الروابط العميقة بالشكل نفسه.
  الأسبوع 1: «يومي» كاملة، والباقي شاشات «قيد البناء» بنفس الهوية حتى تصل مراحلها.
*/
final router = GoRouter(
  initialLocation: '/today',
  routes: [
    StatefulShellRoute.indexedStack(
      builder: (context, state, shell) => AppShell(shell: shell),
      branches: [
        StatefulShellBranch(routes: [GoRoute(path: '/today', builder: (_, _) => const TodayScreen())]),
        StatefulShellBranch(routes: [GoRoute(path: '/programs', builder: (_, _) => const ComingSoon(title: 'برامج الالتزام', phase: 'الأسبوعان 2–3'))]),
        StatefulShellBranch(routes: [GoRoute(path: '/ruqyah', builder: (_, _) => const ComingSoon(title: 'الرقية والتحصين', phase: 'الأسابيع 5–7'))]),
        StatefulShellBranch(routes: [GoRoute(path: '/awareness', builder: (_, _) => const ComingSoon(title: 'ميزان الوعي', phase: 'الأسبوعان 2–3'))]),
        StatefulShellBranch(routes: [GoRoute(path: '/account', builder: (_, _) => const ComingSoon(title: 'حسابي', phase: 'الأسابيع 5–9'))]),
      ],
    ),
    GoRoute(path: '/sakina', builder: (_, _) => const ComingSoon(title: 'سكينة', phase: 'الأسبوعان 2–3', standalone: true)),
    GoRoute(path: '/self-ruqyah', builder: (_, _) => const ComingSoon(title: 'ارقِ نفسك', phase: 'الأسبوعان 2–3', standalone: true)),
    GoRoute(path: '/journal', builder: (_, _) => const ComingSoon(title: 'مذكّرتي', phase: 'الأسبوعان 4–5', standalone: true)),
  ],
);

class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    return Scaffold(
      body: shell,
      // زر السكينة حاضر في كل الشاشات، في الجهة نفسها كالويب (يسار الشاشة في RTL)
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'sakina',
        onPressed: () => context.push('/sakina'),
        backgroundColor: t.surface,
        foregroundColor: t.text,
        elevation: 4,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.full), side: BorderSide(color: t.border)),
        icon: CircleAvatar(radius: 16, backgroundColor: t.sky, child: Icon(Icons.waves_rounded, size: 18, color: t.skyStrong)),
        label: const Text('سكينة', style: TextStyle(fontWeight: FontWeight.w600)),
        tooltip: 'وضع السكينة: ذكر وآيات هادئة عند الضيق',
      ),
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(border: Border(top: BorderSide(color: t.border))),
        child: NavigationBar(
          selectedIndex: shell.currentIndex,
          onDestinationSelected: (i) => shell.goBranch(i, initialLocation: i == shell.currentIndex),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.wb_twilight_outlined), selectedIcon: Icon(Icons.wb_twilight), label: 'يومي'),
            NavigationDestination(icon: Icon(Icons.shield_outlined), selectedIcon: Icon(Icons.shield), label: 'البرامج'),
            NavigationDestination(icon: Icon(Icons.menu_book_outlined), selectedIcon: Icon(Icons.menu_book), label: 'الرقية'),
            NavigationDestination(icon: Icon(Icons.balance_outlined), selectedIcon: Icon(Icons.balance), label: 'الميزان'),
            NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'حسابي'),
          ],
        ),
      ),
    );
  }
}

/// شاشة مؤقتة بنفس الهوية لما لم تصله مرحلته بعد.
class ComingSoon extends StatelessWidget {
  const ComingSoon({super.key, required this.title, required this.phase, this.standalone = false});
  final String title;
  final String phase;
  final bool standalone;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final body = Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Container(
          padding: const EdgeInsets.all(28),
          decoration: BoxDecoration(gradient: t.dawn, borderRadius: BorderRadius.circular(Radii.x3l), border: Border.all(color: t.border)),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(title, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Text('قيد البناء — $phase من الخطة', style: TextStyle(color: t.muted)),
            ],
          ),
        ),
      ),
    );
    return standalone ? Scaffold(appBar: AppBar(), body: body) : SafeArea(child: body);
  }
}
