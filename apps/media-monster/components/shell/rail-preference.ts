/**
 * The rail's width preference, as the two sides of the app share it.
 *
 * NO `"use client"`, and that is the whole reason this file is separate from
 * the rail. These constants and the parser would naturally live in `rail.tsx`,
 * which is a client module — and the root layout importing `railExpandedFrom
 * Cookies` from there typechecks cleanly and then fails at REQUEST time with
 * "Attempted to call railExpandedFromCookies() from the server but it is on the
 * client". Next replaces a client module with a reference proxy for the server
 * graph, so every export of one is unusable server-side, not just its
 * components. The source app hit exactly this and split the file for it.
 *
 * A neutral module is the seam: the server reads the cookie through it, the
 * rail writes the cookie through it, and there is one spelling of the cookie's
 * name for them to agree on.
 *
 * The widths and the CSS variable stay in `rail-width.ts`, which the layout
 * already imports for the same server-safety reason.
 */

/**
 * The rail preference as a COOKIE, because the server has to know it.
 *
 * localStorage is invisible to the server, so a rail whose preference lived
 * only there would render collapsed on every load and expand on hydration —
 * shoving everything beside it sideways. In the source app that was 188px and
 * 0.135 of a 0.16 cumulative layout shift. No amount of client-side cleverness
 * fixes it: the first paint has to be right, and only something that travels
 * with the REQUEST can make it right.
 *
 * READ AS THE SOURCE OF TRUTH on both sides rather than mirrored alongside
 * localStorage. Two stores that can disagree are a hydration mismatch waiting
 * for the first reader whose copies drift — cleared site data, an old tab, a
 * private window. One store cannot disagree with itself.
 *
 * `SameSite=Lax` and a year: a display preference, sent on top-level
 * navigations, which is exactly when the server needs it.
 *
 * NAMED `mm_`, NOT `sw_` LIKE THE SOURCE, and that is load-bearing rather than
 * tidiness. Cookies are scoped to a host and NOT to a port, so in local
 * development `localhost:3000` and `localhost:3001` share one jar: under the
 * source's name, toggling this rail would silently retoggle the old app's, and
 * each would render from the other's last press. Two apps on one host need two
 * names.
 */
export const RAIL_EXPANDED_COOKIE = "mm_rail_expanded";
export const RAIL_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * What a stored value MEANS. Absent means collapsed: no cookie is nobody having
 * toggled it, and any value but `"true"` is not an expanded rail.
 *
 * The two sides reach the cookie differently — the server has a parsed store,
 * the client has one `document.cookie` string — so they cannot share a reader.
 * They can share this, which is the part that could actually drift: if the
 * written value ever stops being the string `"true"`, one function changes and
 * both sides follow.
 */
export function railExpandedFromValue(value: string | undefined): boolean {
  return value === "true";
}

/**
 * Parse the rail cookie out of a `document.cookie` string.
 *
 * The client's entry point. The server has no need of it — `next/headers` hands
 * back a parsed store — so this is deliberately not the shared thing; see
 * `railExpandedFromValue` for what is.
 *
 * `undefined` MEANS THE COOKIE IS ABSENT, which is not the same answer as
 * `false`, and the distinction is what lets the caller fall through to
 * localStorage only when there is genuinely nothing here. The source app asks
 * `document.cookie.includes(NAME)` first and then parses, which is a substring
 * test standing in for a name test: any cookie whose name merely CONTAINS this
 * one's reports present, and the parse that follows then finds no exact match
 * and answers `false` — a rail that silently collapses because of an unrelated
 * cookie. Returning the absence from the parser itself removes the second
 * reader rather than fixing it.
 */
export function railExpandedFromCookies(
  header: string | undefined,
): boolean | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === RAIL_EXPANDED_COOKIE) {
      return railExpandedFromValue(rest.join("="));
    }
  }
  return undefined;
}
