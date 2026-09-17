/**
 * The rail's width preference as a live STORE: where it is read from, where it
 * is written to, and who is told when it changes.
 *
 * Split from `rail.tsx` so that file is the rail's markup and this one is its
 * persistence. The two were together and the seam was already implicit — every
 * function here is about `document.cookie` and `localStorage` and none of them
 * renders anything.
 *
 * The cookie's NAME and the meaning of its value live one module further out, in
 * `rail-preference.ts`, which carries no `"use client"` so the root layout can
 * read the same preference this file writes. See the note at the top of that
 * file for why importing them from a client module fails only at request time.
 */

import {
  RAIL_COOKIE_MAX_AGE_SECONDS,
  RAIL_EXPANDED_COOKIE,
  railExpandedFromCookies,
} from "@/components/shell/rail-preference";

/** Survives a reload — a rail that collapsed itself on every navigation would
 *  be a preference in name only. */
const RAIL_EXPANDED_STORAGE_KEY = "mm:rail-expanded";

/** Fires when THIS window toggles the rail — the only notification there is,
 *  see `subscribeRailExpanded`. Without it the toggle would not re-render the
 *  window that pressed it. */
const RAIL_EXPANDED_EVENT = "mm:rail-expanded-changed";

export function readRailExpanded(): boolean {
  // The cookie first, because it is what the SERVER rendered from — reading
  // anything else here would be reading a second opinion, and a first client
  // render that disagreed with the markup is a hydration mismatch.
  if (typeof document !== "undefined") {
    const stored = railExpandedFromCookies(document.cookie);
    if (stored !== undefined) return stored;
  }
  // NO COOKIE, WHICH IS NOT THE SAME AS NO PREFERENCE: a browser that refuses
  // cookies makes `writeRailCookie` fail silently, and localStorage is then the
  // only place the toggle landed. The source app also reads this to migrate a
  // rail left open before its cookie existed; that case cannot arise here — this
  // rail has never shipped without the cookie — so the one-load backfill effect
  // that goes with it was left behind.
  try {
    return window.localStorage.getItem(RAIL_EXPANDED_STORAGE_KEY) === "true";
  } catch {
    // Private mode or a blocked origin: the rail still works, it just forgets.
    return false;
  }
}

/** Write the preference where the server can see it. */
function writeRailCookie(next: boolean): void {
  try {
    document.cookie =
      `${RAIL_EXPANDED_COOKIE}=${next}; path=/;` +
      ` max-age=${RAIL_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
  } catch {
    // Cookies blocked: the rail still works for this session, and the next
    // load simply renders the server default again.
  }
}

/**
 * THIS WINDOW ONLY. Deliberately NOT subscribed to `storage`.
 *
 * It was, in the source app, on the reasoning that two tabs should agree about
 * the rail. That is wrong, and the way it was wrong is worth carrying over:
 * `storage` fires in every OTHER tab on the origin, so opening the rail in one
 * window silently collapsed it in every other one. With the width animated, the
 * far window did not read as "something else changed this" — it read as a
 * toggle that stuttered and fell back, because the layout started moving and
 * then went the other way.
 *
 * The rail's width is a property of a WINDOW, not of the account. Two windows
 * side by side are the case where you most want one wide and one narrow.
 * localStorage still carries the preference across a RELOAD, which is the part
 * that was actually wanted; a live window is simply never yanked by another.
 */
export function subscribeRailExpanded(onChange: () => void): () => void {
  window.addEventListener(RAIL_EXPANDED_EVENT, onChange);
  return () => {
    window.removeEventListener(RAIL_EXPANDED_EVENT, onChange);
  };
}

export function commitRailExpanded(next: boolean): void {
  // The cookie is what the next load renders from; localStorage is kept in step
  // so a downgrade does not lose the preference.
  writeRailCookie(next);
  try {
    window.localStorage.setItem(RAIL_EXPANDED_STORAGE_KEY, String(next));
  } catch {
    // A quota or private-mode failure costs the preference, not the toggle —
    // the event still fires, so the rail still moves for this session.
  }
  window.dispatchEvent(new Event(RAIL_EXPANDED_EVENT));
}
