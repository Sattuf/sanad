import 'dart:math';

import '../library/library_screens.dart' show AudioTrack;

/*
  نماذج الدليل والحجز والمحادثة والتوصيات — نظير packages/shared/src/api/types.ts بالحقول نفسها.
  الحقول التي لا تعرضها شاشات المستفيد لا تُقرأ.
*/

List<String> _strings(Object? v) => ((v as List?) ?? const []).cast<String>();

/// شارة التوثيق الإداري (VerificationBadge).
class Verification {
  const Verification({required this.status, this.lastCheckedAtUtc, required this.isConditional});

  factory Verification.fromJson(Map<String, dynamic> j) =>
      Verification(status: j['status'] as String, lastCheckedAtUtc: j['lastCheckedAtUtc'] as String?, isConditional: j['isConditional'] as bool? ?? false);

  final String status;
  final String? lastCheckedAtUtc;
  final bool isConditional;

  bool get isValid => status == 'Approved' || status == 'ConditionallyApproved';
}

class DirectoryItem {
  const DirectoryItem({
    required this.kind,
    required this.id,
    required this.displayName,
    this.title,
    required this.track,
    this.practitionerType,
    this.deliveryMode,
    this.city,
    required this.verification,
    this.organizationName,
    required this.summary,
  });

  factory DirectoryItem.fromJson(Map<String, dynamic> j) => DirectoryItem(
    kind: j['kind'] as String,
    id: j['id'] as String,
    displayName: j['displayName'] as String,
    title: j['title'] as String?,
    track: j['track'] as String,
    practitionerType: j['practitionerType'] as String?,
    deliveryMode: j['deliveryMode'] as String?,
    city: j['city'] as String?,
    verification: Verification.fromJson(j['verification'] as Map<String, dynamic>),
    organizationName: j['organizationName'] as String?,
    summary: j['summary'] as String? ?? '',
  );

  final String kind;
  final String id;
  final String displayName;
  final String? title;
  final String track;
  final String? practitionerType;
  final String? deliveryMode;
  final String? city;
  final Verification verification;
  final String? organizationName;
  final String summary;

  bool get isOrganization => kind == 'Organization';
  String get path => isOrganization ? '/organizations/$id' : '/providers/$id';
}

class DirectoryPage {
  const DirectoryPage({required this.items, required this.page, required this.pageSize, required this.total});

  factory DirectoryPage.fromJson(Map<String, dynamic> j) => DirectoryPage(
    items: [for (final i in (j['items'] as List)) DirectoryItem.fromJson(i as Map<String, dynamic>)],
    page: (j['page'] as num).toInt(),
    pageSize: (j['pageSize'] as num).toInt(),
    total: (j['total'] as num).toInt(),
  );

  final List<DirectoryItem> items;
  final int page;
  final int pageSize;
  final int total;

  int get pages => pageSize == 0 ? 0 : (total / pageSize).ceil();
}

class Offering {
  const Offering({
    required this.id,
    required this.category,
    required this.description,
    required this.cancellationPolicy,
    required this.explicitExclusions,
    required this.sessionDurationMinutes,
  });

  factory Offering.fromJson(Map<String, dynamic> j) => Offering(
    id: j['id'] as String,
    category: j['category'] as String,
    description: j['description'] as String,
    cancellationPolicy: j['cancellationPolicy'] as String,
    explicitExclusions: _strings(j['explicitExclusions']),
    sessionDurationMinutes: (j['sessionDurationMinutes'] as num).toInt(),
  );

  final String id;
  final String category;
  final String description;
  final String cancellationPolicy;
  final List<String> explicitExclusions;
  final int sessionDurationMinutes;
}

class ProviderPublic {
  const ProviderPublic({
    required this.id,
    required this.displayName,
    required this.declaredTitle,
    required this.practitionerType,
    required this.track,
    required this.practiceScope,
    required this.languages,
    required this.deliveryMode,
    this.city,
    required this.professionalBoundariesNote,
    this.organizationId,
    this.organizationName,
    required this.verification,
    required this.offerings,
  });

  factory ProviderPublic.fromJson(Map<String, dynamic> j) => ProviderPublic(
    id: j['id'] as String,
    displayName: j['displayName'] as String,
    declaredTitle: j['declaredTitle'] as String,
    practitionerType: j['practitionerType'] as String,
    track: j['track'] as String,
    practiceScope: j['practiceScope'] as String,
    languages: _strings(j['languages']),
    deliveryMode: j['deliveryMode'] as String,
    city: j['city'] as String?,
    professionalBoundariesNote: j['professionalBoundariesNote'] as String,
    organizationId: j['organizationId'] as String?,
    organizationName: j['organizationName'] as String?,
    verification: Verification.fromJson(j['verification'] as Map<String, dynamic>),
    offerings: [for (final o in (j['offerings'] as List? ?? const [])) Offering.fromJson(o as Map<String, dynamic>)],
  );

  final String id;
  final String displayName;
  final String declaredTitle;
  final String practitionerType;
  final String track;
  final String practiceScope;
  final List<String> languages;
  final String deliveryMode;
  final String? city;
  final String professionalBoundariesNote;
  final String? organizationId;
  final String? organizationName;
  final Verification verification;
  final List<Offering> offerings;
}

