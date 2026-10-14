/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// النص القرآني والأذكار المخرّجة تأتي من الحزمة المشتركة مباشرة (ADR-0018) — لا نص من الذاكرة.
const shared = fileURLToPath(new URL("../packages/shared/src", import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: { alias: { "@sanad/shared": shared } },
  server: { port: 5174, strictPort: true, fs: { allow: [".", shared] } },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
