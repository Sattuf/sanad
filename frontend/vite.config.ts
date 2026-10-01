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
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          motion: ["framer-motion"],
          realtime: ["@microsoft/signalr"],
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
