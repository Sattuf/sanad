import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/audio.dart';
import '../../core/platform_services.dart';
import '../../core/session.dart';
import '../../theme/theme.dart';
import '../../ui/components.dart';
import '../../ui/share_card.dart' show siteHost;
import '../companion/companion_store.dart';
import '../privacy/discreet.dart';
import '../ruqyah/scene.dart';
import '../../content/ruqyah.dart' show SceneTheme;

/*
  المكتبة الصوتية والمفضلة — نظير frontend/src/features/library/LibraryPages.tsx بالنصوص نفسها.
  المقاطع المخزّنة في سند تُشغَّل بالمشغّل المشترك (يستمر في الخلفية والشاشة مقفلة، ومحايد في الوضع المتحفّظ)،
  ومقاطع YouTube تُفتح خارج التطبيق عند الضغط فقط — لا يُحمَّل شيء من YouTube قبل ذلك، كالويب.
*/

const libraryCategories = ['', 'QuranRecitation', 'Dua', 'Adhkar'];

class AudioTrack {
  const AudioTrack({
    required this.id,
    required this.title,
    required this.sourceLabel,
    required this.category,
    required this.durationSeconds,
    required this.mediaKind,
    this.description,
    this.audioUrl,
    this.youTubeVideoId,
  });

  factory AudioTrack.fromJson(Map<String, dynamic> j) => AudioTrack(
    id: j['id'] as String,
    title: j['title'] as String,
    sourceLabel: j['sourceLabel'] as String,
    description: j['description'] as String?,
    category: j['category'] as String,
    durationSeconds: (j['durationSeconds'] as num).toInt(),
    audioUrl: j['audioUrl'] as String?,
    mediaKind: j['mediaKind'] as String? ?? 'StoredAudio',
    youTubeVideoId: j['youTubeVideoId'] as String?,
  );

  final String id;
  final String title;
  final String sourceLabel;
  final String? description;
  final String category;
  final int durationSeconds;
  final String? audioUrl;
  final String mediaKind;
  final String? youTubeVideoId;

  bool get isYouTube => mediaKind == 'YouTube' && youTubeVideoId != null;

  /// المسار من الخادم نسبي (/api/v1/library/…/audio) — mediaUrl في الويب.
  String? get streamUrl => audioUrl == null ? null : (audioUrl!.startsWith('http') ? audioUrl : '$apiBase$audioUrl');
}

/// formatDuration في packages/shared/src/lib/format.ts.
String formatDuration(num seconds) {
  final m = seconds ~/ 60;
  final s = (seconds % 60).floor();
  return '$m:${s.toString().padLeft(2, '0')}';
}

typedef LibraryQuery = ({String category, String q});

final libraryTracksProvider = FutureProvider.family<List<AudioTrack>, LibraryQuery>((ref, query) async {
  final qs = {if (query.category.isNotEmpty) 'category': query.category, if (query.q.isNotEmpty) 'q': query.q};
  final path = Uri(path: '/api/v1/library', queryParameters: qs.isEmpty ? null : qs).toString();
  final list = await ref.read(apiProvider).get<List<dynamic>>(path);
  return [for (final t in list) AudioTrack.fromJson(t as Map<String, dynamic>)];
});

final favoritesProvider = FutureProvider<List<AudioTrack>>((ref) async {
  if (!ref.watch(signedInProvider)) return const [];
  final list = await ref.read(apiProvider).get<List<dynamic>>('/api/v1/me/favorites');
  return [for (final t in list) AudioTrack.fromJson(t as Map<String, dynamic>)];
});

enum TrackStatus { idle, loading, playing, paused, error }

typedef LibraryPlayback = ({String? trackId, TrackStatus status});

/// مشغّل المكتبة: مقطع واحد في كل مرة على المشغّل المشترك (يوقف التلاوة الجارية ويوقفه من يبدأ بعده).
class LibraryPlayer extends Notifier<LibraryPlayback> {
  int _run = 0;

  RecitationAudio get _audio => ref.read(recitationAudioProvider);

  @override
  LibraryPlayback build() {
    ref.onDispose(() => _run++);
    return (trackId: null, status: TrackStatus.idle);
  }

  Future<void> toggle(AudioTrack track) async {
    if (state.trackId == track.id) {
      switch (state.status) {
        case TrackStatus.playing || TrackStatus.loading:
          unawaited(_audio.pause());
          state = (trackId: track.id, status: TrackStatus.paused);
          return;
        case TrackStatus.paused:
          unawaited(_audio.resume());
          state = (trackId: track.id, status: TrackStatus.playing);
          return;
        case TrackStatus.idle || TrackStatus.error:
          break;
      }
    }
    final run = ++_run;
    _audio.claim(_preempted);
    state = (trackId: track.id, status: TrackStatus.loading);
    final info = ref.read(discreetProvider) ? neutralNowPlaying : (title: track.title, subtitle: track.sourceLabel);
    final done = _audio.playToEnd(track.streamUrl!, info: info, stream: true);
    if (run == _run) state = (trackId: track.id, status: TrackStatus.playing);
    try {
      await done;
    } catch (_) {
      if (run == _run) state = (trackId: track.id, status: TrackStatus.error);
      return;
    }
    if (run == _run) {
      state = (trackId: null, status: TrackStatus.idle);
      unawaited(_audio.stop());
    }
  }

