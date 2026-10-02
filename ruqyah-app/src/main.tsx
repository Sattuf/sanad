import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/readex-pro/arabic-300.css";
import "@fontsource/readex-pro/arabic-400.css";
import "@fontsource/readex-pro/arabic-600.css";
import "@fontsource/reem-kufi/arabic-500.css";
import "@fontsource/reem-kufi/arabic-700.css";
import "@fontsource/amiri-quran/arabic-400.css";
import "@fontsource/amiri/arabic-400.css";
import "./styles/app.css";
import { App } from "./App";
import { hasApi, onEmergency } from "./api/client";
import { refreshCatalog } from "./content/catalog";
import { flushEvents, track } from "./lib/events";
import { navigate } from "./lib/router";
import { load, save } from "./lib/storage";
import { restoreSession } from "./state/account";
import { getState } from "./state/store";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// إشارة خطر من أي استجابة ⇐ صفحة الطوارئ فوراً، بصرف النظر عن نجاح الطلب (ADR-0014)
onEmergency(() => navigate({ name: "safety" }));

if (hasApi) {
  if (!load("opened", false)) {
    track("first_open", "web");
    save("opened", true);
  }
  void refreshCatalog(getState().enrollment?.planId).then(() => restoreSession());
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && void flushEvents());
  setTimeout(() => void flushEvents(), 5_000);
}

// يعمل دون إنترنت بعد أول فتح
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
