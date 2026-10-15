// مولَّد من frontend/src/styles/index.css بـ frontend/scripts/export-tokens.mjs — لا يُعدَّل يدوياً (ADR-0023).
// ignore_for_file: prefer_const_constructors, lines_longer_than_80_chars

import 'package:flutter/painting.dart';

/// رموز «سكينة الفجر» — نفس قيم الويب حرفياً.
class SanadTokens {
  const SanadTokens({
    required this.bg,
    required this.bgDeep,
    required this.surface,
    required this.surface2,
    required this.text,
    required this.muted,
    required this.border,
    required this.primary,
    required this.primaryHover,
    required this.primaryContrast,
    required this.sky,
    required this.skyStrong,
    required this.sage,
    required this.sand,
    required this.lamp,
    required this.lampGlow,
    required this.success,
    required this.successBg,
    required this.warning,
    required this.warningBg,
    required this.danger,
    required this.dangerBg,
    required this.private,
    required this.privateBg,
    required this.focus,
    required this.dawn,
  });

  final Color bg;
  final Color bgDeep;
  final Color surface;
  final Color surface2;
  final Color text;
  final Color muted;
  final Color border;
  final Color primary;
  final Color primaryHover;
  final Color primaryContrast;
  final Color sky;
  final Color skyStrong;
  final Color sage;
  final Color sand;
  final Color lamp;
  final Color lampGlow;
  final Color success;
  final Color successBg;
  final Color warning;
  final Color warningBg;
  final Color danger;
  final Color dangerBg;
  final Color private;
  final Color privateBg;
  final Color focus;
  final LinearGradient dawn;

  static const light = SanadTokens(
    bg: Color(0xFFF8F6F0),
    bgDeep: Color(0xFFEAF4F2),
    surface: Color(0xFFFFFFFF),
    surface2: Color(0xFFF2F7F6),
    text: Color(0xFF1E2B31),
    muted: Color(0xFF586A72),
    border: Color(0xFFDFE8E6),
    primary: Color(0xFF2A7A74),
    primaryHover: Color(0xFF226660),
    primaryContrast: Color(0xFFFFFFFF),
    sky: Color(0xFFDCEDF7),
    skyStrong: Color(0xFF4F8FB8),
    sage: Color(0xFFE3EFE6),
    sand: Color(0xFFF6EEDD),
    lamp: Color(0xFFA87523),
    lampGlow: Color(0xFFF2CF86),
    success: Color(0xFF1F6F47),
    successBg: Color(0xFFE4F3EA),
    warning: Color(0xFF85570A),
    warningBg: Color(0xFFFBF1DC),
    danger: Color(0xFFB42318),
    dangerBg: Color(0xFFFDECEA),
    private: Color(0xFF7A1F1F),
    privateBg: Color(0xFFFBEAEA),
    focus: Color(0xFF2F7EC7),
    dawn: LinearGradient(begin: Alignment(-0.342, -0.9397), end: Alignment(0.342, 0.9397), colors: [Color(0xFFEAF4F2), Color(0xFFE4EFFA), Color(0xFFF8F1E3)], stops: [0, 0.55, 1]),
  );

  static const dark = SanadTokens(
    bg: Color(0xFF111A24),
    bgDeep: Color(0xFF0D151E),
    surface: Color(0xFF18232F),
    surface2: Color(0xFF1F2C3A),
    text: Color(0xFFE8EEF0),
    muted: Color(0xFFA0B2BC),
    border: Color(0xFF2A3A49),
    primary: Color(0xFF7CC7BF),
    primaryHover: Color(0xFF97D6CF),
    primaryContrast: Color(0xFF0C1C1B),
    sky: Color(0xFF1B2F40),
    skyStrong: Color(0xFF8CC0E3),
    sage: Color(0xFF1B2D27),
    sand: Color(0xFF2A2619),
    lamp: Color(0xFFF2CF86),
    lampGlow: Color(0xFFF2CF86),
    success: Color(0xFF6FCF97),
    successBg: Color(0xFF13261C),
    warning: Color(0xFFF2C675),
    warningBg: Color(0xFF2A2314),
    danger: Color(0xFFFF7B6E),
    dangerBg: Color(0xFF2C1513),
    private: Color(0xFFFF9A92),
    privateBg: Color(0xFF2B1414),
    focus: Color(0xFF7AB8F5),
    dawn: LinearGradient(begin: Alignment(-0.342, -0.9397), end: Alignment(0.342, 0.9397), colors: [Color(0xFF142330), Color(0xFF16283A), Color(0xFF1D2A2A)], stops: [0, 0.55, 1]),
  );
}
