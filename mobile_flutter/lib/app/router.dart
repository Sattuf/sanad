import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/account/account_screen.dart';
import '../features/account/login_screen.dart';
import '../features/care/booking_screens.dart';
import '../features/care/chat_screens.dart';
import '../features/care/directory_screens.dart';
import '../features/care/sign_in_gate.dart';
import '../features/library/library_screens.dart';
import '../features/companion/awareness_screen.dart';
import '../features/companion/programs_screen.dart';
import '../features/companion/sakina_screen.dart';
import '../features/companion/self_ruqyah_screen.dart';
import '../features/companion/today_screen.dart';
import '../features/journal/journal_screen.dart';
import '../features/privacy/discreet.dart';
import '../features/privacy/privacy_screen.dart';
import '../features/ruqyah/ruqyah_screens.dart';
import '../theme/theme.dart';

/*
  المسارات نفسها في الويب (docs/flutter-app-plan.md §4)، فتعمل الروابط العميقة بالشكل نفسه.
  الرفيق بلا حساب كاملاً، والرقية والمكتبة، والدليل والحجز والمحادثة والتوصيات والإشعارات (الأسابيع 7–9).
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
        StatefulShellBranch(routes: [
          GoRoute(
            path: '/ruqyah',
            builder: (_, _) => const RuqyahHubScreen(),
            routes: [
              GoRoute(path: 'guide/:guideId', builder: (_, state) => GuideScreen(guideId: state.pathParameters['guideId']!)),
              // مفتاح بالمعرّف: المجموعة التالية تفتح من أعلاها بحالة جديدة لا بتمرير السابقة
              GoRoute(
                path: ':collectionId',
                builder: (_, state) => CollectionScreen(key: ValueKey(state.pathParameters['collectionId']), collectionId: state.pathParameters['collectionId']!),
              ),
            ],
          ),
        ]),
        StatefulShellBranch(routes: [
          GoRoute(path: '/awareness', builder: (_, _) => const AwarenessScreen(), routes: [GoRoute(path: 'quiz', builder: (_, _) => const QuizScreen())]),
        ]),
        StatefulShellBranch(routes: [
          GoRoute(path: '/account', builder: (_, _) => const AccountScreen()),
        ]),
      ],
    ),
    GoRoute(path: '/sakina', builder: (_, state) => SakinaScreen(need: state.uri.queryParameters['for'])),
    GoRoute(path: '/self-ruqyah', builder: (_, _) => const SelfRuqyahScreen()),
    GoRoute(path: '/journal', builder: (_, _) => const JournalScreen()),
    GoRoute(path: '/privacy-mode', builder: (_, _) => const PrivacyScreen()),
    GoRoute(
      path: '/login',
      builder: (_, _) => const LoginScreen(),
      routes: [GoRoute(path: 'two-factor', builder: (_, state) => TwoFactorScreen(ticket: state.extra! as String))],
    ),
    GoRoute(path: '/consent', builder: (_, _) => const ConsentScreen()),
    GoRoute(path: '/library', builder: (_, _) => const LibraryScreen()),
    GoRoute(path: '/favorites', builder: (_, _) => const FavoritesScreen()),
    // الدليل عام؛ الحجز والمحادثة والتوصيات والإشعارات والبلاغ تطلب الدخول (الأسابيع 7–9)
    GoRoute(path: '/directory', builder: (_, state) => DirectoryScreen(initialTrack: state.uri.queryParameters['track'] ?? '')),
    GoRoute(path: '/providers/:id', builder: (_, state) => ProviderScreen(id: state.pathParameters['id']!)),
    GoRoute(path: '/organizations/:id', builder: (_, state) => OrganizationScreen(id: state.pathParameters['id']!)),
    GoRoute(
      path: '/book/:providerId',
      builder: (_, state) => SignInGate(child: BookScreen(providerId: state.pathParameters['providerId']!, offeringId: state.uri.queryParameters['offering'])),
    ),
    GoRoute(
      path: '/bookings',
      builder: (_, _) => const SignInGate(child: MyBookingsScreen()),
      routes: [GoRoute(path: ':id', builder: (_, state) => SignInGate(child: BookingDetailScreen(id: state.pathParameters['id']!)))],
    ),
    GoRoute(path: '/conversations/:id', builder: (_, state) => SignInGate(child: ConversationScreen(id: state.pathParameters['id']!))),
    GoRoute(path: '/recommendations', builder: (_, _) => const SignInGate(child: RecommendationsScreen())),
    GoRoute(path: '/notifications', builder: (_, _) => const SignInGate(child: NotificationsScreen())),
    GoRoute(
      path: '/report',
      builder: (_, state) => SignInGate(child: ReportScreen(targetType: state.uri.queryParameters['targetType'], targetId: state.uri.queryParameters['targetId'])),
    ),
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
      // الخروج السريع في الوضع المتحفّظ (✕ أعلى الشاشة كالويب): في شريط رفيع خاص به فوق المحتوى،
      // لا عائماً فوقه — كان يغطّي زاوية بطاقات المشاهد في صفحات الرقية
      body: !discreet
          ? shell
          : Column(
              children: [
                SafeArea(
                  bottom: false,
                  child: Align(
                    alignment: AlignmentDirectional.centerEnd,
                    child: IconButton(
                      key: const ValueKey('quick-exit'),
                      onPressed: () => quickExit(ref, GoRouter.of(context)),
                      tooltip: 'خروج سريع',
                      icon: Icon(Icons.close_rounded, color: t.muted),
                    ),
                  ),
                ),
                Expanded(child: MediaQuery.removePadding(context: context, removeTop: true, child: shell)),
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