  void _preempted() {
    _run++;
    state = (trackId: null, status: TrackStatus.idle);
  }
}

final libraryPlayerProvider = NotifierProvider<LibraryPlayer, LibraryPlayback>(LibraryPlayer.new);

/// المكتبة لمن سجّل دخوله، كالويب. بلا جلسة: دعوة الصفحة العامة نفسها، والدخول يعود إلى هنا.
class _SignInPrompt extends ConsumerWidget {
  const _SignInPrompt();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.t;
    return SanadCard(
      child: Column(
        children: [
          const Text(
            'المزيد من التلاوات والأدعية في مكتبة سند',
            textAlign: TextAlign.center,
            style: TextStyle(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 4),
          Text(
            'مجانية بالكامل، بلا اشتراكات ولا إعلانات.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 14, color: t.muted),
          ),
          const SizedBox(height: 12),
          FilledButton(onPressed: () => context.push('/login'), child: Text(ref.read(contentProvider).label('nav.login'))),
        ],
      ),
    );
  }
}

class LibraryScreen extends ConsumerStatefulWidget {
  const LibraryScreen({super.key});

  @override
  ConsumerState<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends ConsumerState<LibraryScreen> {
  String category = '';
  String search = '';
  final _q = TextEditingController();

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final content = ref.watch(contentProvider);
    final signedIn = ref.watch(signedInProvider);
    final query = (category: category, q: search);
    final tracks = signedIn ? ref.watch(libraryTracksProvider(query)) : null;
    final favIds = {...?ref.watch(favoritesProvider).value?.map((f) => f.id)};

    return Scaffold(
      appBar: AppBar(
        actions: [
          if (signedIn)
            Padding(
              padding: const EdgeInsetsDirectional.only(end: 12),
              child: OutlinedButton(onPressed: () => context.push('/favorites'), child: const Text('المفضلة')),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(favoritesProvider);
          if (signedIn) await ref.refresh(libraryTracksProvider(query).future).catchError((_) => <AudioTrack>[]);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
          children: [
            const PageHeader(
              title: 'المكتبة الصوتية',
              subtitle: 'تلاوات وأدعية وأذكار بأصوات القرّاء من مصادر موثوقة، تُراجَع قبل نشرها. اقرأ واستمع بيقين، والشفاء بيد الله وحده.',
            ),
            InkWell(
              onTap: () => context.go('/ruqyah'),
              borderRadius: BorderRadius.circular(Radii.x2l),
              child: Scene(
                theme: SceneTheme.mihrab,
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('الرقية والتحصين مكتوبةً', style: TextStyle(fontWeight: FontWeight.w700)),
                    Text('آيات الرقية بخط المصحف، وأدعية السنة بتخريجها، مع عدّاد للأذكار.', style: TextStyle(fontSize: 14, color: t.sceneSoft)),
                    const SizedBox(height: 6),
                    Text(
                      'افتح ←',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: t.lampGlow),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            if (!signedIn)
              const _SignInPrompt()
            else ...[
              _CategoryTabs(
                selected: category,
                label: (c) => c.isEmpty ? 'الكل' : content.label('audioCategory.$c'),
                onSelect: (c) => setState(() => category = c),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: Semantics(
                      label: 'بحث في المكتبة',
                      child: TextField(
                        controller: _q,
                        textInputAction: TextInputAction.search,
                        onSubmitted: (v) => setState(() => search = v.trim()),
                        // التسمية للقارئ الصوتي فقط (sr-only في الويب)، والظاهر النص الإرشادي
                        decoration: InputDecoration(
                          hintText: 'ابحث بالعنوان أو المصدر',
                          hintStyle: TextStyle(color: t.muted),
                          isDense: true,
                          filled: true,
                          fillColor: t.surface,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(Radii.xl),
                            borderSide: BorderSide(color: t.border),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(Radii.xl),
                            borderSide: BorderSide(color: t.focus, width: 2),
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  OutlinedButton(onPressed: () => setState(() => search = _q.text.trim()), child: const Text('بحث')),
                ],
              ),
              const SizedBox(height: 20),
              tracks!.when(
                loading: () => const Center(
                  child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()),
                ),
                error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(libraryTracksProvider(query))),
                data: (list) => list.isEmpty
                    ? const EmptyState(title: 'لا مقاطع هنا بعد', child: Text('يضيف فريق المحتوى مقاطع جديدة بعد مراجعتها.'))
                    : Column(
                        children: [
                          for (final track in list)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: TrackCard(track: track, isFavorite: favIds.contains(track.id)),
                            ),
                        ],
                      ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class FavoritesScreen extends ConsumerWidget {
  const FavoritesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.t;
    final signedIn = ref.watch(signedInProvider);
    final favorites = ref.watch(favoritesProvider);
    return Scaffold(
      appBar: AppBar(),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
        children: [
          const PageHeader(title: 'المفضلة', subtitle: 'قائمتك الشخصية — لا يراها أحد غيرك.'),
          if (!signedIn)
            const _SignInPrompt()
          else
            favorites.when(
              loading: () => const Center(
                child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()),
              ),
              error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(favoritesProvider)),
              data: (list) => list.isEmpty
                  ? EmptyState(
                      title: 'لم تضف مقاطع بعد',
                      child: TextButton(
                        onPressed: () => context.canPop() ? context.pop() : context.go('/library'),
                        child: Text(
                          'تصفّح المكتبة',
                          style: TextStyle(color: t.primary, decoration: TextDecoration.underline),
                        ),
                      ),
                    )
                  : Column(
                      children: [
                        for (final track in list)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: TrackCard(track: track, isFavorite: true),
                          ),
                      ],
                    ),
            ),
        ],
      ),
    );
  }
}

class _CategoryTabs extends StatelessWidget {
  const _CategoryTabs({required this.selected, required this.label, required this.onSelect});
  final String selected;
  final String Function(String) label;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    return Semantics(
      label: 'التصنيف',
      container: true,
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(Radii.xl),
          border: Border.all(color: t.border),
        ),
        child: Row(
          children: [
            for (final c in libraryCategories)
              Expanded(
                child: Semantics(
                  selected: c == selected,
                  button: true,
                  child: Material(
                    color: c == selected ? t.primary : Colors.transparent,
                    borderRadius: BorderRadius.circular(Radii.lg),
                    child: InkWell(
                      key: ValueKey('category-${c.isEmpty ? 'all' : c}'),
                      borderRadius: BorderRadius.circular(Radii.lg),
                      onTap: () => onSelect(c),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Text(
                          label(c),
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c == selected ? t.primaryContrast : t.muted),
                        ),
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

class TrackCard extends ConsumerStatefulWidget {
  const TrackCard({super.key, required this.track, required this.isFavorite});
  final AudioTrack track;
  final bool isFavorite;

  @override
  ConsumerState<TrackCard> createState() => _TrackCardState();
}

class _TrackCardState extends ConsumerState<TrackCard> {
  bool favBusy = false;
  bool shareBusy = false;
  String? link;
  String? shareError;
  bool copied = false;

  Future<void> _toggleFavorite() async {
    if (favBusy) return;
    setState(() => favBusy = true);
    final api = ref.read(apiProvider);
    try {
      if (widget.isFavorite) {
        await api.del<Object?>('/api/v1/me/favorites/${widget.track.id}');
      } else {
        await api.post<Object?>('/api/v1/me/favorites', body: {'audioTrackId': widget.track.id});
      }
      ref.invalidate(favoritesProvider);
    } catch (_) {
      // كالويب: لا رسالة؛ النجمة تبقى على حالها
    } finally {
      if (mounted) setState(() => favBusy = false);
    }
  }

  Future<void> _share() async {
    setState(() {
      shareBusy = true;
      shareError = null;
    });
    try {
      final l = await ref.read(apiProvider).post<Map<String, dynamic>>('/api/v1/library/tracks/${widget.track.id}/share-link');
      if (mounted) setState(() => link = Uri.https(siteHost, l['publicPath'] as String).toString());
    } on ApiError catch (e) {
      if (mounted) setState(() => shareError = e.friendly);
    } catch (_) {
      if (mounted) setState(() => shareError = 'تعذّر إنشاء الرابط');
    } finally {
      if (mounted) setState(() => shareBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final track = widget.track;
    final content = ref.watch(contentProvider);
    final fav = widget.isFavorite;
    return Semantics(
      container: true,
      child: SanadCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Semantics(
                        header: true,
                        child: Text(track.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                      ),
                      Text('${track.sourceLabel} · ${content.label('audioCategory.${track.category}')}', style: TextStyle(fontSize: 14, color: t.muted)),
                    ],
                  ),
                ),
                Semantics(
                  toggled: fav,
                  child: IconButton(
                    key: ValueKey('fav-${track.id}'),
                    onPressed: _toggleFavorite,
                    tooltip: fav ? 'إزالة من المفضلة' : 'أضف للمفضلة',
                    icon: Icon(fav ? Icons.star_rounded : Icons.star_outline_rounded, color: fav ? t.lamp : t.muted),
                  ),
                ),
              ],
            ),
            if (track.description != null) ...[
              const SizedBox(height: 8),
              Text(track.description!, style: TextStyle(fontSize: 14, height: 1.9, color: t.muted)),
            ],
            const SizedBox(height: 12),
            if (track.isYouTube) _YouTubeLink(track: track) else if (track.streamUrl != null) _TrackPlayer(track: track),
            const SizedBox(height: 12),
            if (link != null)
              Row(
                children: [
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(color: t.surface2, borderRadius: BorderRadius.circular(Radii.lg)),
                      child: Text(link!, textDirection: TextDirection.ltr, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  OutlinedButton(
                    onPressed: () async {
                      await Clipboard.setData(ClipboardData(text: link!));
                      if (mounted) setState(() => copied = true);
                    },
                    child: Text(copied ? 'نُسخ ✓' : 'نسخ الرابط'),
                  ),
                ],
              )
            else
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton(
                  onPressed: shareBusy ? null : _share,
                  child: shareBusy ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('شارك هذا المقطع'),
                ),
              ),
            if (shareError != null) Text(shareError!, style: TextStyle(fontSize: 12, color: t.danger)),
          ],
        ),
      ),
    );
  }
}

/// تشغيل/إيقاف وشريط الموضع والمدة — AudioPlayer في الويب.
class _TrackPlayer extends ConsumerWidget {
  const _TrackPlayer({required this.track});
  final AudioTrack track;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.t;
    final playback = ref.watch(libraryPlayerProvider);
    final mine = playback.trackId == track.id;
    final playing = mine && (playback.status == TrackStatus.playing || playback.status == TrackStatus.loading);
    final audio = ref.watch(recitationAudioProvider);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(color: t.surface2, borderRadius: BorderRadius.circular(Radii.xl)),
      child: Row(
        children: [
          Material(
            color: t.primary,
            shape: const CircleBorder(),
            child: IconButton(
              key: ValueKey('play-${track.id}'),
              onPressed: () => ref.read(libraryPlayerProvider.notifier).toggle(track),
              tooltip: playing ? 'إيقاف ${track.title}' : 'تشغيل ${track.title}',
              icon: PlayIcon(playing: playing, size: 20, color: t.primaryContrast),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: StreamBuilder<PlaybackProgress>(
              stream: mine ? audio.progress : null,
              builder: (context, snap) {
                final pos = mine ? (snap.data?.position ?? Duration.zero) : Duration.zero;
                final total = snap.data?.duration?.inSeconds ?? track.durationSeconds;
                final max = total < 1 ? 1.0 : total.toDouble();
                return Row(
                  children: [
                    Expanded(
                      child: Slider(
                        value: pos.inSeconds.clamp(0, max).toDouble(),
                        max: max,
                        // accent-[var(--primary)] كالويب؛ والتحريك يؤثر في المقطع الجاري وحده
                        activeColor: t.primary,
                        inactiveColor: t.border,
                        onChanged: (v) {
                          if (mine) audio.seek(Duration(seconds: v.round()));
                        },
                        semanticFormatterCallback: (_) => 'موضع التشغيل',
                      ),
                    ),
                    Text(
                      '${formatDuration(pos.inSeconds)} / ${formatDuration(total)}',
                      textDirection: TextDirection.ltr,
                      style: TextStyle(fontSize: 12, color: t.muted),
                    ),
                  ],
                );
              },
            ),
          ),
          if (mine && playback.status == TrackStatus.error) Text('تعذّر التشغيل', style: TextStyle(fontSize: 12, color: t.warning)),
        ],
      ),
    );
  }
}

/// YouTube: لا يُحمَّل شيء قبل الضغط، ثم يُفتح في تطبيقه/المتصفح (youtube-nocookie في الويب).
class _YouTubeLink extends ConsumerWidget {
  const _YouTubeLink({required this.track});
  final AudioTrack track;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.t;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(color: t.surface2, borderRadius: BorderRadius.circular(Radii.xl)),
      child: Row(
        children: [
          Material(
            color: t.primary,
            shape: const CircleBorder(),
            child: IconButton(
              key: ValueKey('youtube-${track.id}'),
              onPressed: () => ref.read(outboundProvider).openUrl(Uri.https('www.youtube.com', '/watch', {'v': track.youTubeVideoId!})),
              tooltip: 'تشغيل ${track.title} من YouTube',
              icon: PlayIcon(playing: false, size: 20, color: t.primaryContrast),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text('يُشغَّل من YouTube عند الضغط.', style: TextStyle(fontSize: 12, color: t.muted)),
          ),
        ],
      ),
    );
  }
}
