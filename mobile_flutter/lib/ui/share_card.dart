import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/platform_services.dart';
import '../theme/theme.dart';
import '../theme/tokens.g.dart';

/*
  بطاقات مشاركة (حالات واتساب/إنستغرام) تُرسم محلياً — نظير components/companion/share.tsx بالهندسة نفسها:
  بلا خادم ولا تتبّع، وكل بطاقة تحمل توقيع سند بهدوء. الألوان من رموز --card-* المولَّدة.
*/

/// النطاق المطبوع في توقيع البطاقة (location.host في الويب).
const siteHost = String.fromEnvironment('SANAD_SITE_HOST', defaultValue: 'sanad.app');

typedef CardContent = ({String? kicker, String body, String? source, bool quran});

enum CardTheme { dawn, sky, night }

enum CardFormat { square, story }

const _themeLabels = {CardTheme.dawn: 'فجر', CardTheme.sky: 'سماء', CardTheme.night: 'سَحَر'};

({List<Color> stops, Color ink, Color soft, Color accent}) cardColors(SanadTokens t, CardTheme theme) => switch (theme) {
      CardTheme.dawn => (stops: [t.cardDawn1, t.cardDawn2, t.cardDawn3], ink: t.cardDawnInk, soft: t.cardDawnSoft, accent: t.cardDawnAccent),
      CardTheme.sky => (stops: [t.cardSky1, t.cardSky2, t.cardSky3], ink: t.cardSkyInk, soft: t.cardSkySoft, accent: t.cardSkyAccent),
      CardTheme.night => (stops: [t.cardNight1, t.cardNight2, t.cardNight3], ink: t.cardNightInk, soft: t.cardNightSoft, accent: t.cardNightAccent),
    };

Size cardSize(CardFormat f) => f == CardFormat.square ? const Size(1080, 1080) : const Size(1080, 1920);

class CardPainter extends CustomPainter {
  CardPainter({required this.content, required this.theme, required this.format, required this.t});
  final CardContent content;
  final CardTheme theme;
  final CardFormat format;
  final SanadTokens t;

  @override
  void paint(Canvas canvas, Size size) {
    final full = cardSize(format);
    canvas.scale(size.width / full.width);
    final w = full.width, h = full.height;
    final c = cardColors(t, theme);
    canvas.drawRect(
      Offset.zero & full,
      Paint()..shader = ui.Gradient.linear(Offset.zero, Offset(w, h), c.stops, const [0, 0.55, 1]),
    );
    // هالات ضوء ناعمة
    for (final (x, y, r, a) in [(w * 0.85, h * 0.12, w * 0.45, 0.35), (w * 0.1, h * 0.92, w * 0.5, 0.25)]) {
      final glow = theme == CardTheme.night ? c.accent.withValues(alpha: a * 0.5) : t.cardHalo.withValues(alpha: math.min(1, a + 0.3));
      canvas.drawRect(
        Offset.zero & full,
        Paint()..shader = ui.Gradient.radial(Offset(x, y), r, [glow, t.cardHalo.withValues(alpha: 0)]),
      );
    }

    const pad = 120.0;
    final maxW = w - pad * 2;
    final bodyFont = content.quran ? kQuran : kNaskh;
    // حجم الخط يتكيّف مع الطول
    final limit = h * (format == CardFormat.story ? 0.55 : 0.5);
    var size0 = content.quran ? 64.0 : 60.0;
    late TextPainter body;
    for (; size0 >= 34; size0 -= 2) {
      body = _text(content.body, TextStyle(fontFamily: bodyFont, fontFamilyFallback: kQuranFallback, fontSize: size0, height: 1.9, color: c.ink), maxW);
      if (body.height <= limit) break;
    }
    final top = h / 2 - body.height / 2;
    if (content.kicker != null) {
      final k = _text(content.kicker!, TextStyle(fontFamily: kSans, fontSize: 34, fontWeight: FontWeight.w600, color: c.accent), maxW);
      k.paint(canvas, Offset((w - k.width) / 2, top - k.height - size0 * 0.6));
    }
    body.paint(canvas, Offset((w - body.width) / 2, top));
    if (content.source != null) {
      final s = _text(content.source!, TextStyle(fontFamily: kSans, fontSize: 30, color: c.soft), maxW);
      s.paint(canvas, Offset((w - s.width) / 2, top + body.height + 10));
    }

    // التوقيع
    canvas.drawCircle(Offset(w / 2, h - 150), 7, Paint()..color = c.accent.withValues(alpha: 0.9));
    final sig = _text('سند — رفيق السكينة اليومي', TextStyle(fontFamily: kSans, fontSize: 34, fontWeight: FontWeight.w600, color: c.ink), maxW);
    sig.paint(canvas, Offset((w - sig.width) / 2, h - 95 - 34));
    final host = _text(siteHost, TextStyle(fontFamily: kSans, fontSize: 26, color: c.soft), maxW);
    host.paint(canvas, Offset((w - host.width) / 2, h - 55 - 26));
  }

