import { useSyncExternalStore } from "react";

// توجيه بالـ hash: يكفي لخمس شاشات، ويعمل من أي مسار نشر ودون إعداد خادم.
export type Route =
  | { name: "today" }
  | { name: "plans" }
  | { name: "plan"; id: string }
  | { name: "reader" }
  | { name: "khatma" }
  | { name: "support" }
  | { name: "safety" }
  | { name: "planDone" }
  | { name: "account" }
  | { name: "group"; id: string }
  | { name: "join"; code: string };

export function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  switch (parts[0]) {
    case "plans":
      return parts[1] ? { name: "plan", id: decodeURIComponent(parts[1]) } : { name: "plans" };
    case "reader":
      return { name: "reader" };
    case "khatma":
      return parts[1] ? { name: "group", id: decodeURIComponent(parts[1]) } : { name: "khatma" };
    case "account":
      return { name: "account" };
    case "join":
      return parts[1] ? { name: "join", code: decodeURIComponent(parts[1]) } : { name: "khatma" };
    case "support":
      return { name: "support" };
    case "safety":
      return { name: "safety" };
    case "done":
      return { name: "planDone" };
    default:
      return { name: "today" };
  }
}

export function href(r: Route): string {
  switch (r.name) {
    case "plan":
      return `#/plans/${encodeURIComponent(r.id)}`;
    case "planDone":
      return "#/done";
    case "group":
      return `#/khatma/${encodeURIComponent(r.id)}`;
    case "join":
      return `#/join/${encodeURIComponent(r.code)}`;
    case "today":
      return "#/";
    default:
      return `#/${r.name}`;
  }
}

export function navigate(r: Route) {
  window.location.hash = href(r);
  window.scrollTo?.(0, 0);
}

const subscribe = (l: () => void) => {
  window.addEventListener("hashchange", l);
  return () => window.removeEventListener("hashchange", l);
};

export const useRoute = () => {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parse(hash);
};
