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
]);
