import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import { FilmStrip, type FilmStripShot } from "./index";

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
      const [m = 0, s = 0, f = 0] = (document.querySelector("[data-seam-time-chip]")?.textContent ?? "")
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

/* ── helpers for the checks below ──────────────────────────────────────── */

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const plain = (id: string, seconds: number, extra: Partial<FilmStripShot> = {}): FilmStripShot => ({
  id,
  label: id,
  seconds,
  frames: ["#345"],
  sectionName: null,
  ...extra,
});

/** The playhead readout (mm:ss:ff at 24 fps) as seconds. */
/** The chip is portalled into the body (see `placeChip`), so it is found there. */
function readoutSeconds(): number {
  const [m = 0, s = 0, f = 0] = (document.querySelector("[data-seam-time-chip]")?.textContent ?? "")
    .trim()
    .split(":")
    .map(Number);
  return m * 60 + s + f / 24;
}

function playbar(root: HTMLElement): HTMLElement {
  const bar = root.querySelector<HTMLElement>("[data-seam-bar]");
  if (bar === null) throw new Error("the playbar did not render");
  return bar;
}

function pressSpace(bar: HTMLElement): void {
  bar.focus();
  bar.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true }));
}

/** Story-scoped hooks through which a harness hands its setters to `play`. */
const handles: {
  setShots?: (shots: readonly FilmStripShot[]) => void;
  setGeneration?: (generation: number) => void;
} = {};

/**
 * PLAYBACK FOLLOWS THE SEQUENCE IT IS PLAYING, not the one it started on.
 *
 * The frame loop's effect was keyed on `playing` alone, so it kept the duration
 * and the callbacks of the render that pressed play. Measured: a 20 s sequence
 * shortened to 0.25 s mid-playback read 1.04 s a moment later — past its end.
 */
function PlaybackHarness() {
  const [shots, setShots] = useState<readonly FilmStripShot[]>([plain("long", 20)]);
  const [generation, setGeneration] = useState(1);
  const [calls, setCalls] = useState<number[]>([]);
  handles.setShots = setShots;
  handles.setGeneration = setGeneration;
  return (
    <div>
      <FilmStrip
        shots={shots}
        // A NEW function whenever the generation moves, reporting which one it
        // is — so a stale callback shows up as the old number.
        onScrub={() => setCalls((c) => (c.at(-1) === generation ? c : [...c, generation]))}
      />
      <output data-check-calls>{calls.join(",")}</output>
    </div>
  );
}

export const PlaybackStopsAtAShortenedEnd: Story = {
  render: () => <PlaybackHarness />,
  play: async ({ canvasElement }) => {
    const bar = playbar(canvasElement);
    pressSpace(bar);
    await wait(150);
    handles.setShots?.([plain("tiny", 0.25)]);
    await wait(900);
    expect(readoutSeconds()).toBeLessThanOrEqual(0.26);
    expect(bar.classList.contains("is-playing")).toBe(false);
  },
};

export const PlaybackRunsIntoAnExtendedEnd: Story = {
  render: () => <PlaybackHarness />,
  play: async ({ canvasElement }) => {
    handles.setShots?.([plain("short", 0.5)]);
    await wait(100);
    const bar = playbar(canvasElement);
    pressSpace(bar);
    await wait(100);
    // Extended BEFORE the old end is reached: a stale loop still stops at 0.5.
    handles.setShots?.([plain("short", 0.5), plain("more", 5)]);
    await wait(1200);
    expect(readoutSeconds()).toBeGreaterThan(0.9);
  },
};

export const PlaybackCallsTheCurrentCallbacks: Story = {
  render: () => <PlaybackHarness />,
  play: async ({ canvasElement }) => {
    const bar = playbar(canvasElement);
    pressSpace(bar);
    await wait(250);
    handles.setGeneration?.(2);
    await wait(400);
    const calls = canvasElement.querySelector("[data-check-calls]")?.textContent ?? "";
    // The replacement is called once playback continues; a stale loop only
    // ever reports generation 1.
    expect(calls.split(",").at(-1)).toBe("2");
  },
};

/**
 * A TRIM BELONGS TO THE POINTER THAT STARTED IT.
 *
 * The drag listened on `window` for any pointer. Measured: touch 1 pulled the
 * out edge of a 6 s shot 44 px left (a 5 s preview), and touch 2 lifting
 * elsewhere COMMITTED about 3 s while touch 1 was still down.
 */
function TrimHarness() {
  const [commits, setCommits] = useState<string[]>([]);
  return (
    <div>
      <FilmStrip
        shots={[plain("a", 6, { sourceSeconds: 10, trimInSeconds: 0 }), plain("b", 6)]}
        selectedId="a"
        onTrim={(id, next) =>
          setCommits((c) => [...c, `${id}:${next.in.toFixed(1)}-${next.out.toFixed(1)}`])
        }
      />
      <output data-check-commits>{commits.join("|")}</output>
    </div>
  );
}

