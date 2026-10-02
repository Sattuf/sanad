import { ar } from "../lib/arabic";

/**
 * السبحة: تقدّم الخطة. كل حبة يوم، تتذهّب حين يكتمل ورده.
 * الحبات على منحنى متدلٍّ من اليمين إلى اليسار، و«إمام» السبحة وشرّابتها في الطرف الأيسر.
 */
export function Misbaha({
  total,
  done,
  current,
  justDone,
}: {
  total: number;
  done: number[];
  current: number | null;
  justDone?: number | null;
}) {
  const R = 296, L = 40, top = 22, sag = 38;
  const r = total <= 7 ? 10 : total <= 21 ? 7 : 5;
  const pts = Array.from({ length: total }, (_, i) => {
    const t = total === 1 ? 0 : i / (total - 1);
    return [R - t * (R - L), top + sag * Math.sin(Math.PI * t)] as const;
  });
  const d =
    `M ${R + 18} ${top - 8} Q ${R + 6} ${top - 2} ${pts[0][0]} ${pts[0][1]}` +
    pts.slice(1).map(([x, y]) => ` L ${x} ${y}`).join("") +
    ` L ${L - 16} ${top + 6}`;

  return (
    <svg className="misbaha" viewBox="0 0 320 96" role="img" aria-label={`أيام الخطة: اكتمل ${ar(done.length)} من ${ar(total)}`}>
      <path d={d} className="string" />
      {pts.map(([x, y], i) => {
        const day = i + 1;
        const isDone = done.includes(day);
        const isNow = day === current && !isDone;
        const label = `اليوم ${ar(day)}: ${isDone ? "مكتمل" : isNow ? "اليوم" : "لم يكتمل"}`;
        return (
          <g key={day}>
            <circle cx={x} cy={y} r={r} className={`bead${isDone ? " done" : ""}${isNow ? " now" : ""}`} aria-label={label}>
              <title>{label}</title>
            </circle>
            {justDone === day && <circle cx={x} cy={y} r={r} className="glint" />}
          </g>
        );
      })}
      <ellipse cx={L - 22} cy={top + 10} rx={6} ry={9} className="bead done" />
      <path d={`M ${L - 26} ${top + 19} L ${L - 30} ${top + 44} L ${L - 14} ${top + 44} L ${L - 18} ${top + 19} Z`} className="tassel" opacity={0.8} />
    </svg>
  );
}

/** حبات مصغّرة لسطر الخطة في القائمة. */
export const MiniBeads = ({ n }: { n: number }) => (
  <span className="mini-beads" aria-hidden="true">
    {Array.from({ length: Math.min(n, 21) }, (_, i) => (
      <i key={i} />
    ))}
  </span>
);
