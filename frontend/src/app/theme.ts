import { useCallback, useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";
const KEY = "sanad.theme";

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
}

/** تفضيل مظهر لكل زائر (راحة شخصية فقط) — التخزين قد يفشل بصمت. */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(read);
  useEffect(() => apply(pref), [pref]);
  const cycle = useCallback(() => {
    setPref((p) => {
      const next: ThemePref = p === "system" ? "dark" : p === "dark" ? "light" : "system";
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* تجاهل */
      }
      return next;
    });
  }, []);
  return { pref, cycle };
}

export function initTheme() {
  apply(read());
}
