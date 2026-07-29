import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // solid-js ships a no-op server build under Node conditions; the client
  // build is what the Solid lifecycle wrapper is contracted against.
  resolve: {
    conditions: ["development", "browser", "module"],
  },
  define: {
    __VERSION__: JSON.stringify("test"),
  },
  test: {
    environment: "jsdom",
    globals: true,
    css: true,
    setupFiles: ["./src/test-setup.ts"],
    // `e2e/` holds Playwright specs. They declare `test.describe` against
    // Playwright's runner, so vitest must not collect them.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Externalized deps bypass the conditions above and load via Node, so
    // solid-js must go through Vite to reach its client build.
    server: { deps: { inline: ["solid-js"] } },
  },
});
