import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Replace __PORT_5000__ with empty string in dev mode
// (In production, server/static.ts handles this replacement)
function replacePortPlaceholder(): Plugin {
  return {
    name: "replace-port-placeholder",
    transform(code, id) {
      if (id.endsWith(".ts") || id.endsWith(".tsx")) {
        if (code.includes("__PORT_5000__")) {
          return code.replace(/__PORT_5000__/g, "");
        }
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [react(), replacePortPlaceholder()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  base: "./",
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
