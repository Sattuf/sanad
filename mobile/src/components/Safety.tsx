import type { VerificationBadge as Badge } from "@sanad/shared/api/types";
import { isVerified } from "@sanad/shared/api/directory";
import { ar } from "@sanad/shared/i18n/ar";
import { formatDate } from "@sanad/shared/lib/format";
import { Tag, AppText, Card } from "./ui";

/** شارة التوثيق الإداري — لا حكم مهني ولا تقييم. */
export function VerificationBadge({ verification }: { verification: Badge }) {
  const valid = isVerified(verification.status);
  const label = valid
    ? `✓ ${verification.isConditional ? "موثّق إدارياً (مشروط)" : "موثّق إدارياً"}`
    : (ar.verificationStatus as Record<string, string>)[verification.status] ?? verification.status;
  return <Tag label={label} tone={valid ? "success" : "neutral"} />;
}

export function VerificationNote({ verification }: { verification: Badge }) {
  return verification.lastCheckedAtUtc ? <AppText variant="muted">{`آخر تحقق إداري: ${formatDate(verification.lastCheckedAtUtc)}`}</AppText> : null;
}

/** تذكير ثابت قبل أي حجز: التوثيق إداري، ولا تشخيص ولا علاج ولا وعد بنتيجة، وكل شيء مجاني. */
export function AdministrativeDisclaimer() {
  return (
    <Card>
      <AppText variant="muted">
        التوثيق في سند إداري فقط. سند لا تشخّص ولا تعالج ولا تعد بنتيجة، ولا تقيّم كفاءة المختص. كل الخدمات في سند مجانية.
      </AppText>
    </Card>
  );
}
