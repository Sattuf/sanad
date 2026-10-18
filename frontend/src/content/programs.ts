import type { Tint } from "@sanad/shared/content/companion/programs";

// البرامج نفسها في @sanad/shared (مشتركة مع تطبيق Flutter — ADR-0023)؛ هنا ألوان الويب فقط.
export * from "@sanad/shared/content/companion/programs";

export const TINT: Record<Tint, { bg: string; ring: string; ink: string }> = {
  teal: { bg: "var(--bg-deep)", ring: "var(--primary)", ink: "var(--primary)" },
  sky: { bg: "var(--sky)", ring: "var(--sky-strong)", ink: "var(--sky-strong)" },
  sage: { bg: "var(--sage)", ring: "var(--success)", ink: "var(--success)" },
  sand: { bg: "var(--sand)", ring: "var(--lamp)", ink: "var(--lamp)" },
};
