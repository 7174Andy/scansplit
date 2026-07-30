import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Separate from vite.config.ts on purpose. The Tauri build needs base '/',
// while a page served from /scansplit/share/ needs relative asset URLs. Do NOT
// set `root` here — changing it re-bases module resolution and breaks the
// src/ imports this page depends on.
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: {
    outDir: "dist-share",
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(__dirname, "share.html") },
  },
});
