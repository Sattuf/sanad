// أنواع مطابقة لـ DTOs الخلفية (Sanad.Application). عميل مكتوب يدوياً — راجع docs/adr/0014.

export type Role =
  | "Beneficiary"
  | "OrganizationRepresentative"
  | "Practitioner"
  | "Coordinator"
  | "ContentManager"
  | "PrivacySecurityOfficer"
  | "SystemAdmin";

export type PractitionerType = "ReligiousPractitioner";
export type OrganizationTrack = "WaqfFree" | "DawahGuidance" | "IndependentConsultant";
export type DeliveryMode = "InPerson" | "Remote" | "Both";
export type AudioCategory = "QuranRecitation" | "Dua" | "Adhkar";
export type ConsentType = "TermsOfService" | "PrivacyPolicy" | "SensitiveDataProcessing" | "MarketingCommunication";
export type ReportCategory = "Impersonation" | "FinancialExploitation" | "Harassment" | "UnauthorizedClaim" | "PrivacyViolation" | "Other";
export type ReportSeverity = "Low" | "Medium" | "High" | "Critical";
export type SignInStage = "Succeeded" | "RequiresPasswordChange" | "RequiresTwoFactorSetup" | "RequiresTwoFactorCode";

export interface AuthResponse {
  userId: string;
  stage: SignInStage;
  isNewUser: boolean;
  accessToken: string | null;
  accessTokenExpiresAtUtc: string | null;
  refreshToken: string | null;
  refreshTokenExpiresAtUtc: string | null;
  ticket: string | null;
}

export interface AuthTokens { accessToken: string; accessTokenExpiresAtUtc: string; refreshToken: string; refreshTokenExpiresAtUtc: string }
export interface TwoFactorSetupInfo { sharedKey: string; authenticatorUri: string }
/** google: مسار الويب (إعادة توجيه). googleNative/apple: دخول الجوال الأصلي برمز هوية (ADR-0019). */
export interface AuthProviders { google: boolean; captchaEnabled: boolean; captchaSiteKey: string | null; googleNative: boolean; apple: boolean }
export interface MobileMinVersion { ios: string; android: string; iosStoreUrl: string | null; androidStoreUrl: string | null }

export interface MyProfile {
  id: string;
  email: string | null;
  emailConfirmed: boolean;
  phoneNumber: string | null;
  displayName: string;
  roles: Role[];
  twoFactorEnabled: boolean;
  providerProfileId: string | null;
  providerProfileStatus: string | null;
  practitionerType: PractitionerType | null;
  activeConsents: ConsentType[];
  hasPendingUpgradeRequest: boolean;
  hideIdentityUntilBookingConfirmed: boolean;
  quietHoursStartHourUtc: number | null;
  quietHoursEndHourUtc: number | null;
}

export interface VerificationBadge { status: string; lastCheckedAtUtc: string | null; expiresAtUtc: string | null; isConditional: boolean }

export interface DirectoryItem {
  kind: "Provider" | "Organization";
  id: string;
  displayName: string;
  title: string | null;
  track: OrganizationTrack;
  practitionerType: PractitionerType | null;
  deliveryMode: DeliveryMode | null;
  city: string | null;
  languages: string[];
  verification: VerificationBadge;
  organizationName: string | null;
  summary: string;
}

export interface Paged<T> { items: T[]; page: number; pageSize: number; total: number }

export interface ServiceOfferingPublic {
  id: string; category: string; description: string; cancellationPolicy: string; explicitExclusions: string[]; sessionDurationMinutes: number;
}

export interface ProviderPublic {
  id: string; displayName: string; declaredTitle: string; practitionerType: PractitionerType; track: OrganizationTrack; practiceScope: string;
  languages: string[]; deliveryMode: DeliveryMode; city: string | null; professionalBoundariesNote: string; organizationId: string | null;
  organizationName: string | null; verification: VerificationBadge; offerings: ServiceOfferingPublic[];
}

export interface OrganizationPublic {
  id: string; displayName: string; legalName: string; track: OrganizationTrack; publicDescription: string; city: string | null;
  verificationSourceUrl: string | null; verification: VerificationBadge; providers: DirectoryItem[];
}

export interface Transparency { publishedProviders: number; publishedOrganizations: number }

export interface Slot { id: string; startUtc: string; endUtc: string; status: string }

export interface BookingSummary {
  id: string; status: string; slotStartUtc: string; slotEndUtc: string; providerProfileId: string; providerDisplayName: string;
  serviceCategory: string; counterpartDisplayName: string | null; administrativeReasonForRejection: string | null; conversationId: string | null;
}

export interface BookingCreated { id: string; status: string; slotStartUtc: string; slotEndUtc: string }
export interface BookingNote { bookingId: string; note: string | null }

