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
    required this.sakinaBgTop,
    required this.sakinaBg,
    required this.sakinaBgDeep,
    required this.sakinaText,
    required this.sakinaInk,
    required this.sakinaDhikr,
    required this.sakinaAccent,
    required this.sakinaSoft,
    required this.sakinaMuted,
    required this.sakinaFaint,
    required this.sakinaGlow,
    required this.sakinaWarn,
    required this.cardDawn1,
    required this.cardDawn2,
    required this.cardDawn3,
    required this.cardDawnInk,
    required this.cardDawnSoft,
    required this.cardDawnAccent,
    required this.cardSky1,
    required this.cardSky2,
    required this.cardSky3,
    required this.cardSkyInk,
    required this.cardSkySoft,
    required this.cardSkyAccent,
    required this.cardNight1,
    required this.cardNight2,
    required this.cardNight3,
    required this.cardNightInk,
    required this.cardNightSoft,
    required this.cardNightAccent,
    required this.cardHalo,
    required this.googleSurface,
    required this.googleBorder,
    required this.googleText,
    required this.googleYellow,
    required this.googleRed,
    required this.googleGreen,
    required this.googleBlue,
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
  final Color sakinaBgTop;
  final Color sakinaBg;
  final Color sakinaBgDeep;
  final Color sakinaText;
  final Color sakinaInk;
  final Color sakinaDhikr;
  final Color sakinaAccent;
  final Color sakinaSoft;
  final Color sakinaMuted;
  final Color sakinaFaint;
  final Color sakinaGlow;
  final Color sakinaWarn;
  final Color cardDawn1;
  final Color cardDawn2;
  final Color cardDawn3;
  final Color cardDawnInk;
  final Color cardDawnSoft;
  final Color cardDawnAccent;
  final Color cardSky1;
  final Color cardSky2;
  final Color cardSky3;
  final Color cardSkyInk;
  final Color cardSkySoft;
  final Color cardSkyAccent;
  final Color cardNight1;
  final Color cardNight2;
  final Color cardNight3;
  final Color cardNightInk;
  final Color cardNightSoft;
  final Color cardNightAccent;
  final Color cardHalo;
  final Color googleSurface;
  final Color googleBorder;
  final Color googleText;
  final Color googleYellow;
  final Color googleRed;
  final Color googleGreen;
  final Color googleBlue;
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
    sakinaBgTop: Color(0xFF15283A),
    sakinaBg: Color(0xFF0B141C),
    sakinaBgDeep: Color(0xFF070D12),
    sakinaText: Color(0xFFDFE9EC),
    sakinaInk: Color(0xFFEEF4F3),
    sakinaDhikr: Color(0xFFE6F1EF),
    sakinaAccent: Color(0xFF9FC9C3),
    sakinaSoft: Color(0xFFCFE6E2),
    sakinaMuted: Color(0xFF8AA3AD),
    sakinaFaint: Color(0xFF6F8994),
    sakinaGlow: Color(0xFF7CC7BF),
    sakinaWarn: Color(0xFFF2C675),
    cardDawn1: Color(0xFFE6F3F0),
    cardDawn2: Color(0xFFE3EEF9),
    cardDawn3: Color(0xFFF9F0DF),
    cardDawnInk: Color(0xFF1E2B31),
    cardDawnSoft: Color(0xFF5A6D74),
    cardDawnAccent: Color(0xFF2A7A74),
    cardSky1: Color(0xFFD7EBF7),
    cardSky2: Color(0xFFE9F3F9),
    cardSky3: Color(0xFFF4F8FB),
    cardSkyInk: Color(0xFF18303F),
    cardSkySoft: Color(0xFF4F6B7C),
    cardSkyAccent: Color(0xFF3D7FA8),
    cardNight1: Color(0xFF122233),
    cardNight2: Color(0xFF16293B),
    cardNight3: Color(0xFF1E2B2A),
    cardNightInk: Color(0xFFEEF3F2),
    cardNightSoft: Color(0xFFA8BCC4),
    cardNightAccent: Color(0xFFF2CF86),
    cardHalo: Color(0xFFFFFFFF),
    googleSurface: Color(0xFFFFFFFF),
    googleBorder: Color(0xFFDADCE0),
    googleText: Color(0xFF1F1F1F),
    googleYellow: Color(0xFFFFC107),
    googleRed: Color(0xFFFF3D00),
    googleGreen: Color(0xFF4CAF50),
    googleBlue: Color(0xFF1976D2),
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
    sakinaBgTop: Color(0xFF15283A),
    sakinaBg: Color(0xFF0B141C),
    sakinaBgDeep: Color(0xFF070D12),
    sakinaText: Color(0xFFDFE9EC),
    sakinaInk: Color(0xFFEEF4F3),
    sakinaDhikr: Color(0xFFE6F1EF),
    sakinaAccent: Color(0xFF9FC9C3),
    sakinaSoft: Color(0xFFCFE6E2),
    sakinaMuted: Color(0xFF8AA3AD),
    sakinaFaint: Color(0xFF6F8994),
    sakinaGlow: Color(0xFF7CC7BF),
    sakinaWarn: Color(0xFFF2C675),
    cardDawn1: Color(0xFFE6F3F0),
    cardDawn2: Color(0xFFE3EEF9),
    cardDawn3: Color(0xFFF9F0DF),
    cardDawnInk: Color(0xFF1E2B31),
    cardDawnSoft: Color(0xFF5A6D74),
    cardDawnAccent: Color(0xFF2A7A74),
    cardSky1: Color(0xFFD7EBF7),
    cardSky2: Color(0xFFE9F3F9),
    cardSky3: Color(0xFFF4F8FB),
    cardSkyInk: Color(0xFF18303F),
    cardSkySoft: Color(0xFF4F6B7C),
    cardSkyAccent: Color(0xFF3D7FA8),
    cardNight1: Color(0xFF122233),
    cardNight2: Color(0xFF16293B),
    cardNight3: Color(0xFF1E2B2A),
    cardNightInk: Color(0xFFEEF3F2),
    cardNightSoft: Color(0xFFA8BCC4),
    cardNightAccent: Color(0xFFF2CF86),
    cardHalo: Color(0xFFFFFFFF),
    googleSurface: Color(0xFFFFFFFF),
    googleBorder: Color(0xFFDADCE0),
    googleText: Color(0xFF1F1F1F),
    googleYellow: Color(0xFFFFC107),
    googleRed: Color(0xFFFF3D00),
    googleGreen: Color(0xFF4CAF50),
    googleBlue: Color(0xFF1976D2),
    dawn: LinearGradient(begin: Alignment(-0.342, -0.9397), end: Alignment(0.342, 0.9397), colors: [Color(0xFF142330), Color(0xFF16283A), Color(0xFF1D2A2A)], stops: [0, 0.55, 1]),
  );
}
