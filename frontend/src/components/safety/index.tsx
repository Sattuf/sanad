import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useEmergency } from "../../stores/emergency";
import type { VerificationBadge as Badge } from "../../api/types";
import { cx } from "../../lib/cx";
import { formatDate } from "../../lib/format";

/**
 * شريط الطوارئ — بلا أي حركة (الوضوح الفوري أولاً)، أعلى كل شاشة، لا يختفي تلقائياً.
 * references/07-safety-guardrails.md §7.4 و13 §13.4.
 */
export function EmergencyReferralBanner() {
  const referral = useEmergency((s) => s.referral);
  const dismiss = useEmergency((s) => s.dismiss);
  if (!referral) return null;
  return (
    <div role="alert" aria-live="assertive" className="border-b-4 border-danger bg-danger-bg text-danger">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-base font-bold">نحن قلقون عليك — إن كنت في خطر، اطلب المساعدة الآن</p>
          <p className="mt-1 text-sm leading-7">{referral.message}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {referral.contacts.map((c) => (
            <a key={c.phoneNumber} href={`tel:${c.phoneNumber}`} className="rounded-xl bg-danger px-4 py-2 text-sm font-bold text-white">
              اتصل {c.phoneNumber} <span className="font-normal">— {c.label}</span>
            </a>
          ))}
          <Link to="/emergency" className="rounded-xl border border-danger px-4 py-2 text-sm font-bold">
            صفحة الطوارئ
          </Link>
          <button type="button" onClick={dismiss} className="px-2 text-xs underline">
            إخفاء
          </button>
        </div>
      </div>
    </div>
  );
}

export function VerificationBadge({ verification }: { verification: Badge }) {
  const { t } = useTranslation();
  const valid = verification.status === "Approved" || verification.status === "ConditionallyApproved";
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        valid ? "bg-success-bg text-success" : "bg-surface-2 text-muted",
      )}
      title={verification.lastCheckedAtUtc ? `آخر تحقق: ${formatDate(verification.lastCheckedAtUtc)}` : undefined}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="3">
        <path d="M20 6 9 17l-5-5" />
      </svg>
      {valid ? (verification.isConditional ? "موثّق إدارياً (مشروط)" : "موثّق إدارياً") : t(`verificationStatus.${verification.status}`)}
    </span>
  );
}

export function UnmonitoredChatWarning() {
  return (
    <p className="rounded-xl bg-warning-bg px-4 py-2.5 text-sm leading-7 text-warning">
      هذه محادثة إدارية لتنسيق الموعد، <strong>وليست مراقَبة لحظياً</strong>. لا تشارك بيانات حساسة غير لازمة. إن كنت في خطر،{" "}
      <Link to="/emergency" className="font-bold underline">
        اذهب لصفحة الطوارئ
      </Link>
      .
    </p>
  );
}

export function AdministrativeDisclaimerFooter() {
  const { t } = useTranslation();
  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-8 text-sm text-muted md:grid-cols-3">
        <p className="leading-7 md:col-span-2">
          سند طبقة توثيق إداري ووساطة وحجز وإحالة، ومكتبة محتوى ديني محايد. <strong className="text-text">لا تشخّص ولا تعالج ولا تعد بنتيجة</strong>،
          والتوثيق إداري لا حكم مهني. {t("common.free")}
        </p>
        <div className="flex flex-col gap-1 md:items-end">
          <Link to="/emergency" className="font-bold text-danger">
            في خطر الآن؟ صفحة الطوارئ
          </Link>
          <Link to="/about-verification" className="hover:text-text">
            كيف نوثّق مقدّمي الخدمة
          </Link>
        </div>
      </div>
    </footer>
  );
}
