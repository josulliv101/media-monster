import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import { FilmStrip } from "./index";

/**
 * BEHAVIOUR CHECKS for `@storyboard/ui/film-strip`, kept apart from
 * `film-strip.stories.tsx` on purpose: those stories have no `play` function
 * because real-mouse e2e drives them, and a story that plays on load is one
 * that suite cannot use (see CLAUDE.md). These run in the Storybook vitest
 * project, in real headless Chromium, where `requestAnimationFrame` ticks.
 */
const meta: Meta<typeof FilmStrip> = {
  title: "film-strip/Checks",
  component: FilmStrip,
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof FilmStrip>;

/**
 * Space starts playback and THE CLOCK MOVES.
 *
 * It did not: `setTime(fn)` applied `fn` to the `time` the playback effect
 * captured when it started, so every frame computed "start + one frame" and the
 * readout sat at 00:00:00 with `is-playing` set. Measured before the fix: still
 * 00:00:00 after 1.5 seconds.
 */
export const PlaybackAdvances: Story = {
  play: async ({ canvasElement }) => {
    const bar = canvasElement.querySelector<HTMLElement>("[data-seam-bar]");
    if (bar === null) throw new Error("the playbar did not render");
    // The readout is mm:ss:ff at 24 fps.
    const seconds = () => {
      const [m = 0, s = 0, f = 0] = (bar.querySelector(".ph-chip")?.textContent ?? "")
        .trim()
        .split(":")
        .map(Number);
      return m * 60 + s + f / 24;
    };

    bar.focus();
    bar.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true }));
    await waitFor(() => expect(bar.classList.contains("is-playing")).toBe(true));

    // PROGRESS, not merely a changed readout. The broken clock recomputed
    // "start + one frame" every frame, so a single slow first frame could move
    // the readout a few frames and a bare "it changed" check passed on the bug.
    // A running clock covers most of a second in one second; the broken one
    // never gets past one frame's worth.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(seconds()).toBeGreaterThan(0.5);
  },
};
