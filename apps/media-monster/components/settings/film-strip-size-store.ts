import type { FilmStripSize } from "@storyboard/ui/film-strip";

import {
  FILM_STRIP_SIZE_COOKIE,
  FILM_STRIP_SIZE_COOKIE_MAX_AGE_SECONDS,
  filmStripSizeFromCookies,
} from "@/components/settings/film-strip-size-preference";

/**
 * The film strip's size as a live store, read with `useSyncExternalStore`.
 *
 * The cookie is what persists. The settings dialog writes it and fires an
 * event in this window; the board's strip re-reads. The choice is ALSO held in
 * memory, so a browser that refuses cookies still gets the change for the
 * session (reading the cookie back there would answer the old size); it just
 * does not survive a reload.
 */
const FILM_STRIP_SIZE_EVENT = "mm:film-strip-size-changed";

let chosenThisSession: FilmStripSize | null = null;

export function readFilmStripSize(): FilmStripSize {
  return chosenThisSession ?? filmStripSizeFromCookies(document.cookie);
}

export function subscribeFilmStripSize(onChange: () => void): () => void {
  window.addEventListener(FILM_STRIP_SIZE_EVENT, onChange);
  return () => window.removeEventListener(FILM_STRIP_SIZE_EVENT, onChange);
}

export function commitFilmStripSize(next: FilmStripSize): void {
  chosenThisSession = next;
  try {
    document.cookie =
      `${FILM_STRIP_SIZE_COOKIE}=${next}; path=/;` +
      ` max-age=${FILM_STRIP_SIZE_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
  } catch {
    // Cookies blocked: `chosenThisSession` carries it until reload.
  }
  window.dispatchEvent(new Event(FILM_STRIP_SIZE_EVENT));
}
