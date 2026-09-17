/**
 * The rail's tile styling, and the class hooks its geometry hangs off.
 *
 * Its own module rather than living inside `rail.tsx` because in the source app
 * these are worn by a control the rail does not render: the board portals its
 * options trigger out and dresses it as a rail tile. Nothing portals into this
 * rail yet — the module is split anyway, because the alternative is moving
 * these constants later out of a file that will by then have several importers.
 *
 * WHAT DID NOT COME OVER, and why, since the source has more than this:
 *
 * `SIDEBAR_ICON_PRESSED` is the active treatment for a tile that says WHERE YOU
 * ARE — an indicator bar at the rail's edge. This rail has no destinations yet,
 * only its own width toggle, and that toggle deliberately wears the idle
 * treatment in both states (see the note at its call site). A pressed style with
 * nothing to press is a decision copied rather than a value.
 *
 * `SIDEBAR_ICON_TOGGLE_ON` and `SIDEBAR_AVATAR_INSET` belong to the trash
 * drawer and the account tile. Both arrive with their own component.
 */

/**
 * On the rail ALWAYS, open or closed — and the hook every tile style below
 * selects on.
 *
 * A descendant selector rather than props, so widening the rail does not mean
 * editing every tile's call site.
 *
 * THE GEOMETRY HANGS OFF THIS RATHER THAN OFF THE OPEN CLASS, and the reason is
 * the collapse animation. Width transitions over hundreds of milliseconds; a
 * class is added and removed in one frame. So when a tile's layout depended on
 * the open class, collapsing re-centred every glyph INSTANTLY inside a tile that
 * was still at the open width, and each icon flew from the middle back to the
 * edge while the rail caught up. Expanding looked fine because the same race
 * runs the harmless way round.
 *
 * The trick is that leading and centred are the SAME PIXEL at 72px wide:
 * `justify-start` with a 22px inset puts a 28px glyph exactly where centring it
 * did. So a tile can wear one geometry in both states, nothing has to be timed
 * against the transition, and the icons simply never move.
 */
export const RAIL_CLASS = "rail";

/**
 * On the rail only while it is OPEN — a state marker, deliberately not a
 * geometry hook.
 *
 * Nothing below selects on it, and that is the point rather than an oversight:
 * see `RAIL_CLASS`. Anything laid out from this class is laid out against a
 * width that has not finished animating. It stays because the open state is
 * worth naming in the DOM beside `data-rail-expanded`.
 */
export const RAIL_OPEN_CLASS = "rail-open";

/**
 * The two widths as LITERAL Tailwind classes.
 *
 * Tailwind scans source text, so `w-[${RAIL_OPEN_WIDTH_PX}px]` compiles to
 * nothing at all and the rail silently refuses to open — the failure looks like
 * a broken toggle, not like a missing class. These have to be written out.
 *
 * NOTHING GUARDS THEM AGAINST `rail-width.ts` YET. In the source app a unit test
 * asserts these two strings against the same numbers the CSS variable is
 * published from, because they can drift and the symptom is a rail that opens
 * to one width while everything beside it is offset by another. This app has no
 * test runner, so that guard could only be written here as a file nothing runs.
 * It is the first thing to cover when one arrives.
 */
export const RAIL_WIDTH_CLASS = {
  collapsed: "w-[72px]",
  open: "w-[240px]",
} as const;

/**
 * A tile's BOX, which is not the same thing as the shape you see.
 *
 * The box is a full-width square at rail width — that is what keeps the rail's
 * rhythm even and the tiles on one grid. What you actually see is the
 * `::before` layer, inset from that box, so every fill paints as a pill
 * floating inside its square rather than a band running edge to edge.
 *
 * SQUARE ON THE LEFT, ROUNDED ON THE RIGHT. The rail's active state is an
 * indicator bar riding the left boundary, and a fill that rounds AWAY from that
 * edge reads as a free-floating button that happens to sit near a line. Squared
 * on the side the bar marks, the two read as one shape anchored to the rail.
 *
 * ON EVERY TILE, not only the active one, so the pill changes colour on
 * activation rather than changing SHAPE.
 *
 * ON THE RAIL the square becomes a row of the same HEIGHT and the glyph leads
 * rather than centring — unconditionally, in both states. The pill follows the
 * row, which is what makes an expanded item read as one target with its label
 * rather than as an icon with text loose beside it.
 */
export const RAIL_TILE_BASE = [
  "group/rail-item relative flex w-full aspect-square items-center justify-center",
  "transition-all duration-200 focus-visible:outline-none",
  "before:absolute before:inset-2 before:rounded-r-2xl before:transition-colors before:content-['']",
  "focus-visible:before:ring-2 focus-visible:before:ring-zinc-400",
  // Not keyed to the open state — see RAIL_CLASS. 72px is exactly what
  // `aspect-square` already gave at 72px wide.
  "[.rail_&]:aspect-auto [.rail_&]:h-[72px] [.rail_&]:justify-start",
].join(" ");

/**
 * The glyph inside a tile.
 *
 * `relative` is load-bearing: the pill above is an absolutely-positioned
 * pseudo-element, so a statically-positioned glyph would paint UNDER it.
 *
 * THE GLYPH NEVER MOVES — not opening, and not closing. 22px is exactly where
 * centring a 28px glyph in the 72px tile already put it, `(72 - 28) / 2`, so
 * leading it lands on the same pixel and the column of icons stays put while
 * the labels appear beside them.
 */
export const RAIL_GLYPH =
  "relative h-7 w-7 [stroke-width:1.5] transition-colors [.rail_&]:ml-[22px]";

export const RAIL_TILE_IDLE =
  "text-zinc-400 before:bg-zinc-900/40 hover:text-zinc-100 hover:before:bg-zinc-800/80";
