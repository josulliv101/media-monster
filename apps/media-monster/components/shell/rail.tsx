"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Menu, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
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
import {
  MediaMonsterMark,
  MEDIA_MONSTER_ACCENT,
} from "@/components/brand/media-monster-mark";
import { SettingsDialog } from "@/components/settings/settings-dialog";
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
 * SO THIS IS THE RAIL MINUS ITS DESTINATIONS. It has two tiles — settings and
 * its own width toggle — and that is not a stub. The rail's job in the source is to answer
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
 * THE NARROW-SCREEN BREAKPOINT, read as a store rather than in an effect.
 *
 * Matches Tailwind's `md`, so the class variants below and this hook cannot
 * disagree about where the rail stops being a column and becomes a drawer.
 *
 * `useSyncExternalStore` for the reason the rail's own preference uses one: a
 * `useState` corrected by a mount effect is a cascading render, and it paints
 * the wrong thing first. The SERVER snapshot is `false` — a server has no
 * viewport, and the drawer is off-screen until it is opened, so a narrow phone
 * correcting this on hydration moves nothing anybody can see.
 */
const NARROW = "(max-width: 767px)";

function subscribeNarrow(onChange: () => void): () => void {
  const query = window.matchMedia(NARROW);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readNarrow(): boolean {
  return window.matchMedia(NARROW).matches;
}

/**
 * The controls in `root` a Tab can land on, in order. Anything without a box is
 * left out: the width toggle is `max-md:hidden` in the drawer, and a trap that
 * wrapped to it would send focus nowhere.
 */
function tabStops(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ),
  ).filter((element) => element.getClientRects().length > 0);
}

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
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useRef<HTMLDialogElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const narrow = useSyncExternalStore(subscribeNarrow, readNarrow, () => false);
  // THE DRAWER, on narrow screens only. There is no room for a permanent column
  // beside the board on a phone, so the rail slides in over it from a button in
  // the top bar. Closed on every load: a drawer that opened itself would cover
  // the thing it was opened to navigate to.
  const [drawerOpen, setDrawerOpen] = useState(false);
  // A WIDENED WINDOW IS NOT AN OPEN DRAWER. Left set, the flag would keep the
  // scroll lock alive behind a rail that is a column again, and re-open the
  // drawer if the window narrowed later. Cleared DURING RENDER, React's pattern
  // for state that follows a changed input — in an effect it is a cascading
  // render, which the React Compiler's lint refuses outright.
  if (!narrow && drawerOpen) setDrawerOpen(false);

  const openSettings = () => {
    setSettingsOpen(true);
    settingsRef.current?.showModal();
  };

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

  // The drawer is the only thing wide enough to caption its tiles, so it always
  // shows labels; the column follows the width preference.
  const labelsInline = narrow ? true : railExpanded;

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

  // ESCAPE CLOSES THE DRAWER, and the board behind it does not scroll while it
  // is open — both are what makes an overlay feel like one surface rather than
  // two stacked ones. Bound only while it is open, so nothing listens for a key
  // it cannot act on.
  //
  // THE LOCK IS A CLASS, NOT `body.style.overflow`, and the stylesheet gates it
  // on the same breakpoint as the drawer (see `globals.css`). CSS re-evaluates
  // a media query whatever JavaScript believes, so a window widened while the
  // drawer is open cannot leave the page unscrollable behind a rail that is a
  // column again — the one failure here that would strand somebody.
  //
  // TAB STAYS IN THE OPEN DRAWER. It covers the board, and the backdrop takes
  // every tap behind it, but Tab walked straight off its last control onto the
  // board underneath — focus on cards nobody could see or press. So Tab from
  // the last control wraps to the first and Shift+Tab from the first to the
  // last, the way a modal dialog behaves; focus found outside (a click on the
  // backdrop's edge, a stray programmatic focus) is brought back in. Settings,
  // opened from inside the drawer, is a native modal `<dialog>` with its own
  // containment, so a Tab inside it is left alone.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const drawer = railRef.current;
      if (drawer === null) return;
      if (event.target instanceof Element && event.target.closest("dialog[open]") !== null) {
        return;
      }
      const stops = tabStops(drawer);
      const first = stops[0];
      const last = stops.at(-1);
      if (first === undefined || last === undefined) return;
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !drawer.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.documentElement.classList.add("rail-drawer-open");
    // FOCUS GOES IN WITH IT, and back to the menu button when it closes. The
    // closed drawer is `inert` (see the aside), so focus left inside it as it
    // shuts is dropped on the body — a keyboard user would start again from
    // the top of the page instead of where they were.
    railRef.current
      ?.querySelector<HTMLElement>("a[href], button:not([disabled])")
      ?.focus();
    const opener = menuButtonRef.current;
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.documentElement.classList.remove("rail-drawer-open");
      // Not when the window widened instead: the rail is a column again and
      // the menu button is `md:hidden`, so there is nothing to return to.
      if (window.matchMedia(NARROW).matches) opener?.focus();
    };
  }, [drawerOpen]);

  // No `useCallback`: the React Compiler memoizes this (see next.config.ts).
  const toggleRail = () => {
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
  };

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
    <RailLabelsInlineContext.Provider value={labelsInline}>
      <aside
        ref={railRef}
        id="rail"
        data-rail-expanded={railExpanded}
        // THE CLOSED DRAWER IS OUT OF REACH, not merely out of sight. It is
        // parked off-screen by a transform, and a transform moves nothing out
        // of the tab order or the accessibility tree: Shift+Tab from "Open
        // menu" landed on Settings at x = -240..-1 (measured, 390px wide), a
        // focus ring nobody could see on a control that looked closed. `inert`
        // takes the whole subtree out of both. Only on a narrow screen: the
        // column is always on screen, so it is never inert.
        inert={narrow && !drawerOpen}
        // OPEN, it is a modal: the same containment the Tab trap gives the
        // keyboard, told to assistive technology, which otherwise reads on
        // into the board behind it. A column, it stays a plain `aside`.
        role={narrow && drawerOpen ? "dialog" : undefined}
        aria-modal={narrow && drawerOpen ? true : undefined}
        aria-label={narrow && drawerOpen ? "Menu" : undefined}
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
          // NARROW: out of the flow entirely and parked off the left edge, so
          // `main` gets the whole width and the drawer slides over it. `fixed`
          // rather than `sticky`, because a sticky element still takes its slot
          // in the flex row and would hold a 72px gutter open on a phone.
          // The DRAWER SLIDES, it does not grow: `transition-[width]` below is
          // the column's move between 72px and 240px, and on a phone the rail
          // is one width and travels instead. Animating width here would also
          // leave it at the pre-transition width for anything that measures
          // before the animation runs.
          "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:h-dvh max-md:shadow-2xl max-md:transition-transform",
          narrow
            ? drawerOpen
              ? "max-md:translate-x-0"
              : "max-md:-translate-x-full"
            : null,
          // Width alone is animated. `transition-all` here would also catch the
          // backdrop filter, which is expensive to interpolate over a sticky
          // full-height surface.
          "transition-[width] motion-reduce:transition-none",
          // OPENING AND CLOSING ARE NOT THE SAME MOVE, so the pacing lives on
          // the state rather than here. A transition reads its duration and
          // easing from the AFTER-change style, so whichever branch below is
          // being switched TO is the one that times the move — which is what
          // makes this direction-aware without a line of JavaScript.
          // The drawer is always at the open width: it is covering the board
          // either way, so a 72px strip of icons would be smaller for no gain.
          narrow
            ? `${RAIL_WIDTH_CLASS.open} ${RAIL_OPEN_CLASS} max-md:duration-200 max-md:ease-out`
            : railExpanded
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
        <RailWordmark expanded={labelsInline} />

        {/* THE RAIL'S OWN WIDTH CONTROL, beneath settings.

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
          {/* SETTINGS, above the width toggle: both are about the app rather
              than the work, so they share the floor group. Idle treatment, as
              the toggle wears — opening a dialog is not a mode. */}
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            aria-label="Settings"
            aria-describedby="rail-tooltip-settings"
            data-rail-settings
            onClick={openSettings}
            className={cn(RAIL_TILE_BASE, RAIL_TILE_IDLE)}
          >
            <Settings className={RAIL_GLYPH} />
            <RailTooltipLabel
              id="rail-tooltip-settings"
              label="Settings"
              description="Film strip size and other preferences"
            />
          </button>
          <button
            type="button"
            aria-expanded={railExpanded}
            aria-label={railExpanded ? "Collapse sidebar" : "Expand sidebar"}
            aria-describedby="rail-tooltip-width"
            data-rail-toggle={railExpanded ? "expanded" : "collapsed"}
            onClick={toggleRail}
            // Not on a phone: the drawer has one width, and a control that
            // preferred a narrower one would do nothing you could see.
            className={cn(RAIL_TILE_BASE, RAIL_TILE_IDLE, "max-md:hidden")}
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

      {/* THE TOP BAR, narrow screens only: what opens the drawer, and where the
          creature lives while the rail is off-screen. There IS room for it —
          the lockup is ~150px of a 360px bar — and it is the one piece of the
          rail worth keeping in sight, so the app still looks like itself with
          the rail away. */}
      <header data-mobile-top-bar className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-2 border-b border-zinc-800 bg-zinc-950/90 px-3 backdrop-blur-md md:hidden">
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          aria-controls="rail"
          data-rail-menu
          ref={menuButtonRef}
          onClick={() => setDrawerOpen(true)}
          className="rounded-md p-2 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-500"
        >
          <Menu className="size-5" />
        </button>
        {/* The rail's lockup, STATIC. `RailWordmark` is the animated one: its
            letters grow out of the creature as the rail opens, against a 72px
            row. Nothing here opens or closes, so the word is simply written. */}
        <Link
          href="/"
          aria-label="Media Monster home"
          className="flex items-center font-[family-name:var(--font-grandstander)] text-[17px] font-bold whitespace-nowrap text-white transition-colors hover:text-zinc-300"
        >
          {/* "media" in ink, "monster" in the accent, the same split the rail's
              lockup makes: the creature is the "o" of the blue word. */}
          <span>media&nbsp;</span>
          <span className="flex items-center" style={{ color: MEDIA_MONSTER_ACCENT }}>
            m
            <MediaMonsterMark scale={0.97} />
            nster
          </span>
        </Link>
      </header>

      {/* The board behind the open drawer. Closes it, and takes the taps that
          would otherwise land on cards under the overlay. */}
      {drawerOpen ? (
        <div
          data-rail-backdrop
          aria-hidden="true"
          onClick={() => setDrawerOpen(false)}
          // `md:hidden` rather than a `narrow &&` in the condition: the
          // breakpoint belongs to CSS, which cannot be out of date.
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px] md:hidden"
        />
      ) : null}

      {/* Outside the aside: the rail is sticky and z-50, and a modal opened
          with showModal() is in the top layer anyway, but keeping it out of
          the rail's subtree keeps the rail's click handling off it. */}
      <SettingsDialog
        dialogRef={settingsRef}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </RailLabelsInlineContext.Provider>
  );
}
