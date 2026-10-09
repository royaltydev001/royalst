import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        app: resolve(root, "index.html"),
        sw: resolve(root, "src/sw.ts"),
      },
      output: {
        entryFileNames: (chunk) => chunk.name === "sw" ? "sw.js" : "assets/[name]-[hash].js",
      },
    },
  },
});
