import { Star } from "./ornaments";
import { href, type Route } from "../lib/router";

type Tab = { to: Route; label: string; icon: string; match: Route["name"][] };

const tabs: Tab[] = [
  { to: { name: "today" }, label: "اليوم", icon: "M16 4a8 8 0 1 0 4 12A7 7 0 0 1 16 4Z", match: ["today", "reader", "planDone"] },
  { to: { name: "plans" }, label: "الخطط", icon: "M12 6c-2-1.5-5-2-8-2v14c3 0 6 .5 8 2 2-1.5 5-2 8-2V4c-3 0-6 .5-8 2Zm0 0v14", match: ["plans", "plan"] },
  { to: { name: "khatma" }, label: "الختمة", icon: "M12 2l2.6 6.4L21 11l-6.4 2.6L12 20l-2.6-6.4L3 11l6.4-2.6Z", match: ["khatma"] },
  { to: { name: "support" }, label: "ادعم", icon: "M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11Z", match: ["support"] },
];

/** الشريط السفلي: العنصر النشط تحته نجمة ثمانية ذهبية بدلاً من خط. */
export function TabBar({ current }: { current: Route["name"] }) {
  return (
    <nav className="tabs" aria-label="التنقل">
      <ul>
        {tabs.map((t) => (
          <li key={t.label}>
            <a href={href(t.to)} aria-current={t.match.includes(current) ? "page" : undefined}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d={t.icon} />
              </svg>
              {t.label}
              <Star size={9} className="mark" />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
