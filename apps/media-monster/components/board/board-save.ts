import {
  BOARD_SAVED_COOKIE,
  BOARD_SAVED_COOKIE_MAX_AGE_SECONDS,
} from "@/components/settings/saved-board-preference";
import { writeInactiveRows } from "@/components/settings/inactive-rows-preference";
import { engine } from "@/lib/engine/engine";

/**
 * THE BOARD, SAVED IN THIS BROWSER.
 *
 * `localStorage`, under one key, holding the engine's own wire format
 * (`engine.serializeChecked`, read back with `engine.deserialize`), so what is
 * saved is exactly what the engine promises to load. Per browser and per
 * device: clearing site data clears it, and another browser starts from the
 * sample.
 *
 * A COLLECTION NOT READ YET STAYS UNREAD in the save — the engine writes it as
 * a reference, and it is read from its source when opened, as it always was.
 * Only what has been read and edited is written.
 *
 * NEVER A DEAD FILE OVER A GOOD ONE. `serializeChecked` refuses a graph that
 * would not load back, and then nothing is written: the previous save is still
 * loadable, the board in memory is not. The caller says so; it does not write
 * anyway.
 */
/** The storage key the board is saved under; other tabs watch it (`storage`). */
export const BOARD_SAVE_KEY = "mm:board:v1";
const KEY = BOARD_SAVE_KEY;

type Graph = ReturnType<typeof engine.createStore>["getGraph"] extends () => infer G ? G : never;

export type SavedBoard =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "ok"; graph: Graph; sealedCount: number }>
  | Readonly<{ kind: "broken"; reason: string }>;

/** What this browser holds, parsed. Never throws. */
export function readSavedBoard(): SavedBoard {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // Storage blocked: as far as this page can tell, nothing is saved.
    return { kind: "none" };
  }
  if (raw === null) return { kind: "none" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "broken", reason: "it isn’t valid JSON" };
  }
  const loaded = engine.deserialize(parsed);
  if (!loaded.ok) {
    return { kind: "broken", reason: `${loaded.error.code}: ${loaded.error.message}` };
  }
  return { kind: "ok", graph: loaded.value.graph, sealedCount: loaded.value.report.sealed.length };
}

/** Saves `graph`, returning why it could not, or `null` when it did. */
export function writeSavedBoard(graph: Graph): string | null {
  const written = engine.serializeChecked(graph);
  if (!written.ok) return `${written.error.code}: ${written.error.message}`;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(written.value));
  } catch {
    return "this browser's storage is full or blocked";
  }
  setSavedCookie(true);
  return null;
}

/**
 * THE SAVE WAITING TO BE WRITTEN, if any: the board's autosave registers
 * itself here while it runs, so that clearing the save (Reset, Start over) can
 * cancel a write still sitting in its delay first, and a change arriving from
 * another tab can tell whether this one has an edit of its own not yet saved.
 *
 * Without the cancel, a Reset inside the delay was undone by the autosave's own
 * cleanup, which flushed the OLD board back into storage straight after it was
 * cleared (measured: the reset board came back on reload).
 */
type PendingSave = Readonly<{ pending: () => boolean; cancel: () => void }>;
let pendingSave: PendingSave | null = null;

export function registerPendingSave(save: PendingSave): () => void {
  pendingSave = save;
  return () => {
    if (pendingSave === save) pendingSave = null;
  };
}

/** Whether this tab has an edit made but not yet written. */
export function hasPendingSave(): boolean {
  return pendingSave?.pending() ?? false;
}

/** Drops this tab's unwritten edit without writing it. */
export function cancelPendingSave(): void {
  pendingSave?.cancel();
}

/**
 * Forgets the saved board: the next load starts from the sample, every row on.
 *
 * The switched-off rows go too. Their cookie keeps the ids of rows inside
 * collections not read yet, so they can be switched off again when read; left
 * behind by a reset, it switched them off again in the fresh sample (measured:
 * B-roll's Locations came back off after Reset and reopening B-roll).
 */
export function clearSavedBoard(): void {
  cancelPendingSave();
  writeInactiveRows([]);
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Blocked storage held nothing to clear.
  }
  setSavedCookie(false);
}

function setSavedCookie(saved: boolean): void {
  try {
    document.cookie = saved
      ? `${BOARD_SAVED_COOKIE}=1; path=/; max-age=${BOARD_SAVED_COOKIE_MAX_AGE_SECONDS}; samesite=lax`
      : `${BOARD_SAVED_COOKIE}=; path=/; max-age=0; samesite=lax`;
  } catch {
    // Cookies blocked: the first paint shows the sample before the save, no worse.
  }
}

/** Fired on `window` when Settings resets the board, so the board rebuilds. */
export const BOARD_RESET_EVENT = "mm:board-reset";
