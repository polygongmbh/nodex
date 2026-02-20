import { defineConfig } from "vite";
import type { RollupLog } from "rollup";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Keep build output warnings focused on app-controlled issues.
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      onwarn(warning: RollupLog, warn) {
        if (
          warning.code === "EVAL" &&
          typeof warning.id === "string" &&
          warning.id.includes("node_modules/tseep/lib/task-collection/bake-collection.js")
        ) {
          return;
        }
        warn(warning);
      },
    },
  },
}));
