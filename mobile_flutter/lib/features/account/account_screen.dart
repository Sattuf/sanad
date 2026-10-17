import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/session.dart';
import '../../theme/theme.dart';
import '../../ui/components.dart';
import '../companion/companion_store.dart';
import 'auth.dart';

/*
  «حسابي» — الجزء الحالي من AccountPage: الدخول والخروج والاسم، وروابط ما بُني على الجهاز.
  بقية الصفحة (الموافقات، سجل الاطلاع، التصدير، حذف الحساب) في الأسابيع 7–9 من الخطة.
*/
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.t;
    final content = ref.watch(contentProvider);
    final signedIn = ref.watch(signedInProvider);
    final me = ref.watch(meProvider);
    final links = [(to: '/journal', label: 'مذكّرتي'), (to: '/privacy-mode', label: 'الخصوصية والتمويه')];

    return SafeArea(
      bottom: false,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 120),
        children: [
          PageHeader(title: content.label('nav.account')),
          if (!signedIn)
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(gradient: t.dawn, borderRadius: BorderRadius.circular(Radii.x3l), border: Border.all(color: t.border)),
              child: Column(
                children: [
                  const Text('حسابك اختياري', textAlign: TextAlign.center, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  Text('ادخل بحساب جوجل لتحفظ وِردك وتتابع حجوزاتك من أي جهاز.', textAlign: TextAlign.center, style: TextStyle(height: 1.75, color: t.muted)),
                  const SizedBox(height: 16),
                  FilledButton(key: const ValueKey('login'), onPressed: () => context.push('/login'), child: Text(content.label('nav.login'))),
                ],
              ),
            )
          else
            SanadCard(
              child: me.when(
                data: (p) => Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(p?.displayName ?? '', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                    if (p?.email != null) Text(p!.email!, textDirection: TextDirection.ltr, style: TextStyle(fontSize: 14, color: t.muted)),
                    const SizedBox(height: 8),
                    Text('بقية إعدادات الحساب (الموافقات، تصدير بياناتك، حذف الحساب) قيد البناء — الأسابيع 7–9 من الخطة، ومتاحة الآن على موقع سند.',
                        style: TextStyle(fontSize: 14, height: 1.75, color: t.muted)),
                  ],
                ),
                loading: () => const Center(child: Padding(padding: EdgeInsets.all(8), child: CircularProgressIndicator())),
                error: (_, _) => Text('تعذّر تحميل حسابك. تحقق من اتصالك.', style: TextStyle(color: t.muted)),
              ),
            ),
          const SizedBox(height: 16),
          for (final l in links)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: OutlinedButton(onPressed: () => context.push(l.to), child: Text(l.label)),
            ),
          if (signedIn) ...[
            const SizedBox(height: 8),
            TextButton(
              key: const ValueKey('logout'),
              onPressed: () => ref.read(authProvider).signOut(),
              style: TextButton.styleFrom(foregroundColor: t.danger),
              child: Text(content.label('nav.logout')),
            ),
          ],
        ],
      ),
    );
  }
}
