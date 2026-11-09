import { defineConfig } from "vitest/config";

export default defineConfig({
  test:
    process.platform === "win32" ? { maxWorkers: 2, testTimeout: 60000, hookTimeout: 30000 } : {},
});
