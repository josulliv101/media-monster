/**
 * The rail's width, as a custom property and the two numbers it takes.
 *
 * FRAMEWORK-NEUTRAL AND NOT A CLIENT MODULE, deliberately. The root layout is a
 * server component and imports these; in the source app the equivalent
 * constants had to be split out of `timeline-sidebar.tsx` for exactly that
 * reason — that file carries `"use client"`, and a server component reaching
 * into it typechecks perfectly and fails at request time. Keeping the numbers
 * somewhere with no runtime is what stops that seam from ever existing here.
 *
 * Ported from `sidebar-rail-preference.ts` and `sidebar-icon-styles.ts` in
 * `apps/timeline-gstudio001`, which carry the cookie parser, the tile styles and
 * the glyph insets alongside these numbers. The rail has since arrived and
 * brought its share of those with it — `rail-preference.ts` for the cookie,
 * `rail-tile-styles.ts` for the treatment. This file stays the widths alone,
 * because those two are the only modules the widths must not depend on: the root
 * layout imports this, and a layout is a server component.
 */

/**
 * Published to the document so surfaces BESIDE the rail can be offset by it.
 *
 * A variable rather than a literal is the seam: one writer, any number of
 * readers that keep working when the number moves. The source app learned this
 * from a drawer that hardcoded `ml-[72px]` and would have slid under the rail
 * the moment it could widen.
 */
export const RAIL_WIDTH_VAR = "--sw-rail-width";

/** The rail's collapsed width, and the tile edge that follows from it. */
export const RAIL_WIDTH_PX = 72;

/**
 * The rail's width with labels showing.
 *
 * THE WORDMARK SETS THIS NUMBER, not the labels. Measured in the source app at
 * 240: the mark's ink is 159px starting 22px in, which leaves 59px clear. It was
 * 232 when it had to fit "Storyboard Workbench" and cleared that by three
 * pixels — enough then, and not enough to survive a font fallback rendering a
 * fraction wider. The creature is the MEDIA monster now, so the shorter name has
 * more room at the narrower rail than the old one had at a wider one.
 *
 * Collection names are the other tenant here when they arrive, and they are
 * user-authored, so no width could ever be "enough" for them; they truncate,
 * which degrades to an ellipsis rather than shoving the rail's rhythm out of
 * line.
 */
export const RAIL_OPEN_WIDTH_PX = 240;
