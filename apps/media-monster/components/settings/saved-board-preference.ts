/**
 * Whether this browser holds a saved board, as the server can see it.
 *
 * NO `"use client"`, like the other preferences: the page reads this cookie on
 * the server.
 *
 * THE BOARD ITSELF IS NOT IN A COOKIE — it lives in the browser's storage
 * (`board-save.ts`), which the server cannot read. This flag is only what lets
 * the server know one is there: with it set, the first paint is a loading state
 * rather than the sample board, which would otherwise flash up and then be
 * swapped for your own. Named `mm_` because cookies are not port-scoped and
 * the old app shares `localhost`.
 */
export const BOARD_SAVED_COOKIE = "mm_board_saved";
export const BOARD_SAVED_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function hasSavedBoardFromValue(value: string | undefined): boolean {
  return value === "1";
}