export const TrimIgnoresOtherPointers: Story = {
  render: () => <TrimHarness />,
  play: async ({ canvasElement }) => {
    await wait(400);
    const handle = canvasElement.querySelector<HTMLElement>('[data-seam-trim-out="a"]');
    if (handle === null) throw new Error("no out handle on the selected shot");
    const r = handle.getBoundingClientRect();
    const x = r.x + r.width / 2;
    const pointer = (pointerId: number, clientX: number, buttons = 1) => ({
      bubbles: true,
      isPrimary: pointerId === 1,
      pointerId,
      pointerType: "touch",
      button: 0,
      buttons,
      clientX,
      clientY: r.y + r.height / 2,
    });
    const commits = () => canvasElement.querySelector("[data-check-commits]")?.textContent ?? "";

    handle.dispatchEvent(new PointerEvent("pointerdown", pointer(1, x)));
    window.dispatchEvent(new PointerEvent("pointermove", pointer(1, x - 44)));
    // Touch 2 moves, lifts and cancels elsewhere: none of it is this trim's.
    window.dispatchEvent(new PointerEvent("pointermove", pointer(2, x - 200)));
    window.dispatchEvent(new PointerEvent("pointerup", pointer(2, x - 130, 0)));
    window.dispatchEvent(new PointerEvent("pointercancel", pointer(2, x - 130, 0)));
    await wait(100);
    expect(commits()).toBe("");

    // Touch 1 lifting is the commit, at touch 1's own position: 6 s - 1 s.
    window.dispatchEvent(new PointerEvent("pointerup", pointer(1, x - 44, 0)));
    await wait(100);
    expect(commits()).toBe("a:0.0-5.0");
  },
};

/**
 * A CANCELLED GESTURE DOES NOTHING.
 *
 * `pointercancel` was wired to the release handler, so a press the browser took
 * over still selected and seeked (measured: `select:b` and `scrub:6.00`), and a
 * cancelled pan was flung.
 */
function CancelHarness() {
  const [log, setLog] = useState<string[]>([]);
  return (
    <div>
      <FilmStrip
        shots={Array.from({ length: 12 }, (_, i) => plain(`s${i}`, 4))}
        onSelect={(id) => setLog((l) => [...l, `select:${id}`])}
        onScrub={(s) => setLog((l) => [...l, `scrub:${s.toFixed(2)}`])}
      />
      <output data-check-log>{log.join("|")}</output>
    </div>
  );
}

export const CancelledPressDoesNotSelectOrSeek: Story = {
  render: () => <CancelHarness />,
  play: async ({ canvasElement }) => {
    await wait(300);
    const target = canvasElement.querySelector<HTMLElement>('.shot[data-seam-segment="s1"]');
    if (target === null) throw new Error("no shot s1");
    const r = target.getBoundingClientRect();
    const press = {
      bubbles: true,
      isPrimary: true,
      pointerId: 7,
      pointerType: "touch",
      button: 0,
      buttons: 1,
      clientX: r.x + r.width / 2,
      clientY: r.y + r.height / 2,
    };
    target.dispatchEvent(new PointerEvent("pointerdown", press));
    target.dispatchEvent(new PointerEvent("pointercancel", { ...press, buttons: 0 }));
    await wait(100);
    expect(canvasElement.querySelector("[data-check-log]")?.textContent ?? "").toBe("");
  },
};

export const CancelledPanIsNotFlung: Story = {
  render: () => <CancelHarness />,
  play: async ({ canvasElement }) => {
    await wait(300);
    const viewport = canvasElement.querySelector<HTMLElement>("[data-seam-viewport]");
    const target = canvasElement.querySelector<HTMLElement>('.shot[data-seam-segment="s2"]');
    if (viewport === null || target === null) throw new Error("missing elements");
    const r = target.getBoundingClientRect();
    const at = (clientX: number, buttons = 1) => ({
      bubbles: true,
      isPrimary: true,
      pointerId: 8,
      pointerType: "touch",
      button: 0,
      buttons,
      clientX,
      clientY: r.y + r.height / 2,
    });
    const start = r.x + r.width / 2;
    target.dispatchEvent(new PointerEvent("pointerdown", at(start)));
    // A fast leftward drag: enough velocity that a RELEASE here would throw.
    for (let step = 1; step <= 6; step += 1) {
      await wait(16);
      target.dispatchEvent(new PointerEvent("pointermove", at(start - step * 40)));
    }
    target.dispatchEvent(new PointerEvent("pointercancel", at(start - 240, 0)));
    const afterCancel = viewport.scrollLeft;
    await wait(400);
    expect(viewport.scrollLeft).toBe(afterCancel);
  },
};

