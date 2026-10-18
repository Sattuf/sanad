import 'dart:convert';

/*
  «الرقية والتحصين» و«الصحة والطمأنينة» والورد اليومي — نظير packages/shared/src/content/ruqyah.ts وwird.ts.
  النصوص كلها من assets/content/ruqyah.json المولَّد؛ والمنطق هنا تحرسه متجهات wird المشتركة مع Vitest.
*/

enum SceneTheme { lantern, dawn, dusk, night, mihrab, manuscript }

class RuqyahItem {
  const RuqyahItem({required this.kind, required this.title, this.ref, this.text, this.source, this.note, this.repeat});

  factory RuqyahItem.fromJson(Map<String, dynamic> j) => RuqyahItem(
        kind: j['kind'] as String,
        title: j['title'] as String,
        ref: j['ref'] as String?,
        text: j['text'] as String?,
        source: j['source'] as String?,
        note: j['note'] as String?,
        repeat: j['repeat'] as int?,
      );

  /// quran | dua
  final String kind;
  final String title;
  final String? ref;
  final String? text;
  final String? source;
  final String? note;
  final int? repeat;

  bool get isQuran => kind == 'quran';

  /// عدد التكرار المطلوب (target في wird.ts).
  int get target => repeat ?? 1;
}

class Collection {
  const Collection({required this.id, required this.title, required this.subtitle, required this.group, required this.theme, required this.intro, required this.items});

  factory Collection.fromJson(Map<String, dynamic> j) => Collection(
        id: j['id'] as String,
        title: j['title'] as String,
        subtitle: j['subtitle'] as String,
        group: j['group'] as String,
        theme: SceneTheme.values.byName(j['theme'] as String),
        intro: j['intro'] as String,
        items: (j['items'] as List).map((i) => RuqyahItem.fromJson(i as Map<String, dynamic>)).toList(),
      );

  final String id;
  final String title;
  final String subtitle;
  final String group;
  final SceneTheme theme;
  final String intro;
  final List<RuqyahItem> items;
}

typedef GuidePoint = ({String text, String? evidence});
typedef GuideSection = ({String heading, List<GuidePoint> points, ({String label, String to})? cta});

class Guide {
  const Guide({required this.id, required this.kind, required this.title, required this.subtitle, required this.theme, required this.intro, required this.sections});

  factory Guide.fromJson(Map<String, dynamic> j) => Guide(
        id: j['id'] as String,
        kind: j['kind'] as String,
        title: j['title'] as String,
        subtitle: j['subtitle'] as String,
        theme: SceneTheme.values.byName(j['theme'] as String),
        intro: j['intro'] as String,
        sections: [
          for (final s in (j['sections'] as List).cast<Map<String, dynamic>>())
            (
              heading: s['heading'] as String,
              points: [for (final p in (s['points'] as List).cast<Map<String, dynamic>>()) (text: p['text'] as String, evidence: p['evidence'] as String?)],
              cta: s['cta'] == null ? null : (label: (s['cta'] as Map)['label'] as String, to: (s['cta'] as Map)['to'] as String),
            ),
        ],
      );

  final String id;

  /// method | awareness | health
  final String kind;
  final String title;
  final String subtitle;
  final SceneTheme theme;
  final String intro;
  final List<GuideSection> sections;

  /// رابط الدليل حسب قسمه (guidePath في ruqyah.ts).
  String get path => kind == 'health' ? '/health/$id' : '/ruqyah/guide/$id';
}

typedef WirdSlot = ({String id, String label, String collection, String defaultTime});

class RuqyahContent {
  RuqyahContent._({
    required this.groups,
    required this.groupOrder,
    required this.heroVerses,
    required this.collections,
    required this.guides,
    required this.slots,
    required this.maxCount,
    required this.reciters,
    required this.slotByHour,
    required this.suggestedWirdByHour,
  });

  factory RuqyahContent.fromJson(String source) {
    final j = jsonDecode(source) as Map<String, dynamic>;
    final wird = j['wird'] as Map<String, dynamic>;
    return RuqyahContent._(
      groups: (j['groups'] as Map<String, dynamic>).map((k, v) => MapEntry(k, (title: (v as Map)['title'] as String, text: v['text'] as String))),
      groupOrder: (j['groupOrder'] as List).cast<String>(),
      heroVerses: [for (final v in (j['heroVerses'] as List).cast<Map<String, dynamic>>()) (ref: v['ref'] as String, index: v['index'] as int)],
      collections: (j['collections'] as List).map((c) => Collection.fromJson(c as Map<String, dynamic>)).toList(),
      guides: (j['guides'] as List).map((g) => Guide.fromJson(g as Map<String, dynamic>)).toList(),
      slots: [
        for (final s in (wird['slots'] as List).cast<Map<String, dynamic>>())
          (id: s['id'] as String, label: s['label'] as String, collection: s['collection'] as String, defaultTime: s['defaultTime'] as String),
      ],
      maxCount: wird['maxCount'] as int,
      reciters: [for (final r in (j['reciters'] as List).cast<Map<String, dynamic>>()) (id: r['id'] as String, name: r['name'] as String)],
      slotByHour: (wird['slotByHour'] as List).cast<String?>(),
      suggestedWirdByHour: [for (final s in (j['suggestedWirdByHour'] as List).cast<Map<String, dynamic>>()) (id: s['id'] as String, label: s['label'] as String)],
    );
  }

