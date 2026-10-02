import { ar } from "../lib/arabic";

const CIRC = 2 * Math.PI * 20;

/**
 * عدّاد التكرار في حاشية الكتلة: حلقة تمتلئ بالزنجفر مع كل نقرة، وتتحول إلى الفيروز عند الاكتمال.
 * النقر على العدّاد كله، لا على زر صغير.
 */
export function Counter({ title, count, target, onTap }: { title: string; count: number; target: number; onTap: () => void }) {
  const complete = count >= target;
  return (
    <button
      className={`counter${complete ? " complete" : ""}`}
      type="button"
      onClick={() => !complete && onTap()}
      aria-label={`عدّاد ${title}: ${complete ? "تمّ" : `${ar(count)} من ${ar(target)}`}`}
    >
      <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
        <circle className="track" cx="24" cy="24" r="20" />
        <circle
          className="fill"
          cx="24"
          cy="24"
          r="20"
          transform="rotate(-90 24 24)"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - Math.min(count, target) / target)}
        />
        <text className="n" x="24" y="28" textAnchor="middle">
          {complete ? "تمّ" : `${ar(count)} / ${ar(target)}`}
        </text>
      </svg>
      {!complete && <small>انقر بعد كل قراءة</small>}
    </button>
  );
}
