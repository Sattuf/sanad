import type { KeyboardEvent } from "react";
import { ar } from "../lib/arabic";
import { JUZ_COUNT, ME, type Khatma } from "../domain/khatma";

/**
 * وردة الختمة: ثلاثون بتلة لثلاثين جزءاً. الجزء الأول في الأعلى، والدوران عكس عقارب الساعة.
 * كل بتلة لي زرٌّ يستجيب للنقر وEnter والمسافة. بتلات الأعضاء الآخرين (في الجماعية) للعرض فقط.
 */
export function Rosette({ khatma, onToggle, justDone }: { khatma: Khatma; onToggle: (index: number) => void; justDone?: number | null }) {
  const cx = 160, cy = 160, R = 150;
  const r1 = 0.44 * R, r2 = 0.8 * R, r3 = 0.91 * R, step = 12, gap = 0.8, rad = Math.PI / 180;
  const P = (r: number, a: number) => `${(cx + r * Math.cos(a * rad)).toFixed(2)} ${(cy + r * Math.sin(a * rad)).toFixed(2)}`;
  const done = khatma.juz.filter((j) => j.doneAt).length;

  const star = Array.from({ length: 16 }, (_, k) => {
    const r = k % 2 ? 0.27 * R : 0.36 * R;
    const a = (-90 + k * 22.5) * rad;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");

  return (
    <svg className="rosette" viewBox="0 0 320 320" role="group" aria-label={`أجزاء الختمة: قُرئ ${ar(done)} من ${ar(JUZ_COUNT)}`}>
      <circle cx={cx} cy={cy} r={R - 2} fill="none" stroke="var(--rule)" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={R - 6} fill="none" stroke="var(--gold)" strokeWidth={0.6} opacity={0.6} />
      {khatma.juz.map((j, i) => {
        const a0 = -90 - i * step - gap, a1 = -90 - (i + 1) * step + gap, am = (a0 + a1) / 2;
        const d = `M ${P(r1, a0)} A ${r1} ${r1} 0 0 0 ${P(r1, a1)} L ${P(r2, a1)} L ${P(r3, am)} L ${P(r2, a0)} Z`;
        const mine = (j.assigneeId ?? ME) === ME;
        const isDone = Boolean(j.doneAt);
        const label = `الجزء ${ar(j.index)}: ${isDone ? "مقروء" : "لم يُقرأ"}${mine ? "" : " (لعضو آخر)"}`;
        const tp = (r1 + r2) / 2, ta = am * rad;
        const key = (e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle(j.index);
          }
        };
        return (
          <g key={j.index}>
            <path
              d={d}
              className={`petal ${mine ? "mine" : "other"}${isDone ? " done" : ""}`}
              aria-label={label}
              {...(mine
                ? { role: "button", tabIndex: 0, "aria-pressed": isDone, onClick: () => onToggle(j.index), onKeyDown: key }
                : {})}
            />
            <text x={(cx + tp * Math.cos(ta)).toFixed(2)} y={(cy + tp * Math.sin(ta) + 3).toFixed(2)} textAnchor="middle" className={`juz-n${isDone ? " done" : ""}`} aria-hidden="true">
              {ar(j.index)}
            </text>
            {justDone === j.index && <path d={d} className="glint" />}
          </g>
        );
      })}
      <polygon points={star} className="star" />
      <text x={cx} y={cy + 4} textAnchor="middle" className="count-main" aria-hidden="true">
        {ar(done)}
      </text>
      <text x={cx} y={cy + 22} textAnchor="middle" className="count-sub" aria-hidden="true">
        من {ar(JUZ_COUNT)} جزءاً
      </text>
    </svg>
  );
}
