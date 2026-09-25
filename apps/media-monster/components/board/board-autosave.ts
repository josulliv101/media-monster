/**
 * WHETHER THIS TAB HOLDS EDITS THAT ARE NOT SAVED, and when to write them.
 *
 * The autosave used to answer "is anything unsaved?" with "is a write waiting
 * in its delay?", and those came apart twice:
 *
 * - A write that FAILED (storage full or blocked, or a board the engine refused
 *   to serialize) had already cleared its timer, so the tab reported nothing
 *   unsaved while its edits lived only in memory. Leaving the page did not
 *   retry, and another tab's save replaced them without asking (measured:
 *   the save error shown, `pending` false).
 * - A CONFLICT with another tab cancelled the timer to hold the write back, and
 *   with it the only sign that there was anything to hold. The next save from
 *   the other tab found nothing unsaved and was adopted, taking this tab's
 *   edits and undo history with it while the conflict prompt was still up.
 *
 * So `unsaved` is its own flag. It is set by every edit and cleared only by a
 * write that SUCCEEDED or by an explicit discard (reset, start over, taking the
 * other tab's version). The timer only decides WHEN to write.
 *
 * Plain TypeScript with no React and no storage of its own: the board hands it
 * `write`, so it can be driven directly in a test.
 */

/** What to do about a save made by another tab. */
export type OtherTabVerdict = "adopt" | "conflict";

export type BoardAutosave = Readonly<{
  /** The board changed: it is unsaved, and written after the delay. */
  changed: () => void;
  /** Write now if anything is unsaved (the page is being hidden or left). */
  flush: () => void;
  /** Whether this tab holds edits that are not in storage. */
  unsaved: () => boolean;
  /**
   * Another tab saved. With nothing unsaved here its version can be taken
   * ("adopt"). With edits here, or a conflict already open, writes are held
   * back and the user decides ("conflict") — however many more saves arrive
   * before they do.
   */
  otherTabSaved: () => OtherTabVerdict;
  /** Resolve a conflict by writing this tab's version over the other one. */
  keepMine: () => void;
  /** Forget this tab's unsaved edits without writing them. */
  discard: () => void;
  /** Stop the timer for good; nothing is written. */
  dispose: () => void;
}>;

export function createBoardAutosave({
  write,
  report,
  delayMs,
}: Readonly<{
  /** Writes the board, returning why it could not, or `null` when it did. */
  write: () => string | null;
  /** Hears every write's outcome, so the board can show or clear the error. */
  report: (error: string | null) => void;
  delayMs: number;
}>): BoardAutosave {
  let unsaved = false;
  let conflict = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stopTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const writeNow = () => {
    stopTimer();
    const error = write();
    // ONLY A WRITE THAT LANDED clears the flag. A failed one leaves the edits
    // unsaved, so the next edit, hiding the page, or leaving it tries again.
    if (error === null) unsaved = false;
    report(error);
  };

  return {
    changed: () => {
      unsaved = true;
      // Held back while the user decides between this tab and the other one:
      // a write now would settle the conflict for them.
      if (conflict) return;
      stopTimer();
      timer = setTimeout(writeNow, delayMs);
    },
    flush: () => {
      if (unsaved && !conflict) writeNow();
    },
    unsaved: () => unsaved,
    otherTabSaved: () => {
      if (!unsaved && !conflict) return "adopt";
      stopTimer();
      conflict = true;
      return "conflict";
    },
    keepMine: () => {
      conflict = false;
      writeNow();
    },
    discard: () => {
      stopTimer();
      unsaved = false;
      conflict = false;
    },
    dispose: stopTimer,
  };
}
