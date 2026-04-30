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
    env: {
      NODE_NO_WARNINGS: "1",
    },
    maxWorkers: 2,
    projects: [
      {
        extends: true,
        test: {
          name: "components",
          include: ["src/components/**/*.{test,spec}.{ts,tsx}", "src/App.test.tsx"],
          sequence: {
            groupOrder: 0,
          },
        },
      },
      {
        extends: true,
        test: {
          name: "infrastructure",
          include: ["src/infrastructure/**/*.{test,spec}.{ts,tsx}"],
          sequence: {
            groupOrder: 1,
          },
        },
      },
      {
        extends: true,
        test: {
          name: "application-logic",
          include: [
            "src/features/**/*.{test,spec}.{ts,tsx}",
            "src/domain/**/*.{test,spec}.{ts,tsx}",
            "src/lib/**/*.{test,spec}.{ts,tsx}",
            "src/hooks/**/*.{test,spec}.{ts,tsx}",
            "src/types/**/*.{test,spec}.{ts,tsx}",
            "src/data/**/*.{test,spec}.{ts,tsx}",
          ],
          sequence: {
            groupOrder: 2,
          },
        },
      },
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
