import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:path_drawing/path_drawing.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

import '../../core/api.dart';
import '../../core/platform_services.dart';
import '../../theme/theme.dart';
import '../../theme/tokens.g.dart';
import '../../ui/components.dart';
import '../../ui/share_card.dart' show siteHost;
import 'auth.dart';

/*
  الدخول — نظير LoginScreen في frontend/src/features/auth/LoginScreen.tsx بالتصميم والنصوص نفسها:
  زر جوجل (وأبل على iPhone فوقه — إرشاد Apple 4.8)، بلا كلمات مرور ولا نماذج تسجيل، والرفيق يعمل بلا حساب.
*/

const _promises = ['لا كلمة مرور تحفظها ولا رمز ينتظرك', 'لا نطلب أي مستند — حسابك جاهز من أول دخول', 'مجاني بالكامل، ويمكنك حذف حسابك متى شئت'];

/// بعد دخول مكتمل: الموافقات أولاً إن لزمت، ثم العودة لما قبل الدخول.
Future<void> afterSignIn(BuildContext context, WidgetRef ref) async {
  final me = await ref.read(meProvider.future);
  if (!context.mounted) return;
  if (me != null && me.needsConsent) {
    context.pushReplacement('/consent');
  } else if (context.canPop()) {
    context.pop();
  } else {
    context.go('/account');
  }
}

