import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Some host shells inject --localstorage-file without a valid path into NODE_OPTIONS.
// Strip it so test workers don't emit noisy process warnings.
if (process.env.NODE_OPTIONS) {
  process.env.NODE_OPTIONS = process.env.NODE_OPTIONS
    .replace(/(^|\s)--localstorage-file(?:=\S+)?(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    env: {
      NODE_NO_WARNINGS: "1",
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