export interface Conversation { id: string; bookingRequestId: string; status: string; lastMessageAtUtc: string | null; counterpartDisplayName: string }
export interface ChatMessage { id: string; conversationId: string; senderUserId: string; isMine: boolean; body: string; status: string; sentAtUtc: string }
export interface PostedMessage { id: string; conversationId: string; sentAtUtc: string }

export interface CaseNote { id: string; bookingRequestId: string; authoredByProviderProfileId: string; note: string; recordedAtUtc: string }

/** audioUrl للملفات المخزّنة فقط؛ مقاطع YouTube تُعرض بمشغّل مضمَّن. durationSeconds = 0 تعني غير معروفة. */
export interface AudioTrack {
  id: string; title: string; sourceLabel: string; description: string | null; category: AudioCategory; durationSeconds: number;
  audioUrl: string | null; mediaKind: "StoredAudio" | "YouTube"; youTubeVideoId: string | null; sourceUrl: string | null;
}

export interface CatalogMoshaf { id: number; name: string; surahs: number[] }
export interface CatalogReciter { id: number; name: string; moshafs: CatalogMoshaf[] }
export interface CatalogSurah { number: number; name: string; ayahCount: number }
export interface LibraryCatalog {
  surahs: CatalogSurah[]; surahReciters: CatalogReciter[]; ayahReciters: Array<{ id: string; name: string }>;
  adhkar: Array<{ id: number; title: string }>; unavailable: string[]; allowedYouTubeChannels: string[];
}
export interface AudioTrackAdmin extends AudioTrack { isPublished: boolean; publishedAtUtc: string | null }

export interface Recommendation {
  id: string; bookingRequestId: string; providerDisplayName: string; guidanceText: string; recommendedTracks: AudioTrack[];
  recordedAtUtc: string; acknowledgedAtUtc: string | null;
}

export interface SharedLink { shortCode: string; publicPath: string }
export interface PublicSharedTrack { shortCode: string; track: AudioTrack }

export interface ConsentStatus { type: ConsentType; accepted: boolean; acceptedVersion: string | null; currentVersion: string; needsReacceptance: boolean; acceptedAtUtc: string | null }
export interface ConsentHistoryItem { type: ConsentType; policyVersion: string; acceptedAtUtc: string; revokedAtUtc: string | null }
export interface AccessLogEntry { occurredAtUtc: string; action: string; actorRole: string; bookingRequestId: string | null }

export interface VerificationSummary {
  id: string; subjectType: string; subjectId: string; declaredPractitionerType: PractitionerType | null; declaredTitle: string | null;
  documentType: string; issuingAuthority: string; status: string; rejectionReason: string | null; submittedAtUtc: string;
  lastCheckedAtUtc: string | null; expiresAtUtc: string | null;
}

export interface VerificationQueueItem {
  verification: VerificationSummary; applicantDisplayName: string | null; documentMatchesDeclaredType: boolean; hasDocument: boolean; organizationName: string | null;
}

export interface ServiceOffering extends ServiceOfferingPublic { isActive: boolean }

export interface MyProviderProfile {
  id: string; displayName: string; declaredTitle: string; practitionerType: PractitionerType; practiceScope: string; languages: string[];
  deliveryMode: DeliveryMode; city: string | null; professionalBoundariesNote: string; status: string; suspensionReasonCode: string | null;
  isProfileComplete: boolean; verification: VerificationBadge; offerings: ServiceOffering[];
}

export interface OrganizationAdmin {
  id: string; legalName: string; tradeName: string | null; track: OrganizationTrack; status: string; city: string | null;
  latestVerificationId: string | null; latestVerificationStatus: string | null; verificationExpiresAtUtc: string | null;
}

export interface ProviderAdmin { id: string; userId: string; displayName: string; practitionerType: PractitionerType; status: string; suspensionReasonCode: string | null; organizationId: string | null }

export interface ReportItem {
  id: string; targetType: string; targetSubjectId: string; escalationSubjectId: string; category: ReportCategory; severity: ReportSeverity;
  status: string; hasDescription: boolean; isSubstantiated: boolean | null; submittedAtUtc: string;
}
export interface ReportDetail { report: ReportItem; description: string | null; currentEscalationLevel: string | null }
export interface EscalationCase { id: string; subjectAccountId: string; level: string; documentedReportsCount: number; isOpen: boolean; lastRecomputedAtUtc: string | null }

export interface UserSummary { id: string; email: string | null; phoneNumber: string | null; displayName: string; roles: Role[]; twoFactorEnabled: boolean; createdAtUtc: string; isDeleted: boolean }
export interface UserPage { items: UserSummary[]; total: number }

export interface AppNotification { id: string; kind: string; title: string; body: string; link: string | null; createdAtUtc: string; isRead: boolean }
export interface UploadedFile { id: string; contentType: string; sizeBytes: number }
