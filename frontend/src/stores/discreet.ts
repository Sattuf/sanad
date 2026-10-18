import { create } from "zustand";
import { readJson, writeJson } from "../lib/safeStorage";

/*
  الوضع المتحفّظ: لمن يتحرّج من ظهور كلمات مثل «رقية» على شاشته أمام الآخرين.
  يغيّر عنوان التبويب وأيقونته إلى «ملاحظاتي»، ويستبدل التسميات الحساسة بأخرى محايدة،
  ويفعّل «الخروج السريع» (Esc مرتين) الذي يستبدل الصفحة دون أن تبقى في سجل الرجوع.
*/
interface DiscreetState {
  on: boolean;
  set: (on: boolean) => void;
}

const KEY = "sanad.discreet";
export const useDiscreet = create<DiscreetState>((set) => ({
  on: readJson<boolean>(KEY, false),
  set: (on) => {
    writeJson(KEY, on);
    set({ on });
  },
}));

const NEUTRAL_ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#f2f5f7"/><path d="M18 20h28M18 32h28M18 44h18" stroke="#5f7380" stroke-width="5" stroke-linecap="round"/></svg>',
  );

export function applyDiscreet(on: boolean, normalTitle: string) {
  document.title = on ? "ملاحظاتي" : normalTitle;
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link) link.href = on ? NEUTRAL_ICON : "/favicon.svg";
}

/** خروج سريع إلى صفحة محايدة دون ترك أثر في زر الرجوع. */
export function quickExit() {
  location.replace("https://www.google.com/search?q=%D8%A7%D9%84%D8%B7%D9%82%D8%B3");
}

/** تسمية بديلة في الوضع المتحفّظ */
export function useLabel() {
  const on = useDiscreet((s) => s.on);
  return (normal: string, discreet: string) => (on ? discreet : normal);
}
