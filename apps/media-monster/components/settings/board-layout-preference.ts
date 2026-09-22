/**
 * How the board lays a collection's clips out, as the server and the client
 * share it.
 *
 * NO `"use client"`, for the reason `rail-preference.ts` gives: the page reads
 * this cookie on the server, and every export of a client module is a reference
 * proxy there, unusable at request time.
 *
 * A COOKIE, like the film strip's size and for the same reason: the layout
 * changes the height of everything below it, so a preference the server cannot
 * see would render one shape and swap to the other on hydration. Named `mm_`
 * because cookies are not port-scoped and the old app shares `localhost`.
 */
export const BOARD_LAYOUT_COOKIE = "mm_board_layout";
export const BOARD_LAYOUT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * `"grid"` wraps the clips into as many rows as they need — every clip on
 * screen, the card grid the board has always drawn. `"row"` keeps each
 * collection to ONE row that runs off the right edge and scrolls sideways, the
 * way the film strip does: the collection's height stops depending on how much
 * it holds, so a deep document stays readable by scrolling the page.
 */
export type BoardLayout = "grid" | "row";

/** Anything but `"row"`, absence included, is the wrapping grid. */
export function boardLayoutFromValue(value: string | undefined): BoardLayout {
  return value === "row" ? "row" : "grid";
}

/** Read the layout out of a `document.cookie` string, by exact name. */
export function boardLayoutFromCookies(header: string): BoardLayout {
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === BOARD_LAYOUT_COOKIE) return boardLayoutFromValue(rest.join("="));
  }
  return "grid";
}
