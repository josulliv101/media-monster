import { fileURLToPath } from "node:url";

import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const from = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

/**
 * MEDIA MONSTER'S OWN TESTS. It had none, and CI checked only the other app, so
 * a change here could break saving or stop compiling and still merge green.
 *
 * Two projects:
 * - `unit`, in node, for logic kept in plain `.ts` (`*.test.ts`).
 * - `browser`, in real headless Chromium, for what only a browser can answer —
 *   focus, `inert`, the tab order (`*.browser.test.tsx`). jsdom would take an
 *   `inert` attribute and then tab straight into it anyway.
 *
 * The aliases are `tsconfig.json`'s `paths`: the engine and the film strip are
 * compiled from source here, as they are by Next (see `next.config.ts`).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@josulliv101/nested-collections/react": from("../../packages/nested-collections/react/index.ts"),
      "@josulliv101/nested-collections": from("../../packages/nested-collections/core/index.ts"),
      "@storyboard/ui/film-strip": from("../../packages/ui/film-strip/index.ts"),
      "@": from("."),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["{app,components,lib}/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["{app,components,lib}/**/*.browser.test.tsx"],
          browser: {
            enabled: true,
            headless: true,
            instances: [{ browser: "chromium" }],
            provider: playwright({}),
            // A failure's message says what was focused; a PNG beside the test
            // file would only be something else to keep out of git.
            screenshotFailures: false,
          },
        },
      },
    ],
  },
});