  TextPainter _text(String s, TextStyle style, double maxW) =>
      TextPainter(text: TextSpan(text: s, style: style), textAlign: TextAlign.center, textDirection: TextDirection.rtl)..layout(maxWidth: maxW);

  @override
  bool shouldRepaint(CardPainter old) => old.content != content || old.theme != theme || old.format != format || old.t != t;
}

/// يرسم البطاقة بحجمها الكامل ويعيدها PNG.
Future<List<int>> renderCardPng(CardContent content, CardTheme theme, CardFormat format, SanadTokens t) async {
  final size = cardSize(format);
  final recorder = ui.PictureRecorder();
  CardPainter(content: content, theme: theme, format: format, t: t).paint(Canvas(recorder), size);
  final image = await recorder.endRecording().toImage(size.width.toInt(), size.height.toInt());
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  image.dispose();
  return data!.buffer.asUint8List();
}

/// زر «بطاقة» الصغير — نظير ShareButton في الويب.
class ShareButton extends StatelessWidget {
  const ShareButton({super.key, required this.content, this.bordered = false});
  final CardContent content;
  final bool bordered;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    return TextButton.icon(
      onPressed: () => showDialog<void>(context: context, builder: (_) => ShareCardDialog(content: content)),
      style: TextButton.styleFrom(
        foregroundColor: t.muted,
        minimumSize: const Size(44, 32),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        shape: StadiumBorder(side: bordered ? BorderSide(color: t.border) : BorderSide.none),
        textStyle: const TextStyle(fontFamily: kSans, fontSize: 12, fontWeight: FontWeight.w600),
      ),
      icon: const Icon(Icons.ios_share_rounded, size: 14),
      label: const Text('بطاقة'),
    );
  }
}

class ShareCardDialog extends ConsumerStatefulWidget {
  const ShareCardDialog({super.key, required this.content});
  final CardContent content;

  @override
  ConsumerState<ShareCardDialog> createState() => _ShareCardDialogState();
}

class _ShareCardDialogState extends ConsumerState<ShareCardDialog> {
  CardTheme theme = CardTheme.dawn;
  CardFormat format = CardFormat.square;
  bool busy = false;

  Future<void> _share() async {
    setState(() => busy = true);
    try {
      final png = await renderCardPng(widget.content, theme, format, context.t);
      await ref.read(outboundProvider).shareFile(Uint8List.fromList(png), name: 'sanad-card.png', mimeType: 'image/png', text: 'من سند — رفيق السكينة اليومي');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final size = cardSize(format);
    Widget chip({required bool selected, required VoidCallback onTap, required Widget child}) => Semantics(
          selected: selected,
          button: true,
          child: Material(
            color: Colors.transparent,
            shape: StadiumBorder(side: BorderSide(color: selected ? t.primary : t.border)),
            child: InkWell(
              customBorder: const StadiumBorder(),
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                child: DefaultTextStyle.merge(style: TextStyle(fontSize: 14, color: selected ? t.primary : t.muted), child: child),
              ),
            ),
          ),
        );
    return Dialog(
      backgroundColor: t.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.x3l), side: BorderSide(color: t.border)),
      insetPadding: const EdgeInsets.all(16),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Expanded(child: Text('بطاقة للمشاركة', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700))),
                IconButton(onPressed: () => Navigator.pop(context), tooltip: 'إغلاق', icon: Icon(Icons.close_rounded, color: t.muted)),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: t.surface2, borderRadius: BorderRadius.circular(Radii.x2l)),
              child: Center(
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: 360, maxHeight: MediaQuery.sizeOf(context).height * 0.45),
                  child: AspectRatio(
                    aspectRatio: size.width / size.height,
                    child: Semantics(
                      label: 'معاينة البطاقة',
                      image: true,
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(Radii.xl),
                        child: CustomPaint(painter: CardPainter(content: widget.content, theme: theme, format: format, t: t)),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                for (final k in CardTheme.values)
                  chip(
                    selected: theme == k,
                    onTap: () => setState(() => theme = k),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 16,
                          height: 16,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: LinearGradient(colors: [cardColors(t, k).stops.first, cardColors(t, k).stops.last]),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(_themeLabels[k]!),
                      ],
                    ),
                  ),
                for (final f in CardFormat.values)
                  chip(selected: format == f, onTap: () => setState(() => format = f), child: Text(f == CardFormat.square ? 'منشور' : 'حالة / ستوري')),
              ],
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: busy ? null : _share,
              child: busy
                  ? SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2, color: t.primaryContrast))
                  : const Text('مشاركة أو حفظ الصورة'),
            ),
          ],
        ),
      ),
    );
  }
}
