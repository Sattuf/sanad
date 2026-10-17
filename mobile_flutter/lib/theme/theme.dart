import 'package:flutter/material.dart';

import '../content/models.dart';
import 'tokens.g.dart';

/// مقاسات Tailwind التي يستخدمها الويب، بنفس القيم (rounded-xl / 2xl / 3xl …).
abstract final class Radii {
  static const xl = 12.0;
  static const x2l = 16.0;
  static const x3l = 24.0;
  static const full = 999.0;
}

const kSans = 'IBMPlexSansArabic';
const kNaskh = 'Amiri';
const kQuran = 'AmiriQuran';

/// كالويب (--font-quran): ما لا يحويه خط المصحف — مثل تنوين الفتح المفتوح U+065E — يُؤخذ من أميري.
const kQuranFallback = [kNaskh];

/// الرموز متاحة لكل الشاشات: context.t.primary …
class SanadColors extends ThemeExtension<SanadColors> {
  const SanadColors(this.tokens);
  final SanadTokens tokens;

  @override
  SanadColors copyWith({SanadTokens? tokens}) => SanadColors(tokens ?? this.tokens);

  @override
  SanadColors lerp(SanadColors? other, double t) => t < 0.5 ? this : (other ?? this);
}

extension SanadThemeX on BuildContext {
  SanadTokens get t => Theme.of(this).extension<SanadColors>()!.tokens;
}

/// ألوان البرنامج — نفس TINT في frontend/src/content/programs.ts.
({Color bg, Color ring, Color ink}) tintColors(SanadTokens t, Tint tint) => switch (tint) {
      Tint.teal => (bg: t.bgDeep, ring: t.primary, ink: t.primary),
      Tint.sky => (bg: t.sky, ring: t.skyStrong, ink: t.skyStrong),
      Tint.sage => (bg: t.sage, ring: t.success, ink: t.success),
      Tint.sand => (bg: t.sand, ring: t.lamp, ink: t.lamp),
    };

ThemeData buildTheme(Brightness brightness) {
  final t = brightness == Brightness.dark ? SanadTokens.dark : SanadTokens.light;
  final scheme = ColorScheme(
    brightness: brightness,
    primary: t.primary,
    onPrimary: t.primaryContrast,
    secondary: t.skyStrong,
    onSecondary: t.primaryContrast,
    error: t.danger,
    onError: Colors.white,
    surface: t.surface,
    onSurface: t.text,
    surfaceContainerHighest: t.surface2,
    outline: t.border,
    outlineVariant: t.border,
  );
  final base = ThemeData(useMaterial3: true, brightness: brightness, colorScheme: scheme, fontFamily: kSans);
  return base.copyWith(
    scaffoldBackgroundColor: t.bg,
    extensions: [SanadColors(t)],
    dividerColor: t.border,
    textTheme: base.textTheme
        .apply(bodyColor: t.text, displayColor: t.text, fontFamily: kSans)
        .copyWith(bodyMedium: base.textTheme.bodyMedium?.copyWith(height: 1.7, color: t.text)),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: t.primary,
        foregroundColor: t.primaryContrast,
        minimumSize: const Size(44, 48),
        textStyle: const TextStyle(fontFamily: kSans, fontWeight: FontWeight.w600, fontSize: 15),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.xl)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: t.text,
        backgroundColor: t.surface,
        side: BorderSide(color: t.border),
        minimumSize: const Size(44, 48),
        textStyle: const TextStyle(fontFamily: kSans, fontWeight: FontWeight.w600, fontSize: 15),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.xl)),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: t.surface,
      indicatorColor: t.bgDeep,
      surfaceTintColor: Colors.transparent,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => TextStyle(
          fontFamily: kSans,
          fontSize: 12,
          fontWeight: s.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w400,
          color: s.contains(WidgetState.selected) ? t.primary : t.muted,
        ),
      ),
      iconTheme: WidgetStateProperty.resolveWith((s) => IconThemeData(color: s.contains(WidgetState.selected) ? t.primary : t.muted)),
    ),
    appBarTheme: AppBarTheme(backgroundColor: t.bg, foregroundColor: t.text, elevation: 0, surfaceTintColor: Colors.transparent),
  );
}
