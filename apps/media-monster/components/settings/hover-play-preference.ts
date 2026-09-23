/**
 * Whether a clip card's video plays when the pointer rests on it.
 *
 * NO `"use client"`, like the other preferences: plain values and parsing, so
 * anything can read them.
 *
 * A COOKIE, for the same session-surviving reason as the others. Unlike the
 * layout and strip size it is NOT read on the server: it changes what a card
 * does when hovered, not how the page is drawn, so there is nothing for the
 * first paint to get wrong. Named `mm_` because cookies are not port-scoped
 * and the old app shares `localhost`.
 */
export const HOVER_PLAY_COOKIE = "mm_hover_play";
export const HOVER_PLAY_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** `"on"`: a card's video plays once the pointer comes to rest on it. `"off"`:
 *  cards show their still until opened. */
export type HoverPlay = "on" | "off";

/** Anything but `"off"`, absence included, is on — the board's behaviour until now. */
export function hoverPlayFromValue(value: string | undefined): HoverPlay {
  return value === "off" ? "off" : "on";
}

/** Read the choice out of a `document.cookie` string, by exact name. */
export function hoverPlayFromCookies(header: string): HoverPlay {
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === HOVER_PLAY_COOKIE) return hoverPlayFromValue(rest.join("="));
  }
  return "on";
}
