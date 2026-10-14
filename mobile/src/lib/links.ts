/** موقع سند على الويب — صفحات الشروط والخصوصية، وما يبقى على الويب فقط (البوابات الإدارية). */
export const WEB_BASE_URL = (process.env.EXPO_PUBLIC_WEB_BASE_URL ?? "https://sanad.app").replace(/\/$/, "");
