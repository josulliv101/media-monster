/**
 * Which collection rows are SWITCHED OFF, kept between loads.
 *
 * NO `"use client"`, for the reason `rail-preference.ts` gives: the page reads
 * this cookie on the server, and every export of a client module is a
 * reference proxy there, unusable at request time.
 *
 * A COOKIE, like the other view preferences, so the server renders every row
 * in the state it was left in and the first paint does not flip rows over on
 * hydration. It holds only the rows that are OFF: on is the default, so a row
 * nobody touched costs nothing, and a document edited nowhere stays empty.
 *
 * The document itself still does not persist (see the page's note); this is
 * the one piece of it kept, until documents are saved somewhere real.
 */
export const INACTIVE_ROWS_COOKIE = "mm_inactive_rows";
export const INACTIVE_ROWS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * THE IDS ARE ENCODED AS BASE64URL OF A JSON ARRAY, not joined with a
 * separator. A node id is any string, so any separator can appear inside one;
 * and a cookie value cannot hold commas, semicolons or spaces, while Next
 * percent-decodes values on the server, which would undo an escaping scheme
 * built on `%`. Base64url's alphabet is letters, digits, `-` and `_`: nothing
 * in it needs escaping and nothing decodes it by accident.
 */
export function encodeInactiveRows(ids: readonly string[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify(ids));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The ids in a stored value. Anything unreadable is no rows switched off. */
export function inactiveRowsFromValue(value: string | undefined): string[] {
  if (value === undefined || value === "") return [];
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** Read the ids out of a `document.cookie` string, by exact name. */
export function inactiveRowsFromCookies(header: string): string[] {
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === INACTIVE_ROWS_COOKIE) return inactiveRowsFromValue(rest.join("="));
  }
  return [];
}

/** Write the ids where the next load's server will read them. */
export function writeInactiveRows(ids: readonly string[]): void {
  try {
    document.cookie =
      `${INACTIVE_ROWS_COOKIE}=${encodeInactiveRows(ids)}; path=/;` +
      ` max-age=${INACTIVE_ROWS_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
  } catch {
    // Cookies blocked: the switches still work, they just reset on reload.
  }
}
