import { api } from "./client";

// العقد مع /api/v1/…/companion — يطابق DTOs الخلفية في Sanad.Application.Modules.Companion.

export type ServerItem =
  | { kind: "Quran"; quranKey: string; title: string; note?: string | null; repeat: number }
  | { kind: "Dhikr"; title: string; text: string; source: string; note?: string | null; repeat: number }
  | { kind: "Note"; text: string; repeat: number };

export interface ServerAuthor { id: string; displayName: string; bio: string; consentDate: string | null }
export interface ServerPlanSummary { id: string; key: string; version: number; title: string; summary: string; durationDays: 7 | 14 | 21 | 40; minutesPerDay: number; author: ServerAuthor }
export interface ServerPlan extends ServerPlanSummary {
  contents: string;
  days: { day: number; items: ServerItem[] }[];
  isCurrent: boolean;
  publishedAtUtc: string | null;
  safetyCheckedAtUtc: string | null;
}

export type ServerReminder = "AfterFajr" | "AfterMaghrib" | "BeforeSleep";
export interface ServerEnrollment {
  id: string; planId: string; planKey: string; planVersion: number; durationDays: number; startedAtUtc: string;
  completedDays: number[]; lastCompletedOn: string | null; reminder: ServerReminder | null; currentDay: number; isFinished: boolean;
}

export interface KhatmaMember { memberKey: string; displayName: string; isMe: boolean; isOwner: boolean; assignedJuz: number; doneJuz: number }
export interface KhatmaJuzDto { index: number; memberKey: string | null; isMine: boolean; done: boolean }
export interface GroupKhatma {
  id: string; mode: "Solo" | "Group"; title: string; intention: string | null; isOwner: boolean; round: number; targetDate: string | null;
  completedAtUtc: string | null; doneCount: number; members: KhatmaMember[]; juz: KhatmaJuzDto[]; inviteCode: string | null; updatedAtUtc: string | null;
}
export interface InvitePreview { title: string; memberCount: number; doneCount: number; alreadyMember: boolean; khatmaId: string | null }
export type KhatmaAction = "MarkDone" | "MarkUndone" | "Claim" | "Release" | "Distribute" | "NewRound" | "RotateInvite" | "Leave" | "RemoveMember";

export interface PushConfig { enabled: boolean; publicKey: string | null }

const anon = { auth: false } as const;

export const companionApi = {
  plans: () => api.get<ServerPlanSummary[]>("/api/v1/public/companion/plans", anon),
  plan: (id: string) => api.get<ServerPlan>(`/api/v1/public/companion/plans/${id}`, anon),
  config: () => api.get<{ supportUrl: string | null }>("/api/v1/public/companion/config", anon),
  events: (events: { name: string; dimension: string }[]) => api.post<void>("/api/v1/public/companion/events", { events }, anon),
  pushConfig: () => api.get<PushConfig>("/api/v1/public/reminders/push-config", anon),

  enrollment: () => api.get<{ enrollment: ServerEnrollment | null }>("/api/v1/me/companion/enrollment"),
  start: (planId: string, reminder: ServerReminder | null, completedDays: number[], lastCompletedOn: string | null) =>
    api.post<ServerEnrollment>("/api/v1/me/companion/enrollment", { planId, reminder, completedDays, lastCompletedOn }),
  progress: (id: string, completedDays: number[], lastCompletedOn: string | null) =>
    api.put<ServerEnrollment>(`/api/v1/me/companion/enrollment/${id}/progress`, { completedDays, lastCompletedOn }),
  reminder: (reminder: ServerReminder | null) => api.patch<void>("/api/v1/me/companion/enrollment/reminder", { reminder }),
  stop: () => api.del<void>("/api/v1/me/companion/enrollment"),

  khatmas: () => api.get<GroupKhatma[]>("/api/v1/me/companion/khatmas"),
  khatma: (id: string) => api.get<GroupKhatma>(`/api/v1/me/companion/khatmas/${id}`),
  createKhatma: (body: { mode: "Solo" | "Group"; title: string; intention: string | null; targetDate: string | null; displayName: string }) =>
    api.post<GroupKhatma>("/api/v1/me/companion/khatmas", body),
  updateKhatma: (id: string, body: { title: string; intention: string | null; targetDate: string | null }) =>
    api.put<GroupKhatma>(`/api/v1/me/companion/khatmas/${id}`, body),
  act: (id: string, action: KhatmaAction, juz?: number[], memberKey?: string) =>
    api.post<GroupKhatma>(`/api/v1/me/companion/khatmas/${id}/actions`, { action, juz, memberKey }),
  deleteKhatma: (id: string) => api.del<void>(`/api/v1/me/companion/khatmas/${id}`),
  preview: (code: string) => api.get<InvitePreview>(`/api/v1/me/companion/invites/${encodeURIComponent(code)}`),
  join: (code: string, displayName: string) => api.post<GroupKhatma>(`/api/v1/me/companion/invites/${encodeURIComponent(code)}/join`, { displayName }),

  saveDevice: (body: { endpoint: string; p256dh: string; auth: string; timeZone: string; morning: string | null; evening: string | null; sleep: string | null }) =>
    api.put("/api/v1/me/reminders/device", { ...body, client: "Companion" }),
  removeDevice: (endpoint: string) => api.post<void>("/api/v1/me/reminders/device/remove", { endpoint }),
  testDevice: (endpoint: string) => api.post<void>("/api/v1/me/reminders/device/test", { endpoint }),
};
