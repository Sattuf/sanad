import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { findGuide } from "@sanad/shared/content/ruqyah";
import { useMe } from "../../api/hooks";
import { cx } from "../../lib/cx";
import { useLabel } from "../../stores/discreet";

/*
  أبواب سند: يومي، ارقِ نفسك، شيخ موثوق، الوعي. كل صفحة تنتمي لباب واحد، وصفحات الباب تظهر تبويبات تحت الترويسة،
  فلا يتوه المستخدم بين روابط متشابهة. المسارات نفسها لم تتغيّر، فالروابط القديمة والإشعارات تعمل كما هي.
*/

export type DoorId = "today" | "ruqyah" | "directory" | "awareness";

interface DoorTab {
  to: string;
  label: string;
  /** اسم بديل في وضع التمويه */
  discreet?: string;
  /** بدايات المسارات التي تنتمي لهذا التبويب */
  prefixes: string[];
  auth?: boolean;
}

const DOOR_TABS: Record<DoorId, DoorTab[]> = {
  today: [
    { to: "/today", label: "اليوم", prefixes: ["/today"] },
    { to: "/journal", label: "مذكّرتي", prefixes: ["/journal"] },
  ],
  ruqyah: [
    { to: "/programs", label: "الخطط", prefixes: ["/programs"] },
    { to: "/ruqyah", label: "الآيات والأذكار", discreet: "الأذكار", prefixes: ["/ruqyah"] },
    { to: "/self-ruqyah", label: "جلسة رقية", discreet: "جلسة", prefixes: ["/self-ruqyah"] },
    { to: "/library", label: "الاستماع", prefixes: ["/library", "/favorites"], auth: true },
  ],
  directory: [
    { to: "/directory", label: "الدليل", prefixes: ["/directory", "/providers", "/organizations", "/book/", "/about-verification"] },
    { to: "/bookings", label: "حجوزاتي", prefixes: ["/bookings", "/conversations"], auth: true },
    { to: "/recommendations", label: "توصياتي", prefixes: ["/recommendations"], auth: true },
  ],
  awareness: [
    { to: "/awareness", label: "الميزان والأدلة", prefixes: ["/awareness"] },
    { to: "/awareness/quiz", label: "اختبر وعيك", prefixes: ["/awareness/quiz"] },
  ],
};

export const DOOR_ORDER: DoorId[] = ["today", "ruqyah", "directory", "awareness"];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);

/** أطول بادئة مطابقة تحدد التبويب، فـ /awareness/quiz لا يُحسب على /awareness. */
function bestTab(path: string, tabs: DoorTab[]) {
  let best: { tab: DoorTab; len: number } | null = null;
  for (const tab of tabs)
    for (const p of tab.prefixes) if (under(path, p) && (!best || p.length > best.len)) best = { tab, len: p.length };
  return best?.tab;
}

/** الباب الذي تنتمي إليه الصفحة. أدلة «توعية وتحذير» تبقى على مسار /ruqyah/guide لكنها من باب الوعي. */
export function doorOf(path: string): DoorId | null {
  const guide = path.match(/^\/ruqyah\/guide\/([^/]+)/);
  if (guide && findGuide(decodeURIComponent(guide[1]))?.kind === "awareness") return "awareness";
  return DOOR_ORDER.find((d) => bestTab(path, DOOR_TABS[d])) ?? null;
}

/** اسم الباب من النصوص المشتركة، مع اسمه البديل في وضع التمويه. */
export function useDoorLabel() {
  const { t } = useTranslation();
  const label = useLabel();
  return (d: DoorId) => {
    const [normal, discreet] = t(`doors.${d}`).split("|");
    return label(normal, discreet ?? normal);
  };
}

export function doorHome(d: DoorId) {
  return DOOR_TABS[d][0].to;
}

/** تبويبات الباب الحالي تحت الترويسة — لا تظهر إن لم يكن للباب إلا تبويب واحد ظاهر. */
export function DoorTabs() {
  const { pathname } = useLocation();
  const { data: me } = useMe();
  const label = useLabel();
  const doorLabel = useDoorLabel();
  const door = doorOf(pathname);
  if (!door) return null;
  const tabs = DOOR_TABS[door].filter((t) => !t.auth || me);
  if (tabs.length < 2) return null;
  const active = door === "awareness" && pathname.startsWith("/ruqyah/guide/") ? tabs[0] : bestTab(pathname, tabs);

  return (
    <nav aria-label={`أقسام ${doorLabel(door)}`} className="-mx-4 mb-6 overflow-x-auto px-4">
      <ul className="flex w-max gap-1 rounded-2xl border border-border bg-surface p-1">
        {tabs.map((t) => (
          <li key={t.to}>
            <Link
              to={t.to}
              aria-current={t === active ? "page" : undefined}
              className={cx(
                "block whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
                t === active ? "bg-primary text-primary-contrast" : "text-muted hover:text-text",
              )}
            >
              {t.discreet ? label(t.label, t.discreet) : t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
