/** بلد المستخدم من لغة جهازه (ar-SA ⇐ SA). لا تحديد موقع ولا عنوان IP. */
export function countryFromLocale(): string | null {
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const l of langs) {
      const region = new Intl.Locale(l).maximize().region;
      if (region && /^[A-Z]{2}$/.test(region)) return region;
    }
  } catch {
    /* لا شيء */
  }
  return null;
}
