import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/session.dart';
import '../../theme/theme.dart';
import '../../ui/components.dart';
import '../companion/companion_store.dart';

/// صفحات الحساب (الحجز، المحادثة، التوصيات…) تطلب الدخول — RequireAuth في الويب، بدعوة لا بتحويل صامت.
class SignInGate extends ConsumerWidget {
  const SignInGate({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (ref.watch(signedInProvider)) return child;
    final t = context.t;
    return Scaffold(
      appBar: AppBar(),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SanadCard(
            child: Column(
              children: [
                const Text(
                  'هذه الصفحة تتطلب الدخول',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                Text(
                  'ادخل بحساب جوجل لتتابع حجوزاتك ومحادثاتك وتوصياتك.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: t.muted),
                ),
                const SizedBox(height: 16),
                FilledButton(onPressed: () => context.push('/login'), child: Text(ref.read(contentProvider).label('nav.login'))),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
