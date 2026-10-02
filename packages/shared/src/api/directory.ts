import type { ApiClient } from "./core";
import type { BookingCreated, BookingNote, BookingSummary, DeliveryMode, DirectoryItem, OrganizationPublic, OrganizationTrack, Paged, PractitionerType, ProviderPublic, Slot } from "./types";

export interface DirectoryFilters {
  q?: string;
  track?: OrganizationTrack | null;
  practitionerType?: PractitionerType | null;
  deliveryMode?: DeliveryMode | null;
}

/** الدليل (عام) والحجز (بحساب) — مشتركان بين الويب والجوال. */
export function directoryApi(api: ApiClient["api"]) {
  return {
    search: (f: DirectoryFilters, page = 1, pageSize = 12) => {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (f.q?.trim()) qs.set("q", f.q.trim());
      if (f.track) qs.set("track", f.track);
      if (f.practitionerType) qs.set("practitionerType", f.practitionerType);
      if (f.deliveryMode) qs.set("deliveryMode", f.deliveryMode);
      return api.get<Paged<DirectoryItem>>(`/api/v1/directory?${qs.toString()}`, { auth: false });
    },
    provider: (id: string) => api.get<ProviderPublic>(`/api/v1/providers/${encodeURIComponent(id)}`, { auth: false }),
    organization: (id: string) => api.get<OrganizationPublic>(`/api/v1/organizations/${encodeURIComponent(id)}`, { auth: false }),
    availability: (providerId: string) => api.get<Slot[]>(`/api/v1/providers/${encodeURIComponent(providerId)}/availability`),
  };
}

export interface BookingRequestBody { serviceOfferingId: string; availabilitySlotId: string; beneficiaryNote: string | null; consentToSensitiveNoteProcessing: boolean }

export function bookingApi(api: ApiClient["api"]) {
  return {
    /** مفتاح Idempotency ثابت لكل محاولة إرسال (يولّده التطبيق) — إعادة الإرسال بعد انقطاع لا تُنشئ حجزاً ثانياً. */
    create: (body: BookingRequestBody, idempotencyKey: string) =>
      api.post<BookingCreated>("/api/v1/bookings", body, { headers: { "Idempotency-Key": idempotencyKey } }),
    mine: () => api.get<BookingSummary[]>("/api/v1/me/bookings"),
    get: (id: string) => api.get<BookingSummary>(`/api/v1/bookings/${encodeURIComponent(id)}`),
    note: (id: string) => api.get<BookingNote>(`/api/v1/bookings/${encodeURIComponent(id)}/note`),
    accept: (id: string) => api.post<void>(`/api/v1/bookings/${encodeURIComponent(id)}/accept`),
    cancel: (id: string) => api.post<void>(`/api/v1/bookings/${encodeURIComponent(id)}/cancel`),
  };
}

export const MAX_BOOKING_NOTE = 2000;

/** الملاحظة الحساسة لا تُرسل إلا بموافقة صريحة على معالجتها. */
export const canSubmitBooking = (offeringId: string, slotId: string, note: string, consent: boolean) =>
  !!offeringId && !!slotId && (note.trim().length === 0 || consent) && note.length <= MAX_BOOKING_NOTE;

export const isCancellable = (status: string) => ["Submitted", "UnderReview", "AlternativeProposed", "Accepted"].includes(status);
export const isChatOpen = (status: string) => ["UnderReview", "AlternativeProposed", "Accepted", "AdministrativelyCompleted"].includes(status);
export const isVerified = (status: string) => status === "Approved" || status === "ConditionallyApproved";

/** فترات متاحة مجمّعة حسب اليوم بالترتيب الزمني — dayLabel يحدد تسمية اليوم (بتوقيت الجهاز). */
export function groupSlotsByDay(slots: Slot[], dayLabel: (iso: string) => string): [string, Slot[]][] {
  const map = new Map<string, Slot[]>();
  for (const s of [...slots].sort((a, b) => a.startUtc.localeCompare(b.startUtc))) {
    const day = dayLabel(s.startUtc);
    map.set(day, [...(map.get(day) ?? []), s]);
  }
  return [...map.entries()];
}
