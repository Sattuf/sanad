import { bookingApi, directoryApi } from "@sanad/shared/api/directory";
import { ar } from "@sanad/shared/i18n/ar";
import { statusTone } from "@sanad/shared/lib/status";
import { api } from "@/lib/api";

export const directory = directoryApi(api);
export const bookings = bookingApi(api);

export const bookingStatusLabel = (status: string) => (ar.bookingStatus as Record<string, string>)[status] ?? status;
export const bookingTagTone = (status: string) => (statusTone(status) === "success" ? "success" : statusTone(status) === "lamp" ? "primary" : "neutral");
