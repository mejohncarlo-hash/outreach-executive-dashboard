import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "cloudflare",
  cacheDir: "../.vite-cache",
  publicDir: "../public",
  plugins: [react()],
  build: {
    outDir: "../cloudflare-dist",
    emptyOutDir: true,
  },
});