/// خلفية الفجر مع هالتين خافتتين وبطاقة الدخول — AuthShell في الويب.
class AuthShell extends StatelessWidget {
  const AuthShell({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    Widget halo(Color c, double size) => IgnorePointer(
          child: Container(
            width: size,
            height: size,
            decoration: BoxDecoration(shape: BoxShape.circle, gradient: RadialGradient(colors: [c, c.withValues(alpha: 0)])),
          ),
        );
    return Scaffold(
      appBar: AppBar(backgroundColor: Colors.transparent),
      extendBodyBehindAppBar: true,
      body: DecoratedBox(
        decoration: BoxDecoration(gradient: t.dawn),
        child: Stack(
          children: [
            PositionedDirectional(top: -128, end: -128, child: halo(t.surface.withValues(alpha: 0.5), 384)),
            PositionedDirectional(bottom: -160, start: -96, child: halo(t.sky.withValues(alpha: 0.7), 384)),
            SafeArea(
              child: Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(16, 40, 16, 40),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 416),
                    child: Column(
                      children: [
                        Semantics(
                          label: 'سند',
                          excludeSemantics: true,
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              ClipRRect(borderRadius: BorderRadius.circular(Radii.x2l), child: Image.asset('assets/brand/logo.png', width: 44, height: 44)),
                              const SizedBox(width: 8),
                              const Text('سند', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
                            ],
                          ),
                        ),
                        const SizedBox(height: 24),
                        Container(
                          padding: const EdgeInsets.all(28),
                          decoration: BoxDecoration(
                            color: t.surface.withValues(alpha: 0.9),
                            borderRadius: BorderRadius.circular(32),
                            border: Border.all(color: t.border),
                            boxShadow: [BoxShadow(color: t.text.withValues(alpha: 0.12), blurRadius: 25, offset: const Offset(0, 20), spreadRadius: -5)],
                          ),
                          child: child,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  late final Future<AuthProviders?> _providers = ref.read(authProvider).providers().then<AuthProviders?>((p) => p, onError: (_) => null);
  late final Future<bool> _apple = ref.read(nativeSignInProvider).appleAvailable().catchError((_) => false);
  String? busy;
  String? error;

  Future<void> _run(String method, Future<SignInOutcome?> Function() signIn) async {
    setState(() {
      busy = method;
      error = null;
    });
    try {
      final outcome = await signIn();
      if (!mounted) return;
      switch (outcome) {
        case null:
          break; // ألغى المستخدم
        case SignedIn():
          await afterSignIn(context, ref);
        case NeedsTwoFactor(:final ticket):
          context.push('/login/two-factor', extra: ticket);
        case WebOnly():
          setState(() => error = webOnlyMessage);
      }
    } on ApiError catch (e) {
      if (mounted) setState(() => error = e.friendly);
    } catch (_) {
      if (mounted) setState(() => error = 'تعذّر إكمال الدخول. حاول مجدداً.');
    } finally {
      if (mounted) setState(() => busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final native = ref.watch(nativeSignInProvider);
    return AuthShell(
      child: FutureBuilder(
        future: Future.wait([_providers, _apple]),
        builder: (context, snap) {
          final providers = snap.data?[0] as AuthProviders?;
          final appleOk = (snap.data?[1] as bool? ?? false) && (providers?.apple ?? false);
          // كالويب: تنبيه حين يكون جوجل غير مُفعّل في هذه البيئة (الخادم أو إعداد البناء)
          final googleOff = snap.hasData && (!(providers?.googleNative ?? false) || !native.googleConfigured);
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Semantics(header: true, child: const Text('أهلاً بك في سند', textAlign: TextAlign.center, style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, height: 1.4))),
              const SizedBox(height: 8),
              Text('ادخل بحساب جوجل لتحفظ وِردك وتتابع حجوزاتك من أي جهاز.', textAlign: TextAlign.center, style: TextStyle(height: 1.75, color: t.muted)),
              if (error != null) ...[const SizedBox(height: 20), _Banner(text: error!, tone: 'danger')],
              if (googleOff) ...[const SizedBox(height: 20), const _Banner(text: 'الدخول بجوجل غير مُفعّل في هذه البيئة بعد.', tone: 'warning')],
              const SizedBox(height: 28),
              if (appleOk) ...[
                SizedBox(
                  height: 56,
                  child: SignInWithAppleButton(
                    text: 'المتابعة باستخدام Apple',
                    style: Theme.of(context).brightness == Brightness.dark ? SignInWithAppleButtonStyle.white : SignInWithAppleButtonStyle.black,
                    borderRadius: BorderRadius.circular(Radii.x2l),
                    onPressed: () => busy == null ? _run('apple', ref.read(authProvider).withApple) : null,
                  ),
                ),
                const SizedBox(height: 12),
              ],
              _GoogleButton(
                busy: busy == 'google',
                enabled: busy == null && snap.hasData && !googleOff,
                onPressed: () => _run('google', ref.read(authProvider).withGoogle),
              ),
              const SizedBox(height: 28),
              for (final p in _promises)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Row(
                    children: [
                      ExcludeSemantics(
                        child: Container(
                          width: 24,
                          height: 24,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(color: t.sage, shape: BoxShape.circle),
                          child: Text('✓', style: TextStyle(fontSize: 12, color: t.success)),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(child: Text(p, style: TextStyle(fontSize: 14, color: t.muted))),
                    ],
                  ),
                ),
              const SizedBox(height: 18),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(color: t.surface2, borderRadius: BorderRadius.circular(Radii.x2l)),
                child: Text.rich(
                  TextSpan(children: [
                    TextSpan(text: 'لا تريد حساباً الآن؟ ', style: TextStyle(color: t.muted)),
                    WidgetSpan(
                      alignment: PlaceholderAlignment.baseline,
                      baseline: TextBaseline.alphabetic,
                      child: GestureDetector(
                        onTap: () => context.go('/today'),
                        child: Text('ابدأ بلا تسجيل', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: t.primary)),
                      ),
                    ),
                    TextSpan(text: ' — برامجك ومذكّرتك تعمل على جهازك.', style: TextStyle(color: t.muted)),
                  ]),
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 14, height: 1.75),
                ),
              ),
              const SizedBox(height: 24),
              _LegalLine(onOpen: (path) => ref.read(outboundProvider).openUrl(Uri.https(siteHost, path))),
            ],
          );
        },
      ),
    );
  }
}

class _LegalLine extends StatelessWidget {
  const _LegalLine({required this.onOpen});
  final void Function(String path) onOpen;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final style = TextStyle(fontSize: 12, height: 2, color: t.muted);
    Widget link(String text, String path) => GestureDetector(
          onTap: () => onOpen(path),
          child: Text(text, style: style.copyWith(decoration: TextDecoration.underline)),
        );
    return Wrap(
      alignment: WrapAlignment.center,
      children: [
        Text('بالمتابعة توافق على ', style: style),
        link('شروط الاستخدام', '/terms'),
        Text(' و', style: style),
        link('سياسة الخصوصية', '/privacy'),
        Text('.', style: style),
      ],
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.text, required this.tone});
  final String text;
  final String tone;

  @override
  Widget build(BuildContext context) {
    final c = toneColors(context.t, tone);
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(color: c.bg, borderRadius: BorderRadius.circular(Radii.xl), border: Border.all(color: c.border)),
        child: Text(text, style: TextStyle(fontSize: 14, height: 1.75, color: c.fg)),
      ),
    );
  }
}

/// زر جوجل بألوان العلامة (رموز --google-*) وشعارها بمسارات الويب نفسها.
class _GoogleButton extends StatelessWidget {
  const _GoogleButton({required this.busy, required this.enabled, required this.onPressed});
  final bool busy;
  final bool enabled;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    return Opacity(
      opacity: enabled || busy ? 1 : 0.5,
      child: Material(
        color: t.googleSurface,
        elevation: enabled ? 1 : 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.x2l), side: BorderSide(color: t.googleBorder)),
        child: InkWell(
          key: const ValueKey('google'),
          borderRadius: BorderRadius.circular(Radii.x2l),
          onTap: enabled ? onPressed : null,
          child: SizedBox(
            height: 56,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (busy)
                  SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2, color: t.googleText))
                else
                  ExcludeSemantics(child: CustomPaint(size: const Size.square(20), painter: _GoogleMark(t))),
                const SizedBox(width: 12),
                Flexible(
                  child: Text(
                    busy ? 'جارٍ الدخول بجوجل…' : 'المتابعة باستخدام Google',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: t.googleText),
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

class _GoogleMark extends CustomPainter {
  _GoogleMark(this.t);
  final SanadTokens t;

  // مسارات GoogleMark في LoginScreen.tsx حرفياً (مربع 48)
  static final _paths = [
    parseSvgPathData('M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z'),
    parseSvgPathData('m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z'),
    parseSvgPathData('M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z'),
    parseSvgPathData('M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z'),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 48);
    final colors = [t.googleYellow, t.googleRed, t.googleGreen, t.googleBlue];
    for (var i = 0; i < 4; i++) {
      canvas.drawPath(_paths[i], Paint()..color = colors[i]);
    }
  }

  @override
  bool shouldRepaint(_GoogleMark old) => old.t != t;
}

/// رمز التحقق الثنائي — TwoFactorCode في SignInStages.tsx.
class TwoFactorScreen extends ConsumerStatefulWidget {
  const TwoFactorScreen({super.key, required this.ticket});
  final String ticket;

  @override
  ConsumerState<TwoFactorScreen> createState() => _TwoFactorScreenState();
}

class _TwoFactorScreenState extends ConsumerState<TwoFactorScreen> {
  final _code = TextEditingController();
  bool busy = false;
  String? error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final outcome = await ref.read(authProvider).verifyTwoFactor(widget.ticket, _code.text.trim());
      if (!mounted) return;
      if (outcome is SignedIn) {
        context.pop();
        await afterSignIn(context, ref);
      } else {
        setState(() => error = webOnlyMessage);
      }
    } on ApiError catch (e) {
      if (mounted) setState(() => error = e.friendly);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    return AuthShell(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(header: true, child: const Text('رمز التحقق الثنائي', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700))),
          const SizedBox(height: 8),
          Text('أدخل الرمز الحالي من تطبيق المصادقة.', style: TextStyle(color: t.muted)),
          const SizedBox(height: 16),
          const Text('الرمز', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          TextField(
            key: const ValueKey('otp'),
            controller: _code,
            autofocus: true,
            keyboardType: TextInputType.number,
            autofillHints: const [AutofillHints.oneTimeCode],
            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
            textDirection: TextDirection.ltr,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 22, letterSpacing: 10),
            onChanged: (_) => setState(() {}),
            onSubmitted: (_) => _code.text.length == 6 ? _submit() : null,
            decoration: InputDecoration(
              filled: true,
              fillColor: t.surface,
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.xl), borderSide: BorderSide(color: t.border)),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.xl), borderSide: BorderSide(color: t.focus, width: 2)),
            ),
          ),
          if (error != null) ...[const SizedBox(height: 16), _Banner(text: error!, tone: 'danger')],
          const SizedBox(height: 16),
          FilledButton(onPressed: busy || _code.text.length != 6 ? null : _submit, child: const Text('دخول')),
          const SizedBox(height: 8),
          TextButton(onPressed: () => context.pop(), child: Text('البدء من جديد', style: TextStyle(color: t.muted))),
        ],
      ),
    );
  }
}