/**
 * THE PLAYHEAD'S TIME CHIP STAYS CENTRED ON THE PLAYHEAD AND OVERHANGS THE
 * FILM'S EDGE, whole and on top — and the film does not fade at its edges.
 *
 * The chip lived inside the scrolling viewport, which clips: at either end of
 * the sequence, or with the playhead scrolled to an edge, the half past the
 * edge was cut off (and dimmed by the edge mask). Sliding it inward to fit was
 * rejected — it must stay over the playhead and hang past the edge — so it is
 * drawn above the viewport instead, and hidden only when the playhead itself is
 * scrolled out of view.
 */
export const TimeChipOverhangsTheEdge: Story = {
  render: () => (
    // EMBEDDED, as media-monster uses it: the standalone page frame clips
    // horizontally, which is the reference's own stage and not a host's.
    <div style={{ width: 900, margin: "0 60px" }}>
      <FilmStrip
        standalone={false}
        shots={Array.from({ length: 12 }, (_, i) => plain(`s${i}`, 5))}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const bar = playbar(canvasElement);
    const viewport = canvasElement.querySelector<HTMLElement>("[data-seam-viewport]");
    const chip = document.querySelector<HTMLElement>("[data-seam-time-chip]");
    const playhead = canvasElement.querySelector<HTMLElement>("[data-seam-playhead]");
    if (viewport === null || chip === null || playhead === null) {
      throw new Error("missing elements");
    }

    const check = (label: string) => {
      const c = chip.getBoundingClientRect();
      const v = viewport.getBoundingClientRect();
      const x = playhead.getBoundingClientRect().left;
      // WHOLE AND ON TOP: both ends of the chip — including a part hanging past
      // the film — are the topmost thing on screen.
      const hit = (px: number) => {
        const el = document.elementFromPoint(px, c.top + c.height / 2);
        return el !== null && chip.contains(el);
      };
      return {
        label,
        visible: getComputedStyle(chip).visibility === "visible",
        centred: Math.abs(c.left + c.width / 2 - x) <= 1,
        whole: hit(c.left + 2) && hit(c.right - 2),
        overhangs: c.left < v.left - 1 || c.right > v.right + 1,
      };
    };
    const key = (k: string) =>
      bar.dispatchEvent(new KeyboardEvent("keydown", { key: k, code: k, bubbles: true }));

    await wait(400);
    bar.focus();
    const results = [check("start")];
    // The end of the sequence, scrolled so the playhead sits on the right edge.
    key("End");
    await wait(200);
    viewport.scrollLeft = 12 * 5 * 44 - viewport.clientWidth;
    await wait(300);
    results.push(check("end"));

    expect(results).toEqual([
      { label: "start", visible: true, centred: true, whole: true, overhangs: true },
      { label: "end", visible: true, centred: true, whole: true, overhangs: true },
    ]);

    // Scrolled so the playhead is out of view: no chip floating over whatever
    // sits beside the strip.
    viewport.scrollLeft = 0;
    await wait(300);
    expect(getComputedStyle(chip).visibility).toBe("hidden");

    // No edge fade: the film is shown at full strength right to the edge.
    expect(getComputedStyle(viewport).maskImage).toBe("none");
  },
};

/**
 * A RESIZE RE-CENTRES THE SELECTION.
 *
 * The centring guard compared positions in CONTENT coordinates, which a resize
 * does not change, so the `ResizeObserver` fired and returned. Measured:
 * centred at 1000 px wide, 200 px off after narrowing to 600 px.
 */
export const ResizeKeepsTheSelectionCentred: Story = {
  render: () => (
    <div data-check-frame style={{ width: 1000 }}>
      <FilmStrip shots={Array.from({ length: 12 }, (_, i) => plain(`s${i}`, 5))} selectedId="s6" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const frame = canvasElement.querySelector<HTMLElement>("[data-check-frame]");
    const viewport = canvasElement.querySelector<HTMLElement>("[data-seam-viewport]");
    if (frame === null || viewport === null) throw new Error("missing elements");
    const offCentre = () => {
      const box = canvasElement.querySelector<HTMLElement>('.shot[data-seam-segment="s6"]');
      if (box === null) return Number.NaN;
      const b = box.getBoundingClientRect();
      const v = viewport.getBoundingClientRect();
      return Math.abs(b.x + b.width / 2 - (v.x + v.width / 2));
    };
    await wait(600);
    expect(offCentre()).toBeLessThanOrEqual(2);
    frame.style.width = "600px";
    await wait(600);
    expect(offCentre()).toBeLessThanOrEqual(2);
  },
};
