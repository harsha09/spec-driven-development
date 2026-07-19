import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests only — Electron UI suite is under src/test/ (mocha + @vscode/test-electron)
    include: ["src/__tests__/**/*.test.ts"],
    exclude: ["src/test/**", "out/**", "node_modules/**"],
  },
});
