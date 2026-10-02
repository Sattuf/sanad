const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  { ignores: ["dist/*", ".expo/*"] },
  {
    // الشاشات لا تستدعي الخادم مباشرة بـ fetch — كل طلب يمر بعميل src/lib/api.ts (إشارة الطوارئ والتجديد)
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    rules: { "no-restricted-globals": ["error", { name: "fetch", message: "استخدم api من src/lib/api.ts" }] },
  },
  {
    // استيراد expo-notifications مباشرة يُسقط التطبيق في Expo Go على Android — عبر src/lib/notifications.ts فقط
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/notifications.ts", "src/**/__tests__/**"],
    rules: {
      "no-restricted-imports": ["error", { paths: [{ name: "expo-notifications", allowTypeImports: true, message: "استخدم Notifications من src/lib/notifications.ts" }] }],
    },
  },
]);
