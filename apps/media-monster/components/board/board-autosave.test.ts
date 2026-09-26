import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createBoardAutosave } from "./board-autosave";

const DELAY = 400;

/**
 * A board autosave over a fake storage: `stored` is what the next load would
 * read, `mine` is what this tab holds in memory, and `failing` makes the next
 * writes fail the way a full or blocked `localStorage` does.
 */
function harness() {
  const state = { stored: "loaded", mine: "loaded", failing: false, errors: [] as (string | null)[] };
  const autosave = createBoardAutosave({
    write: () => {
      if (state.failing) return "this browser's storage is full or blocked";
      state.stored = state.mine;
      return null;
    },
    report: (error) => state.errors.push(error),
    delayMs: DELAY,
  });
  const edit = (to: string) => {
    state.mine = to;
    autosave.changed();
  };
  return { state, autosave, edit };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("board autosave", () => {
  it("writes an edit after the delay, one write for a burst", () => {
    const { state, autosave, edit } = harness();
    edit("a");
    edit("b");
    expect(autosave.unsaved()).toBe(true);
    vi.advanceTimersByTime(DELAY - 1);
    expect(state.stored).toBe("loaded");
    vi.advanceTimersByTime(1);
    expect(state.stored).toBe("b");
    expect(state.errors).toEqual([null]);
    expect(autosave.unsaved()).toBe(false);
  });

  it("adopts another tab's save when nothing here is unsaved", () => {
    const { autosave } = harness();
    expect(autosave.otherTabSaved()).toBe("adopt");
  });

  describe("a conflict with another tab", () => {
    it("holds the edit back instead of writing it", () => {
      const { state, autosave, edit } = harness();
      edit("mine");
      expect(autosave.otherTabSaved()).toBe("conflict");
      vi.advanceTimersByTime(DELAY * 10);
      autosave.flush();
      expect(state.stored).toBe("loaded");
      expect(autosave.unsaved()).toBe(true);
    });

    // THE P1. The first remote save opened the conflict; the second one found
    // "nothing unsaved" (the timer had been cancelled to hold the write back)
    // and was adopted, discarding this tab's edits with the prompt still up.
    it("stays a conflict through every further save from the other tab", () => {
      const { autosave, edit } = harness();
      edit("mine");
      expect(autosave.otherTabSaved()).toBe("conflict");
      expect(autosave.otherTabSaved()).toBe("conflict");
      expect(autosave.otherTabSaved()).toBe("conflict");
      expect(autosave.unsaved()).toBe(true);
    });

    it("stays a conflict when more edits are made while it is open, and writes none", () => {
      const { state, autosave, edit } = harness();
      edit("mine");
      autosave.otherTabSaved();
      edit("mine, again");
      vi.advanceTimersByTime(DELAY * 10);
      expect(state.stored).toBe("loaded");
      expect(autosave.otherTabSaved()).toBe("conflict");
    });

    it("'keep mine' writes this tab's version and ends the conflict", () => {
      const { state, autosave, edit } = harness();
      edit("mine");
      autosave.otherTabSaved();
      state.stored = "theirs";
      autosave.keepMine();
      expect(state.stored).toBe("mine");
      expect(autosave.unsaved()).toBe(false);
      expect(autosave.otherTabSaved()).toBe("adopt");
    });

    it("taking theirs discards this tab's edits and ends the conflict", () => {
      const { state, autosave, edit } = harness();
      edit("mine");
      autosave.otherTabSaved();
      state.stored = "theirs";
      autosave.discard();
      autosave.flush();
      expect(state.stored).toBe("theirs");
      expect(autosave.unsaved()).toBe(false);
      expect(autosave.otherTabSaved()).toBe("adopt");
    });
  });

  describe("a write that fails", () => {
    // THE P2. The timer was cleared before the write, so a failed write left
    // the tab reporting nothing unsaved while the edits lived only in memory.
    it("leaves the edits unsaved and reports why", () => {
      const { state, autosave, edit } = harness();
      state.failing = true;
      edit("mine");
      vi.advanceTimersByTime(DELAY);
      expect(state.stored).toBe("loaded");
      expect(state.errors).toEqual(["this browser's storage is full or blocked"]);
      expect(autosave.unsaved()).toBe(true);
    });

    it("is retried by a flush (hiding or leaving the page, or 'Try again')", () => {
      const { state, autosave, edit } = harness();
      state.failing = true;
      edit("mine");
      vi.advanceTimersByTime(DELAY);
      state.failing = false;
      autosave.flush();
      expect(state.stored).toBe("mine");
      expect(state.errors).toEqual(["this browser's storage is full or blocked", null]);
      expect(autosave.unsaved()).toBe(false);
    });

    it("is retried by the next edit", () => {
      const { state, autosave, edit } = harness();
      state.failing = true;
      edit("mine");
      vi.advanceTimersByTime(DELAY);
      state.failing = false;
      edit("mine, again");
      vi.advanceTimersByTime(DELAY);
      expect(state.stored).toBe("mine, again");
      expect(autosave.unsaved()).toBe(false);
    });

    it("makes another tab's save a conflict, not an adoption", () => {
      const { state, autosave, edit } = harness();
      state.failing = true;
      edit("mine");
      vi.advanceTimersByTime(DELAY);
      expect(autosave.otherTabSaved()).toBe("conflict");
    });

    it("asks again on the next save after a 'keep mine' that failed", () => {
      const { state, autosave, edit } = harness();
      edit("mine");
      autosave.otherTabSaved();
      state.failing = true;
      autosave.keepMine();
      expect(autosave.unsaved()).toBe(true);
      // Still unsaved, so the next save from the other tab asks again.
      expect(autosave.otherTabSaved()).toBe("conflict");
    });

    // The error is about edits that are gone once discarded. "Load the other
    // tab's" left it up (measured: the red notice back over the other tab's
    // board, and "Try again" unable to clear it, with nothing left to write).
    it("is cleared when the edits it was about are discarded", () => {
      const { state, autosave, edit } = harness();
      state.failing = true;
      edit("mine");
      vi.advanceTimersByTime(DELAY);
      autosave.otherTabSaved();
      autosave.discard();
      expect(state.errors).toEqual(["this browser's storage is full or blocked", null]);
    });
  });

  describe("discarding (Reset, Start over)", () => {
    it("drops a write still in its delay, so nothing is flushed back", () => {
      const { state, autosave, edit } = harness();
      edit("mine");
      state.stored = "cleared";
      autosave.discard();
      vi.advanceTimersByTime(DELAY * 10);
      autosave.flush();
      expect(state.stored).toBe("cleared");
      expect(autosave.unsaved()).toBe(false);
    });
  });

  it("writes nothing after dispose", () => {
    const { state, autosave, edit } = harness();
    edit("mine");
    autosave.dispose();
    vi.advanceTimersByTime(DELAY * 10);
    expect(state.stored).toBe("loaded");
  });
});
