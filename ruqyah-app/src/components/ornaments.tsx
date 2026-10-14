import type { ReactNode } from "react";
import { hasApi } from "../api/client";
import { hijri } from "../lib/arabic";
import { href, type Route } from "../lib/router";
import { actions, useStore, type Theme } from "../state/store";

/** نقش النجمة الثمانية ونجمة الحاشية، يُعرَّفان مرة واحدة في الصفحة. */
export function SvgDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <pattern id="girih" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M12 2 L14.5 9.5 L22 12 L14.5 14.5 L12 22 L9.5 14.5 L2 12 L9.5 9.5 Z" fill="none" stroke="currentColor" strokeWidth=".8" />
          <circle cx="0" cy="0" r="1.4" fill="currentColor" />
          <circle cx="24" cy="24" r="1.4" fill="currentColor" />
          <circle cx="24" cy="0" r="1.4" fill="currentColor" />
          <circle cx="0" cy="24" r="1.4" fill="currentColor" />
        </pattern>
        <symbol id="star8" viewBox="0 0 10 10">
          <path d="M5 0 L6.2 3.8 L10 5 L6.2 6.2 L5 10 L3.8 6.2 L0 5 L3.8 3.8 Z" fill="currentColor" />
        </symbol>
      </defs>
    </svg>
  );
}

export const Star = ({ size = 10, className }: { size?: number; className?: string }) => (
  <svg width={size} height={size} className={className} aria-hidden="true">
    <use href="#star8" />
  </svg>
);

const themeNames: Record<Theme, string> = { auto: "تلقائي", light: "نهاري", dark: "ليلي" };
const nextTheme: Record<Theme, Theme> = { auto: "light", light: "dark", dark: "auto" };

/** السرلوح: رأس كل شاشة. يحمل دائماً زر الطوارئ (طبقة الأمان لا تُحذف). */
export function Sarlawh({ title }: { title: string }) {
  const theme = useStore((s) => s.settings.theme);
  return (
    <>
      <header className="sarlawh">
        <svg className="pat" aria-hidden="true">
          <rect width="100%" height="100%" fill="url(#girih)" />
        </svg>
        <div className="tools">
          <button
            className="tool"
            type="button"
            aria-label={`تبديل الوضع، الحالي: ${themeNames[theme]}`}
            onClick={() => actions.updateSettings({ theme: nextTheme[theme] })}
          >
            الوضع: {themeNames[theme]}
          </button>
          <a className="sos" href={href({ name: "safety" })}>
            طوارئ
          </a>
        </div>
        <div className="cartouche">
          <h1 id="screen-title">{title}</h1>
        </div>
      </header>
      <div className="date-line">
        <span>{hijri()}</span>
        {hasApi ? <a href={href({ name: "account" })}>حسابي</a> : <span>سند</span>}
      </div>
    </>
  );
}

/** الجدول: الإطار المسطّر المزدوج، لعنصر واحد فقط في الشاشة. */
export const Jadwal = ({ children, label }: { children: ReactNode; label?: string }) => (
  <section className="jadwal" aria-label={label}>
    {children}
  </section>
);

/** الحاشية: ملاحظة جانبية تبدأ بنجمة صغيرة. */
export const Hashiya = ({ children }: { children: ReactNode }) => (
  <div className="note">
    <Star />
    <div>{children}</div>
  </div>
);

/** رابط طبقة الأمان، يظهر في حاشية كل شاشة رئيسية. */
export const SafetyNote = () => (
  <Hashiya>
    <p>
      الرقية والطب لا يتعارضان. <a className="link" href={href({ name: "safety" })}>متى تحتاج مع الرقية إلى طبيب؟</a>
    </p>
  </Hashiya>
);

/** زر أساسي بشكل الخرطوشة. */
export function Btn({
  children,
  onClick,
  disabled,
  to,
  submit,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  to?: Route;
  /** زر إرسال نموذج. */
  submit?: boolean;
}) {
  return (
    <span className="btn-wrap">
      {to ? (
        <a className="btn" href={href(to)}>
          {children}
        </a>
      ) : (
        <button className="btn" type={submit ? "submit" : "button"} onClick={onClick} disabled={disabled}>
          {children}
        </button>
      )}
    </span>
  );
}

/** الترقيمة: قيد الختام المثلّث، لشاشة إتمام الخطة أو الختمة. */
export function Colophon({ lines, label }: { lines: string[]; label: string }) {
  const widths = ["100%", "78%", "56%", "36%"];
  return (
    <div className="colophon" role="status" aria-label={label}>
      {lines.map((l, i) => (
        <span key={i} style={{ maxWidth: widths[i] }}>
          {l}
        </span>
      ))}
      <span className="flower" aria-hidden="true">
        ❁
      </span>
    </div>
  );
}
