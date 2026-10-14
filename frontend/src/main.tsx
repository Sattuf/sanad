import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "@fontsource/amiri/400.css";
import "@fontsource/amiri-quran/400.css";
import "./styles/index.css";
import "./i18n";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { ApiError } from "./api/client";
import { initTheme } from "./app/theme";
import { router } from "./app/router";

initTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // لا إعادة محاولة لأخطاء الصلاحية أو "غير موجود" — فقط أخطاء الشبكة/الخادم المؤقتة
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
  mutationCache: new MutationCache(),
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);

// يفتح التطبيق ووضع السكينة دون إنترنت (public/sw.js) — في الإنتاج فقط حتى لا يربك التطوير
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js").catch(() => undefined));
}
