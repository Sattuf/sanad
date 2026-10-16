import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/companion/awareness_screen.dart';
import '../features/companion/programs_screen.dart';
import '../features/companion/sakina_screen.dart';
import '../features/companion/self_ruqyah_screen.dart';
import '../features/companion/today_screen.dart';
import '../features/journal/journal_screen.dart';
import '../features/privacy/discreet.dart';
import '../features/privacy/privacy_screen.dart';
import '../theme/theme.dart';

/*
  المسارات نفسها في الويب (docs/flutter-app-plan.md §4)، فتعمل الروابط العميقة بالشكل نفسه.
  الأسابيع 1–3: الرفيق بلا حساب كاملاً (يومي، البرامج، المرشد، الميزان والاختبار، السكينة)،
  والباقي شاشات «قيد البناء» بنفس الهوية حتى تصل مراحلها.
*/
final router = GoRouter(
  initialLocation: '/today',
  routes: [
    StatefulShellRoute.indexedStack(
      builder: (context, state, shell) => AppShell(shell: shell, location: state.uri.path),
      branches: [
        StatefulShellBranch(routes: [GoRoute(path: '/today', builder: (_, _) => const TodayScreen())]),
        StatefulShellBranch(routes: [
          GoRoute(
            path: '/programs',
            builder: (_, _) => const ProgramsScreen(),
            routes: [GoRoute(path: ':id', builder: (_, state) => ProgramDetailScreen(id: state.pathParameters['id']!))],
          ),
        ]),
        StatefulShellBranch(routes: [GoRoute(path: '/ruqyah', builder: (_, _) => const ComingSoon(title: 'الرقية والتحصين', phase: 'الأسابيع 5–7'))]),
        StatefulShellBranch(routes: [
          GoRoute(path: '/awareness', builder: (_, _) => const AwarenessScreen(), routes: [GoRoute(path: 'quiz', builder: (_, _) => const QuizScreen())]),
        ]),
        StatefulShellBranch(routes: [
          GoRoute(
            path: '/account',
            builder: (_, _) => const ComingSoon(title: 'حسابي', phase: 'الأسابيع 5–9', links: [(to: '/journal', label: 'مذكّرتي'), (to: '/privacy-mode', label: 'الخصوصية والتمويه')]),
          ),
        ]),
      ],
    ),
    GoRoute(path: '/sakina', builder: (_, state) => SakinaScreen(need: state.uri.queryParameters['for'])),
    GoRoute(path: '/self-ruqyah', builder: (_, _) => const SelfRuqyahScreen()),
    GoRoute(path: '/journal', builder: (_, _) => const JournalScreen()),
    GoRoute(path: '/privacy-mode', builder: (_, _) => const PrivacyScreen()),
  ],
);

class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.shell, required this.location});
  final StatefulNavigationShell shell;
  final String location;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.t;
    final discreet = ref.watch(discreetProvider);
    return Scaffold(
      body: Stack(
        children: [
          shell,
          // الخروج السريع في الوضع المتحفّظ (✕ أعلى الشاشة كالويب)
          if (discreet)
            PositionedDirectional(
              top: 0,
              end: 4,
              child: SafeArea(
                child: IconButton(
                  key: const ValueKey('quick-exit'),
                  onPressed: () => quickExit(ref, GoRouter.of(context)),
                  tooltip: 'خروج سريع',
                  icon: Icon(Icons.close_rounded, color: t.muted),
                ),
              ),
            ),
        ],
      ),
      // زر السكينة حاضر في كل الشاشات، في الجهة نفسها كالويب (يسار الشاشة في RTL)
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
      // صفحة البرنامج لها شريط إجراء ثابت في الأسفل، فلا يغطّيه الزر
      floatingActionButton: location.startsWith('/programs/') ? null : FloatingActionButton.extended(
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
          destinations: [
            const NavigationDestination(icon: Icon(Icons.wb_twilight_outlined), selectedIcon: Icon(Icons.wb_twilight), label: 'يومي'),
            const NavigationDestination(icon: Icon(Icons.shield_outlined), selectedIcon: Icon(Icons.shield), label: 'البرامج'),
            NavigationDestination(icon: const Icon(Icons.menu_book_outlined), selectedIcon: const Icon(Icons.menu_book), label: discreetLabel(ref, 'الرقية', 'الأذكار')),
            const NavigationDestination(icon: Icon(Icons.balance_outlined), selectedIcon: Icon(Icons.balance), label: 'الميزان'),
            const NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'حسابي'),
          ],
        ),
      ),
    );
  }
}

/// شاشة مؤقتة بنفس الهوية لما لم تصله مرحلته بعد.
class ComingSoon extends StatelessWidget {
  const ComingSoon({super.key, required this.title, required this.phase, this.standalone = false, this.links = const []});
  final String title;
  final String phase;
  final bool standalone;

  /// ما بُني من صفحات هذا القسم حتى الآن.
  final List<({String to, String label})> links;

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
              for (final l in links) ...[
                const SizedBox(height: 12),
                OutlinedButton(onPressed: () => context.push(l.to), child: Text(l.label)),
              ],
            ],
          ),
        ),
      ),
    );
    return standalone ? Scaffold(appBar: AppBar(), body: body) : SafeArea(child: body);
  }
}
