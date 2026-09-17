"use client";

import React, { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { flushSync } from "react-dom";

import { runRailJump } from "@/components/shell/rail-jump";
import {
  commitRailExpanded,
  readRailExpanded,
  subscribeRailExpanded,
} from "@/components/shell/rail-preference-store";
import {
  RAIL_CLASS,
  RAIL_GLYPH,
  RAIL_OPEN_CLASS,
  RAIL_TILE_BASE,
  RAIL_TILE_IDLE,
  RAIL_WIDTH_CLASS,
} from "@/components/shell/rail-tile-styles";
import {
  RAIL_OPEN_WIDTH_PX,
  RAIL_WIDTH_PX,
  RAIL_WIDTH_VAR,
} from "@/components/shell/rail-width";
import {
  RailLabelsInlineContext,
  RailTooltipLabel,
} from "@/components/shell/rail-tooltip-label";
import { RailWordmark } from "@/components/shell/rail-wordmark";
import { cn } from "@/lib/utils";

/**
 * THE RAIL'S FRAME, WITHOUT ITS CONTENTS.
 *
 * Ported from `timeline-sidebar.tsx` in `apps/timeline-gstudio001`, which is
 * 1,385 lines and reaches into the auth provider, the trash drawer, the
 * Firestore documents gateway and the graph's view-event bus. Those attach at
 * four call sites, all in the bottom third of that file, and none of them is
 * reachable from what is here.
 *
 * SO THIS IS THE RAIL MINUS ITS DESTINATIONS. It has one tile — its own width
 * toggle — and that is not a stub. The rail's job in the source is to answer
 * "where am I", and this app has nowhere to be yet; inventing tiles that lead to
 * nothing would be worse than a rail that honestly has one control. The layout
 * switch, the collection shortcuts, the trash and the account tile each arrive
 * with the thing they point at.
 *
 * The parts that are not the frame live beside it: `rail-wordmark.tsx` draws the
 * lockup, `rail-jump.ts` choreographs the creature's flight, and
 * `rail-preference-store.ts` owns the cookie and localStorage.
 */

/**
 * After a POINTER press on a rail tile, keep that tile's tooltip shut until the
 * pointer LEAVES AND COMES BACK.
 *
 * Clicking a tile leaves the pointer sitting on it, so its tooltip faded up the
 * moment the thing you pressed finished happening — captioning a control you are
 * still touching and have just used.
 *
 * CLEARED ON RE-ENTRY, not on leaving, and the difference is the whole fix.
 * Pressing the collapse toggle by its LABEL puts the pointer ~150px out, and the
 * rail then shrinks to 72px — so the tile is pulled out from under a pointer
 * that never moved. That fires `pointerleave`, which cleared the flag, while
 * `:hover` stayed stale-true (browsers recompute hover on pointer movement, not
 * on layout). Flag off plus hover still on is exactly the flash: a tooltip for a
 * control that had just slid away. Waiting for `pointerenter` cannot be tricked
 * by geometry moving, because nothing enters an element the pointer never left.
 *
 * Delegated on the rail rather than added to each call site, and the flag is a
 * DOM attribute rather than React state: it must not re-render the rail, and
 * nothing else needs to know.
 *
 * `detail > 0` keeps this to real pointer presses. A keyboard Enter also fires
 * click with no pointer anywhere near the tile, so no `pointerenter` would ever
 * arrive to clear the flag and that tile would go quiet for good.
 */
function suppressTipUntilPointerReturns(
  event: React.MouseEvent<HTMLElement>,
): void {
  if (event.detail === 0) return;
  const tile = (event.target as HTMLElement | null)?.closest("button, a");
  if (!(tile instanceof HTMLElement)) return;
  tile.dataset.tipSuppressed = "";
  tile.addEventListener(
    "pointerenter",
    () => {
      delete tile.dataset.tipSuppressed;
    },
    { once: true },
  );
}

export function Rail({
  initialRailExpanded = false,
}: Readonly<{
  /**
   * What the SERVER rendered the rail as, read from the cookie in the root
   * layout.
   *
   * Defaulted rather than required so a story or a test can mount the rail
   * without one, and `false` is the honest default: no cookie means nobody has
   * ever toggled it, which is the collapsed rail.
   */
  initialRailExpanded?: boolean;
}> = {}) {
  const railRef = useRef<HTMLElement>(null);

  // Read through an EXTERNAL STORE rather than an effect. The naive shape — a
  // `useState(false)` corrected by a mount effect — is a synchronous setState
  // inside an effect, which lints as a cascading render and is a real one: the
  // rail paints collapsed and then jumps. `useSyncExternalStore` reads the
  // stored value during the first client render instead.
  //
  // ITS SERVER SNAPSHOT IS WHAT THE SERVER ACTUALLY RENDERED, not a hard-coded
  // `false`. That constant was the whole of the source app's #471: the
  // preference lived only in `localStorage`, so every load painted the rail
  // collapsed and widened it on hydration — an 188px shove of everything beside
  // it, and 0.135 of a 0.16 cumulative layout shift on its own. The cookie is
  // what makes a correct first paint possible; passing it in here is what makes
  // the first paint AGREE with it.
  const railExpanded = useSyncExternalStore(
    subscribeRailExpanded,
    readRailExpanded,
    () => initialRailExpanded,
  );

  useEffect(() => {
    // The offset every surface beside the rail reads. Written on the document
    // rather than the aside because those surfaces are its SIBLINGS, not its
    // descendants — a variable set here would not inherit to them.
    //
    // The LAYOUT sets this too, from the same cookie, so it is already correct
    // in the server's markup and nothing beside the rail moves on hydration.
    // This effect is what keeps it correct AFTER a toggle, which the server will
    // not hear about until the next request.
    document.documentElement.style.setProperty(
      RAIL_WIDTH_VAR,
      `${railExpanded ? RAIL_OPEN_WIDTH_PX : RAIL_WIDTH_PX}px`,
    );
  }, [railExpanded]);

  const toggleRail = useCallback(() => {
    // THE RAIL'S OWN CREATURE, found inside the rail. A document-wide query
    // returns whichever mark is first in the DOM, and the placeholder page
    // renders a second one — so it was right by layout order rather than by
    // construction. See the note on `runRailJump`.
    const mark = railRef.current?.querySelector("[data-media-monster]") ?? null;
    // `flushSync` is not optional. The browser captures the transition's "after"
    // state when its callback returns, and the commit only dispatches an event —
    // React's re-render would land after the capture, so the transition would
    // animate from a state to itself.
    runRailJump(!railExpanded, mark, (next) =>
      flushSync(() => commitRailExpanded(next)),
    );
  }, [railExpanded]);

  // z-50, not z-40: the aside is sticky, so it IS a stacking context and every
  // child z-index — the fly-out tooltips' z-50 included — is trapped inside it.
  // Anything that later sits at z-40 later in the DOM would paint over those
  // tooltips at equal z, so the whole column has to outrank it. Nothing overlaps
  // the 72px rail itself, so raising it hides nothing.
  return (
    // The provider is what turns each tile's tooltip into a permanent label.
    // Geometry is done with descendant variants off `RAIL_CLASS` so the tile
    // call sites stay untouched; this carries the ONE thing CSS cannot — that an
    // always-visible label is not a `role="tooltip"`.
    <RailLabelsInlineContext.Provider value={railExpanded}>
      <aside
        ref={railRef}
        data-rail-expanded={railExpanded}
        onClickCapture={suppressTipUntilPointerReturns}
        // No horizontal padding and `items-stretch`: the tiles ARE the rail's
        // width, which is what makes them full-width squares. Vertical padding
        // stays — it separates the rail's contents from the screen edges, which
        // the side padding was not doing for the tiles.
        //
        // OPEN, only the WIDTH changes. Every tile keeps its 72px height and its
        // glyph keeps its x — see RAIL_CLASS — so this reads as labels arriving
        // rather than as a different rail redrawing itself.
        className={cn(
          // Unconditional: it carries the tile geometry, which must NOT change
          // when the width does. See the note on RAIL_CLASS.
          RAIL_CLASS,
          "sticky top-0 z-50 flex h-screen shrink-0 flex-col items-stretch gap-0 overflow-visible border-r border-zinc-800 bg-zinc-900/50 pt-1.5 pb-5 backdrop-blur-md",
          // Width alone is animated. `transition-all` here would also catch the
          // backdrop filter, which is expensive to interpolate over a sticky
          // full-height surface.
          "transition-[width] motion-reduce:transition-none",
          // OPENING AND CLOSING ARE NOT THE SAME MOVE, so the pacing lives on
          // the state rather than here. A transition reads its duration and
          // easing from the AFTER-change style, so whichever branch below is
          // being switched TO is the one that times the move — which is what
          // makes this direction-aware without a line of JavaScript.
          railExpanded
            ? // OPENING: the rail arrives exactly as the creature lands, because
              // it travels on the creature's own profile.
              //
              // It was 440ms of easeOutQuint, which is 99% done by 287ms against
              // a jump that does not touch down until 680 — the rail was parked
              // and waiting for most of the flight. MATCHING THE DURATION ALONE
              // WOULD NOT HAVE FIXED IT: stretched to 680ms that curve still
              // LOOKS finished at 443ms, because an ease-out spends its last 1%
              // over a third of its time. So it takes the same near-linear
              // travel the hop's group uses, which is 99% done at 670ms — the
              // rail and the creature come to rest together rather than merely
              // stopping at the same instant.
              `${RAIL_WIDTH_CLASS.open} ${RAIL_OPEN_CLASS} duration-[680ms] ease-[cubic-bezier(0.42,0.3,0.58,0.72)]`
            : // CLOSING: an early creep, then commit.
              //
              // It used to close on the opening curve, and that curve is
              // easeOutQuint — 62px of the 168px travel gone in the FIRST 40ms
              // and 79% shut by 120ms. The rail was always going to beat the
              // creature to a standstill, because it did most of its move before
              // the creature had finished crouching.
              //
              // Measured against the hop's own beats, this one is 2% closed at
              // the crouch (116ms), 9% at the push-off (218ms), 71% at the apex
              // (394ms) and 100% at contact (680ms). The rail closes WITH the
              // jump instead of ahead of it, and the slow start is what buys
              // that: the creature gets the first fifth of a second to itself.
              //
              // THE FIRST VERSION OF THIS RAMP WAS TOO DEAD. At
              // (0.8, 0, 0.3, 1) the rail was 0% closed at 60ms and 7% at 200ms
              // — a hold, not a ramp, and a control that visibly does nothing
              // for a fifth of a second reads as one that missed the click. This
              // one creeps: 1% at 60ms, 5% at 120ms, 16% at 200ms.
              `${RAIL_WIDTH_CLASS.collapsed} duration-[680ms] ease-[cubic-bezier(0.6,0.04,0.3,1)]`,
        )}
      >
        <RailWordmark expanded={railExpanded} />

        {/* THE RAIL'S OWN WIDTH CONTROL, and for now the only tile.

            Pinned to the floor by `mt-auto`, which is where the source app puts
            it: it is the one control about the RAIL rather than about the work,
            the same place an IDE puts it. In the source it sits under the trash
            and above the account tile, and those still bracket it when they
            arrive — this group is the floor group, not a group of one.

            It wears the idle treatment in BOTH states, alone among that app's
            toggles. An active tint there means "this changes what the board
            shows"; the rail's own width changes nothing about the work, and
            lighting it up would leave a permanent accent in the rail for a
            preference you can already see in the rail's width. The glyph
            flipping direction is the state readout. */}
        <div className="relative mt-auto flex w-full flex-col items-stretch gap-0">
          <button
            type="button"
            aria-expanded={railExpanded}
            aria-label={railExpanded ? "Collapse sidebar" : "Expand sidebar"}
            aria-describedby="rail-tooltip-width"
            data-rail-toggle={railExpanded ? "expanded" : "collapsed"}
            onClick={toggleRail}
            className={cn(RAIL_TILE_BASE, RAIL_TILE_IDLE)}
          >
            {railExpanded ? (
              <PanelLeftClose className={RAIL_GLYPH} />
            ) : (
              <PanelLeftOpen className={RAIL_GLYPH} />
            )}
            <RailTooltipLabel
              id="rail-tooltip-width"
              label={railExpanded ? "Collapse" : "Expand"}
              description="Show the name beside each icon"
            />
          </button>
        </div>
      </aside>
    </RailLabelsInlineContext.Provider>
  );
}