  final Map<String, ({String title, String text})> groups;
  final List<String> groupOrder;
  final List<({String ref, int index})> heroVerses;
  final List<Collection> collections;
  final List<Guide> guides;
  final List<WirdSlot> slots;
  final int maxCount;

  /// القرّاء (recitation.ts) — الأول هو الافتراضي.
  final List<({String id, String name})> reciters;
  /// معرّف وقت الورد لكل ساعة (slotForHour في wird.ts، محسوباً في التصدير).
  final List<String?> slotByHour;

  /// الورد المقترح لكل ساعة (suggestedWird في ruqyah.ts، محسوباً في التصدير).
  final List<({String id, String label})> suggestedWirdByHour;

  Collection? collection(String? id) => collections.where((c) => c.id == id).firstOrNull;
  Guide? guide(String? id) => guides.where((g) => g.id == id).firstOrNull;
  List<Guide> guidesOf(String kind) => guides.where((g) => g.kind == kind).toList();

  /// الوقت الذي يناسبه كل ورد بحسب الساعة المحلية — أو null خارج الأوقات.
  WirdSlot? slotForHour(int hour) {
    final id = slotByHour[hour];
    return id == null ? null : slots.firstWhere((s) => s.id == id);
  }

  ({String id, String label}) suggestedWird(int hour) => suggestedWirdByHour[hour];
}

/// دعاء أُضيف بعد المراجعة (GET /api/v1/public/ruqyah/duas).
class PublishedDua {
  const PublishedDua({required this.id, required this.collectionId, required this.title, required this.text, required this.source, required this.repeat, required this.sortOrder, this.note});

  factory PublishedDua.fromJson(Map<String, dynamic> j) => PublishedDua(
        id: j['id'] as String,
        collectionId: j['collectionId'] as String,
        title: j['title'] as String,
        text: j['text'] as String,
        source: j['source'] as String,
        note: j['note'] as String?,
        repeat: j['repeat'] as int,
        sortOrder: j['sortOrder'] as int,
      );

  final String id;
  final String collectionId;
  final String title;
  final String text;
  final String source;
  final String? note;
  final int repeat;
  final int sortOrder;
}

/// عنصر في القارئ بمفتاحه الثابت: رقمه في المجموعة، أو `d:<id>` للأدعية المضافة.
typedef Entry = ({String key, RuqyahItem item});
typedef Counts = Map<String, int>;

List<Entry> buildEntries(String collectionId, List<RuqyahItem> items, [List<PublishedDua> duas = const []]) {
  final extra = duas.where((d) => d.collectionId == collectionId).toList()..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
  return [
    for (final (i, item) in items.indexed) (key: '$i', item: item),
    for (final d in extra) (key: 'd:${d.id}', item: RuqyahItem(kind: 'dua', title: d.title, text: d.text, source: d.source, note: d.note, repeat: d.repeat)),
  ];
}

/// دمج تقدّم الجهاز مع الحساب — الأكبر يغلب.
Counts mergeCounts(Counts local, Counts? server) {
  if (server == null) return local;
  final merged = {...local};
  for (final e in server.entries) {
    merged[e.key] = (merged[e.key] ?? 0) > e.value ? merged[e.key]! : e.value;
  }
  return merged;
}

int countCompleted(List<Entry> entries, Counts counts) => entries.where((e) => (counts[e.key] ?? 0) >= e.item.target).length;

/// زيادة عدّاد عنصر حتى عدد تكراره، لا أكثر.
Counts bumpCount(Counts counts, Entry entry) {
  final next = (counts[entry.key] ?? 0) + 1;
  return {...counts, entry.key: next < entry.item.target ? next : entry.item.target};
}

/// جسم الحفظ في الحساب: العناصر المعروفة فقط، وكل عدّاد ضمن الحد.
Map<String, Object> wirdPayload(String collectionId, String day, List<Entry> entries, Counts counts, {int maxCount = 1000}) => {
      'collectionId': collectionId,
      'day': day,
      'counts': {for (final e in entries) e.key: (counts[e.key] ?? 0) < maxCount ? (counts[e.key] ?? 0) : maxCount},
      'completedItems': countCompleted(entries, counts),
      'totalItems': entries.length,
    };

/// "HH:mm" ← ساعة ودقيقة، أو null إن كانت غير صالحة.
({int hour, int minute})? parseTime(String value) {
  final m = RegExp(r'^([01]\d|2[0-3]):([0-5]\d)$').firstMatch(value);
  return m == null ? null : (hour: int.parse(m[1]!), minute: int.parse(m[2]!));
}
