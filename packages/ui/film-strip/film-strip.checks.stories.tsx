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
    //
    // WAITED FOR, NOT RACED. This slept one real second and required 0.5s of
    // clock, and a loaded CI runner came in at 0.42 and then exactly 0.5 on
    // unchanged strip code, turning main red. The broken clock NEVER gets past
    // one frame's worth (1/24s), however long it runs; a working one passes six
    // frames as soon as it has run long enough, however slow the machine. So
    // the bar is six frames and the deadline is generous: a slow runner waits
    // longer, and only a stuck clock fails. Measured with the clock stuck the
    // old way (every frame recomputed from the start): it waits the full five
    // seconds and fails.
    await waitFor(() => expect(seconds()).toBeGreaterThan(6 / 24), { timeout: 5000 });
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

/**
 * COMPACT SIZE: shorter frames, and nothing else moves — the minimap included. The lane,
 * ruler and playhead keep their geometry, so the time chip sits where it does
 * at the default size and a click on the ruler still lands the playhead.
 */
export const CompactSizeShortensOnlyTheFrames: Story = {
  render: () => (
    <div style={{ width: 900, margin: "0 60px", display: "grid", gap: 24 }}>
      <div data-size-probe="default">
        <FilmStrip standalone={false} shots={Array.from({ length: 6 }, (_, i) => plain(`d${i}`, 5))} />
      </div>
      <div data-size-probe="compact">
        <FilmStrip
          standalone={false}
          size="compact"
          shots={Array.from({ length: 6 }, (_, i) => plain(`c${i}`, 5))}
        />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const part = (size: string, selector: string) => {
      const el = canvasElement.querySelector<HTMLElement>(`[data-size-probe="${size}"] ${selector}`);
      if (el === null) throw new Error(`missing ${selector} in ${size}`);
      return el;
    };
    const height = (size: string, selector: string) =>
      Math.round(part(size, selector).getBoundingClientRect().height);

    await expect(part("compact", "[data-seam-size]").dataset.seamSize).toBe("compact");
    await expect(height("default", ".strip")).toBe(150);
    await expect(height("compact", ".strip")).toBe(64);
    await expect(getComputedStyle(part("default", ".minimap")).display).not.toBe("none");
    await expect(getComputedStyle(part("compact", ".minimap")).display).not.toBe("none");
    await expect(height("compact", ".minimap")).toBe(height("default", ".minimap"));
    // Unchanged geometry above the frames.
    await expect(height("compact", ".ruler")).toBe(height("default", ".ruler"));
    await expect(height("compact", ".lane")).toBe(height("default", ".lane"));

    // The ruler still scrubs: a click 5 seconds in lands the playhead there.
    const ruler = part("compact", ".ruler");
    const box = ruler.getBoundingClientRect();
    const slider = part("compact", "[data-seam-track]");
    const x = box.left + 5 * 44 - part("compact", "[data-seam-viewport]").scrollLeft;
    const at = { clientX: x, clientY: box.top + box.height / 2, bubbles: true, isPrimary: true, pointerId: 1, button: 0 };
    ruler.dispatchEvent(new PointerEvent("pointerdown", at));
    ruler.dispatchEvent(new PointerEvent("pointerup", at));
    await waitFor(() =>
      expect(Math.abs(Number(slider.getAttribute("aria-valuenow")) - 5)).toBeLessThan(0.25),
    );
  },
};

/**
 * A SELECTION FROM OUTSIDE MOVES THE PLAYHEAD, as a tap on the box would.
 *
 * A host that selects a clip (media-monster's "go to", a card on its board)
 * used to move only the highlight: the strip centred the box and left the
 * playhead where it was, so the two disagreed about which clip was current.
 * Now an outside selection puts the playhead on the clip's first frame.
 *
 * A TAP MUST STILL WIN. The strip reports a tap through `onSelect`, the host
 * echoes it back as `selectedId`, and that echo must not drag the playhead from
 * where the tap landed to the clip's start. The last step checks exactly that.
 */
function OutsideSelectionHarness() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div data-check-frame style={{ width: 1000 }}>
      <button type="button" data-pick="s8" onClick={() => setSelected("s8")}>
        s8
      </button>
      <button type="button" data-pick="s3" onClick={() => setSelected("s3")}>
        s3
      </button>
      <FilmStrip
        standalone={false}
        shots={Array.from({ length: 12 }, (_, i) => plain(`s${i}`, 5))}
        selectedId={selected}
        onSelect={setSelected}
      />
    </div>
  );
}

export const OutsideSelectionMovesThePlayhead: Story = {
  render: () => <OutsideSelectionHarness />,
  play: async ({ canvasElement }) => {
    const viewport = canvasElement.querySelector<HTMLElement>("[data-seam-viewport]");
    const slider = canvasElement.querySelector<HTMLElement>("[data-seam-track]");
    if (viewport === null || slider === null) throw new Error("missing elements");
    const now = () => Number(slider.getAttribute("aria-valuenow"));
    const box = (id: string) => {
      const found = Array.from(canvasElement.querySelectorAll<HTMLElement>(".shot")).find(
        (candidate) => candidate.getAttribute("data-seam-segment") === id,
      );
      if (found === undefined) throw new Error(`no box ${id}`);
      return found;
    };
    const offCentre = (id: string) => {
      const b = box(id).getBoundingClientRect();
      const v = viewport.getBoundingClientRect();
      return Math.abs(b.x + b.width / 2 - (v.x + v.width / 2));
    };
    const pick = (id: string) =>
      canvasElement.querySelector<HTMLButtonElement>(`[data-pick="${id}"]`)?.click();

    await expect(now()).toBe(0);

    // Outside selection: playhead to the clip's start, box to the centre.
    pick("s8");
    await waitFor(() => expect(now()).toBeCloseTo(40, 3));
    await waitFor(() => expect(offCentre("s8")).toBeLessThanOrEqual(2), { timeout: 2000 });

    pick("s3");
    await waitFor(() => expect(now()).toBeCloseTo(15, 3));
    await waitFor(() => expect(offCentre("s3")).toBeLessThanOrEqual(2), { timeout: 2000 });

    // A tap three-fifths of the way into s4 lands THERE (about 23 s), and the
    // host echoing the selection back does not pull it to s4's start (20 s).
    const b = box("s4").getBoundingClientRect();
    const at = {
      clientX: b.x + b.width * 0.6,
      clientY: b.y + b.height / 2,
      bubbles: true,
      isPrimary: true,
      pointerId: 1,
      button: 0,
    };
    box("s4").dispatchEvent(new PointerEvent("pointerdown", at));
    box("s4").dispatchEvent(new PointerEvent("pointerup", at));
    await waitFor(() => expect(now()).toBeGreaterThan(22));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(now()).toBeGreaterThan(22);
    expect(now()).toBeLessThan(24);
  },
};
