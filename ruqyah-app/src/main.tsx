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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// يعمل دون إنترنت بعد أول فتح
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