class OrganizationPublic {
  const OrganizationPublic({
    required this.id,
    required this.displayName,
    required this.legalName,
    required this.track,
    required this.publicDescription,
    this.city,
    this.verificationSourceUrl,
    required this.verification,
    required this.providers,
  });

  factory OrganizationPublic.fromJson(Map<String, dynamic> j) => OrganizationPublic(
    id: j['id'] as String,
    displayName: j['displayName'] as String,
    legalName: j['legalName'] as String,
    track: j['track'] as String,
    publicDescription: j['publicDescription'] as String,
    city: j['city'] as String?,
    verificationSourceUrl: j['verificationSourceUrl'] as String?,
    verification: Verification.fromJson(j['verification'] as Map<String, dynamic>),
    providers: [for (final p in (j['providers'] as List? ?? const [])) DirectoryItem.fromJson(p as Map<String, dynamic>)],
  );

  final String id;
  final String displayName;
  final String legalName;
  final String track;
  final String publicDescription;
  final String? city;
  final String? verificationSourceUrl;
  final Verification verification;
  final List<DirectoryItem> providers;
}

class Slot {
  const Slot({required this.id, required this.startUtc});

  factory Slot.fromJson(Map<String, dynamic> j) => Slot(id: j['id'] as String, startUtc: j['startUtc'] as String);

  final String id;
  final String startUtc;
}

class BookingSummary {
  const BookingSummary({
    required this.id,
    required this.status,
    required this.slotStartUtc,
    required this.providerProfileId,
    required this.providerDisplayName,
    required this.serviceCategory,
    this.administrativeReasonForRejection,
  });

  factory BookingSummary.fromJson(Map<String, dynamic> j) => BookingSummary(
    id: j['id'] as String,
    status: j['status'] as String,
    slotStartUtc: j['slotStartUtc'] as String,
    providerProfileId: j['providerProfileId'] as String,
    providerDisplayName: j['providerDisplayName'] as String,
    serviceCategory: j['serviceCategory'] as String,
    administrativeReasonForRejection: j['administrativeReasonForRejection'] as String?,
  );

  final String id;
  final String status;
  final String slotStartUtc;
  final String providerProfileId;
  final String providerDisplayName;
  final String serviceCategory;
  final String? administrativeReasonForRejection;

  static const _cancellable = {'Submitted', 'UnderReview', 'AlternativeProposed', 'Accepted'};
  static const _chatOpen = {'UnderReview', 'AlternativeProposed', 'Accepted', 'AdministrativelyCompleted'};

  bool get cancellable => _cancellable.contains(status);
  bool get chatOpen => _chatOpen.contains(status);
  bool get confirmed => status == 'Accepted' || status == 'AdministrativelyCompleted';
}

/// statusTone في packages/shared/src/lib/status.ts.
String statusTone(String status) {
  if (status == 'Accepted' || status == 'AdministrativelyCompleted') return 'success';
  if (status == 'AlternativeProposed' || status == 'UnderReview' || status == 'Submitted') return 'lamp';
  return 'neutral';
}

class Conversation {
  const Conversation({required this.id, required this.status, required this.counterpartDisplayName});

  factory Conversation.fromJson(Map<String, dynamic> j) =>
      Conversation(id: j['id'] as String, status: j['status'] as String, counterpartDisplayName: j['counterpartDisplayName'] as String);

  final String id;
  final String status;
  final String counterpartDisplayName;

  bool get active => status == 'Active';
}

class ChatMessage {
  const ChatMessage({required this.id, required this.isMine, required this.body, required this.sentAtUtc});

  factory ChatMessage.fromJson(Map<String, dynamic> j) =>
      ChatMessage(id: j['id'] as String, isMine: j['isMine'] as bool, body: j['body'] as String, sentAtUtc: j['sentAtUtc'] as String);

  final String id;
  final bool isMine;
  final String body;
  final String sentAtUtc;
}

class Recommendation {
  const Recommendation({
    required this.id,
    required this.providerDisplayName,
    required this.guidanceText,
    required this.recommendedTracks,
    required this.recordedAtUtc,
    this.acknowledgedAtUtc,
  });

  factory Recommendation.fromJson(Map<String, dynamic> j) => Recommendation(
    id: j['id'] as String,
    providerDisplayName: j['providerDisplayName'] as String,
    guidanceText: j['guidanceText'] as String,
    recommendedTracks: [for (final t in (j['recommendedTracks'] as List? ?? const [])) AudioTrack.fromJson(t as Map<String, dynamic>)],
    recordedAtUtc: j['recordedAtUtc'] as String,
    acknowledgedAtUtc: j['acknowledgedAtUtc'] as String?,
  );

  final String id;
  final String providerDisplayName;
  final String guidanceText;
  final List<AudioTrack> recommendedTracks;
  final String recordedAtUtc;
  final String? acknowledgedAtUtc;
}

/// مفتاح تكرار لكل محاولة إرسال (newIdempotencyKey في الويب) — UUID v4.
String newIdempotencyKey([int Function(int max)? next]) {
  final rand = next ?? _secureRandom;
  final b = List<int>.generate(16, (_) => rand(256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
}

int _secureRandom(int max) => _rng.nextInt(max);
final _rng = Random.secure();
