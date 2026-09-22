import type { FilmStripSize } from "@storyboard/ui/film-strip";

/**
 * The film strip's size preference, as the server and the client share it.
 *
 * NO `"use client"`, for the reason `rail-preference.ts` gives: the page reads
 * this cookie on the server, and every export of a client module is a
 * reference proxy there, unusable at request time.
 *
 * A COOKIE, not localStorage, because the strip is pinned to the bottom of the
 * viewport. A preference the server cannot see would render the default size
 * and then shrink it on hydration, a visible jump at the bottom of the page on
 * every load. Named `mm_` for the reason the rail's cookie is: cookies are not
 * port-scoped, and the old app shares `localhost` with this one.
 */
export const FILM_STRIP_SIZE_COOKIE = "mm_film_strip_size";
export const FILM_STRIP_SIZE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Anything but `"compact"`, absence included, is the default size. */
export function filmStripSizeFromValue(value: string | undefined): FilmStripSize {
  return value === "compact" ? "compact" : "default";
}

/** Read the size out of a `document.cookie` string, by exact name. */
export function filmStripSizeFromCookies(header: string): FilmStripSize {
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === FILM_STRIP_SIZE_COOKIE) return filmStripSizeFromValue(rest.join("="));
  }
  return "default";
}