/// «قبل أن نبدأ» — ConsentOnboardingPage في الويب: الشروط والخصوصية إلزاميتان، والتذكير اختياري.
class ConsentScreen extends ConsumerStatefulWidget {
  const ConsentScreen({super.key});

  @override
  ConsumerState<ConsentScreen> createState() => _ConsentScreenState();
}

class _ConsentScreenState extends ConsumerState<ConsentScreen> {
  bool terms = false;
  bool privacy = false;
  bool marketing = false;
  bool busy = false;
  String? error;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    void open(String path) => ref.read(outboundProvider).openUrl(Uri.https(siteHost, path));
    Widget check(String key, bool value, ValueChanged<bool> onChanged, Widget label) => CheckboxListTile(
          key: ValueKey(key),
          value: value,
          onChanged: (v) => onChanged(v ?? false),
          controlAffinity: ListTileControlAffinity.leading,
          contentPadding: EdgeInsets.zero,
          title: label,
        );
    Widget linked(String before, String link, String path) => Text.rich(TextSpan(children: [
          TextSpan(text: before),
          WidgetSpan(
            alignment: PlaceholderAlignment.baseline,
            baseline: TextBaseline.alphabetic,
            child: GestureDetector(
              onTap: () => open(path),
              child: Text(link, style: TextStyle(color: t.primary, decoration: TextDecoration.underline)),
            ),
          ),
        ]));
    return Scaffold(
      appBar: AppBar(automaticallyImplyLeading: false),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
        children: [
          const PageHeader(title: 'قبل أن نبدأ', subtitle: 'موافقات أساسية لاستخدام سند. يمكنك مراجعتها وسحب الاختيارية منها لاحقاً من «حسابي».'),
          SanadCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                check('terms', terms, (v) => setState(() => terms = v), linked('أوافق على ', 'شروط الاستخدام', '/terms')),
                check('privacy', privacy, (v) => setState(() => privacy = v), linked('أوافق على ', 'سياسة الخصوصية', '/privacy')),
                check('marketing', marketing, (v) => setState(() => marketing = v), const Text('(اختياري) أرغب بتذكير يومي لطيف: دعاء أو آية اليوم')),
                if (error != null) ...[const SizedBox(height: 8), _Banner(text: error!, tone: 'danger')],
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: !terms || !privacy || busy
                      ? null
                      : () async {
                          setState(() {
                            busy = true;
                            error = null;
                          });
                          try {
                            await ref.read(authProvider).recordConsents(['TermsOfService', 'PrivacyPolicy', if (marketing) 'MarketingCommunication']);
                            if (context.mounted) context.go('/account');
                          } on ApiError catch (e) {
                            if (mounted) setState(() => error = e.friendly);
                          } finally {
                            if (mounted) setState(() => busy = false);
                          }
                        },
                  child: const Text('متابعة'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
