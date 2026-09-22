import {
  BOARD_LAYOUT_COOKIE,
  BOARD_LAYOUT_COOKIE_MAX_AGE_SECONDS,
  boardLayoutFromCookies,
  type BoardLayout,
} from "@/components/settings/board-layout-preference";

/**
 * The board's layout as a live store, read with `useSyncExternalStore`.
 *
 * The same shape as the film strip's size store, deliberately: one preference,
 * one cookie, one event, and the board re-reads. The choice is also held in
 * memory so a browser that refuses cookies still gets the change for the
 * session — reading the cookie back there would answer the old layout.
 */
const BOARD_LAYOUT_EVENT = "mm:board-layout-changed";

let chosenThisSession: BoardLayout | null = null;

export function readBoardLayout(): BoardLayout {
  return chosenThisSession ?? boardLayoutFromCookies(document.cookie);
}

export function subscribeBoardLayout(onChange: () => void): () => void {
  window.addEventListener(BOARD_LAYOUT_EVENT, onChange);
  return () => window.removeEventListener(BOARD_LAYOUT_EVENT, onChange);
}

export function commitBoardLayout(next: BoardLayout): void {
  chosenThisSession = next;
  try {
    document.cookie =
      `${BOARD_LAYOUT_COOKIE}=${next}; path=/;` +
      ` max-age=${BOARD_LAYOUT_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
  } catch {
    // Cookies blocked: `chosenThisSession` carries it until reload.
  }
  window.dispatchEvent(new Event(BOARD_LAYOUT_EVENT));
}
