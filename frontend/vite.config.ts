/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// المنطق والمحتوى المشترك مع تطبيق الجوال يُستهلك من المصدر مباشرة (ADR-0018)
const shared = fileURLToPath(new URL("../packages/shared/src", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@sanad/shared": shared } },
  server: { port: 5173, strictPort: true, fs: { allow: [".", shared] } },
  build: {
    rollupOptions: {
      output: {
        // Vite 8 (Rolldown) يقبل manualChunks دالةً فقط؛ الحزم الكبيرة في ملفات مستقلة كما كانت
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return "react";
          if (/[\\/]node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/.test(id)) return "motion";
          if (id.includes("@microsoft/signalr")) return "realtime";
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
