export function statusTone(status: string) {
  if (status === "Accepted" || status === "AdministrativelyCompleted") return "success" as const;
  if (status === "AlternativeProposed" || status === "UnderReview" || status === "Submitted") return "lamp" as const;
  return "neutral" as const;
}
