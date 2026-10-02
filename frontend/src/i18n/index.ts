import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { ar } from "@sanad/shared/i18n/ar";

// العربية وRTL افتراضياً ووحيدة في هذا الإصدار (references/12-ethics-and-future-roadmap.md §12.5)
void i18n.use(initReactI18next).init({
  resources: { ar: { translation: ar } },
  lng: "ar",
  fallbackLng: "ar",
  interpolation: { escapeValue: false },
});

export default i18n;
