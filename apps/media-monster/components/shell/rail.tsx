"use client";

import React, { useEffect, useSyncExternalStore } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { flushSync } from "react-dom";

import {
  MediaMonsterMark,
  MEDIA_MONSTER_ACCENT,
} from "@/components/brand/media-monster-mark";
import {
  RAIL_COOKIE_MAX_AGE_SECONDS,
  RAIL_EXPANDED_COOKIE,
  railExpandedFromCookies,
} from "@/components/shell/rail-preference";
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
import { cn } from "@/lib/utils";

/**
 * THE RAIL'S FRAME, WITHOUT ITS CONTENTS.
 *
 * Ported from `timeline-sidebar.tsx` in `apps/timeline-gstudio001`, which is
 * 1,385 lines and reaches into the auth provider, the trash drawer, the
 * Firestore documents gateway and the graph's view-event bus. Those attach at
 * four call sites, all in the bottom third of that file, and none of them is
 * reachable from what is here: the lockup, the width preference, the tile
 * treatment and the toggle.
 *
 * SO THIS IS THE RAIL MINUS ITS DESTINATIONS. It has one tile — its own width
 * toggle — and that is not a stub. The rail's job in the source is to answer
 * "where am I", and this app has nowhere to be yet; inventing tiles that lead
 * to nothing would be worse than a rail that honestly has one control. The
 * layout switch, the collection shortcuts, the trash and the account tile each
 * arrive with the thing they point at.
 *
 * What it does carry in full is the WORDMARK and its jump, because that is the
 * part with no dependencies and the part the reserved slot existed for.
 */

/** Survives a reload — a rail that collapsed itself on every navigation would
 *  be a preference in name only. */
const RAIL_EXPANDED_STORAGE_KEY = "mm:rail-expanded";

/** Fires when THIS window toggles the rail — the only notification there is,
 *  see `subscribeRailExpanded`. Without it the toggle would not re-render the
 *  window that pressed it. */
const RAIL_EXPANDED_EVENT = "mm:rail-expanded-changed";

function readRailExpanded(): boolean {
  // The cookie first, because it is what the SERVER rendered from — reading
  // anything else here would be reading a second opinion, and a first client
  // render that disagreed with the markup is a hydration mismatch.
  if (typeof document !== "undefined") {
    const stored = railExpandedFromCookies(document.cookie);
    if (stored !== undefined) return stored;
  }
  // NO COOKIE, WHICH IS NOT THE SAME AS NO PREFERENCE: a browser that refuses
  // cookies makes `writeRailCookie` fail silently, and localStorage is then the
  // only place the toggle landed. The source app also reads this to migrate a
  // rail left open before its cookie existed; that case cannot arise here — this
  // rail has never shipped without the cookie — so the one-load backfill effect
  // that goes with it was left behind.
  try {
    return window.localStorage.getItem(RAIL_EXPANDED_STORAGE_KEY) === "true";
  } catch {
    // Private mode or a blocked origin: the rail still works, it just forgets.
    return false;
  }
}

/** Write the preference where the server can see it. */
function writeRailCookie(next: boolean): void {
  try {
    document.cookie =
      `${RAIL_EXPANDED_COOKIE}=${next}; path=/;` +
      ` max-age=${RAIL_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
  } catch {
    // Cookies blocked: the rail still works for this session, and the next
    // load simply renders the server default again.
  }
}

/**
 * THIS WINDOW ONLY. Deliberately NOT subscribed to `storage`.
 *
 * It was, in the source app, on the reasoning that two tabs should agree about
 * the rail. That is wrong, and the way it was wrong is worth carrying over:
 * `storage` fires in every OTHER tab on the origin, so opening the rail in one
 * window silently collapsed it in every other one. With the width animated, the
 * far window did not read as "something else changed this" — it read as a
 * toggle that stuttered and fell back, because the layout started moving and
 * then went the other way.
 *
 * The rail's width is a property of a WINDOW, not of the account. Two windows
 * side by side are the case where you most want one wide and one narrow.
 * localStorage still carries the preference across a RELOAD, which is the part
 * that was actually wanted; a live window is simply never yanked by another.
 */
function subscribeRailExpanded(onChange: () => void): () => void {
  window.addEventListener(RAIL_EXPANDED_EVENT, onChange);
  return () => {
    window.removeEventListener(RAIL_EXPANDED_EVENT, onChange);
  };
}

function commitRailExpanded(next: boolean): void {
  // The cookie is what the next load renders from; localStorage is kept in step
  // so a downgrade does not lose the preference.
  writeRailCookie(next);
  try {
    window.localStorage.setItem(RAIL_EXPANDED_STORAGE_KEY, String(next));
  } catch {
    // A quota or private-mode failure costs the preference, not the toggle —
    // the event still fires, so the rail still moves for this session.
  }
  window.dispatchEvent(new Event(RAIL_EXPANDED_EVENT));
}

/**
 * THE TWO DIRECTIONS ARE TWO DIFFERENT JUMPS, and each is three settings.
 *
 * They were one for a while in the source app. Unifying them was tempting — the
 * arithmetic worked out and one launch constant explained both — but it meant
 * every correction to one silently rewrote the other.
 *
 * Each direction therefore names its own keyframes, its own clock between them,
 * and its own travel curve. All three have to move together: the arcs are
 * authored against their own clocks and neither survives being given the
 * other's.
 */
type JumpArc = {
  /** The keyframe set that draws the arc. */
  hop: string;
  /** The clock BETWEEN its keyframes — part of the shape, not a finish on it. */
  hopEase: string;
  /** How the ground goes by underneath: the group's own position curve. */
  travel: string;
  /** How long that travel takes. Ends with the hop, or short of it. */
  travelMs: string;
  /** The group's hole-filler: an opaque rect that travels with it, so it helps
   *  only while the creature is on top of it. */
  fill: string;
};

/**
 * CLOSING: shaped, and signed off as-is. Do not retune without being asked.
 *
 * The travel is a `linear()` because three things have to be true at once and
 * no cubic-bezier holds all three — anything slow enough to keep the crouch in
 * place decelerates through the middle and parks the apex over open ground:
 *
 *   17%    3% across   the crouch happens IN PLACE, not while sliding sideways
 *   32%   13% across   paired with the rise, a ~37deg climb out of the ground
 *   58%   82% across   the apex sits near the landing
 *
 * Generated as a monotone cubic through those points and sampled at 19 stops:
 * monotone so the interpolation can never send the creature briefly backwards,
 * 19 so the segments sit below the eye's resolution. Regenerate it rather than
 * hand-editing a stop.
 */
const CLOSING: JumpArc = {
  hop: "sw-monster-hop",
  hopEase: "cubic-bezier(0.34, 0.8, 0.28, 1)",
  travel:
    "linear(0 0%, 0.008508 6%, 0.01694 11%, 0.02907 17%, 0.0522 22%," +
    " 0.09105 28%, 0.1467 33%, 0.2732 39%, 0.4545 44%, 0.6412 50%," +
    " 0.7839 56%, 0.8508 61%, 0.8965 67%, 0.9309 72%, 0.9543 78%," +
    " 0.9693 83%, 0.9804 89%, 0.9898 94%, 1 100%)",
  travelMs: "620ms",
  fill: "rgb(9 9 11) linear-gradient(oklab(0.21 0.00164225 -0.00577088 / 0.5) 0 100%)",
};

/**
 * OPENING: THE CLOSING ARC, FORESHORTENED.
 *
 * Every setting here except the keyframe name is the closing one's, because the
 * two directions want the same SHAPE and differ only in how big that shape
 * reads.
 *
 * It was derived from scratch for several rounds in the source app — ballistic
 * travel, `linear` between stops, gravity sampled from a parabola — and each
 * version fixed the complaint it was aimed at and read wrong overall. Tracing
 * both body centres is what settled it: the closing arc peaks at 80% of its
 * travel and DROPS onto the spot at 38deg, while every from-scratch opening arc
 * peaked near the middle and glided in at around 12deg. That is not a landing,
 * it is an approach, and no amount of retuning a symmetric parabola makes it
 * one.
 *
 * Depth belongs in the SIZE of the arc, which is why only the lift is scaled
 * (see `sw-monster-hop-open`), and it is scaled DOWN because this direction
 * ends about 1.45x further from the reader.
 */
const OPENING: JumpArc = {
  hop: "sw-monster-hop-open",
  hopEase: CLOSING.hopEase,
  travel: CLOSING.travel,
  travelMs: CLOSING.travelMs,
  // NO FILLER. It is an opaque rectangle that travels with the group, and this
  // direction crosses the wordmark as the letters are revealing, so instead of
  // hiding a hole it would blank them.
  fill: "transparent",
};

/**
 * Toggle the rail INSIDE a view transition, so the monster can jump between its
 * two homes rather than teleport.
 *
 * The creature's two positions are genuinely different DOM layouts — inline in
 * "m…nster" when open, alone and larger when closed — so nothing about the
 * change is animatable by ordinary means: the element does not move, it is
 * re-laid-out. A view transition snapshots both states and gives the browser
 * something to interpolate between, and `media-monster-motion.css` styles that
 * interpolation as a hop (see the `sw-monster-*` keyframes).
 *
 * `flushSync` is not optional. `startViewTransition` captures the "after" state
 * when its callback returns, and the callback here only dispatches an event —
 * React's re-render would land after the capture, so the transition would
 * animate from a state to itself.
 *
 * Falls back to a plain commit where the API is missing or the reader asked for
 * less motion; the rail still moves, it just cuts.
 */
function writeRailExpanded(next: boolean): void {
  const doc = document as Document & {
    startViewTransition?: (callback: () => void) => unknown;
  };
  const reduced =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  if (typeof doc.startViewTransition !== "function" || reduced) {
    commitRailExpanded(next);
    return;
  }

  // WHICH WAY IT IS GOING, for the lean. Opening, the creature travels RIGHT —
  // out of the collapsed rail's centre and into the middle of the word. Closing,
  // it travels left. The keyframes multiply their rotation and drift by this, so
  // the body leans into the direction of the jump instead of always tipping the
  // same way. A creature that leans the wrong way reads as being blown sideways
  // rather than as choosing to go.
  document.documentElement.style.setProperty("--sw-hop-dir", next ? "1" : "-1");

  // WHICH JUMP THIS IS. Five properties, set together, because the arc is all
  // of them: see `CLOSING` and `OPENING`.
  const arc = next ? OPENING : CLOSING;
  const root = document.documentElement.style;
  root.setProperty("--sw-hop-name", arc.hop);
  root.setProperty("--sw-hop-ease", arc.hopEase);
  root.setProperty("--sw-group-ease", arc.travel);
  root.setProperty("--sw-group-ms", arc.travelMs);
  root.setProperty("--sw-group-fill", arc.fill);

  // AIM THE EYE BEFORE THE BODY GOES. Both snapshots are captured with this
  // attribute set — the pose it leaves from and the pose it lands in — so the
  // pupil points along the arc for the WHOLE flight rather than only reacting
  // once it is over. That ordering is the whole effect: an eye that moves first
  // reads as a creature deciding to jump, and an eye that only moves on landing
  // reads as one that was thrown.
  //
  // It has to be an attribute set here rather than a keyframe in the hop,
  // because mid-flight the creature is a rasterised image and nothing inside it
  // can move. A pose can still be captured INTO that image; motion cannot.
  const mark = document.querySelector("[data-media-monster]");
  mark?.setAttribute("data-aiming", "");

  // OPT INTO THE TRANSITION, and only this one. The `view-transition-name` that
  // makes the creature a snapshot lives in the stylesheet behind these two
  // attributes rather than inline on the element, because a name is not scoped
  // to the transition you meant — it applies to every one the document runs.
  // Named for its whole life, the creature would play its entire jump whenever
  // any unrelated transition started, under an opaque hole-filler, and then
  // vanish when that transition finished. This app runs no others yet; the
  // attributes are how it stays that way once it does.
  //
  // Set BEFORE `startViewTransition`, because the old state is captured the
  // moment it is called, and held until `finished`, which covers the new
  // capture too. Cleared on every exit below, next to the aim.
  mark?.setAttribute("data-hopping", "");
  document.documentElement.dataset.swHop = "";

  const transition = doc.startViewTransition(() => {
    flushSync(() => commitRailExpanded(next));
    // THE SECOND POSE, and the reason there is one at all. The browser captures
    // the OLD state before this callback runs and the NEW state after it
    // returns, so anything set here lands in the arrival snapshot and not the
    // departure one. That is the only lever that makes a part of the creature
    // LOOK like it moved during a transition that freezes it: photograph the
    // same element twice, in two poses, and hand over between the images.
    //
    // Today it is the feet — they leave angled off the toe and arrive flat, so
    // the toe-off reads as a launch gesture rather than a permanent point.
    mark?.setAttribute("data-landing", "");
  }) as { finished?: Promise<unknown> };

  // LEAVING THE TRANSITION, on every path out. Dropping these late is not a
  // cosmetic slip: while `data-hopping` is on, the creature is still a named
  // participant, so the NEXT transition anyone starts snapshots it and replays
  // the jump. That is the bug this pair exists to prevent, so it must not
  // survive the flight that set it.
  const leaveTransition = () => {
    mark?.removeAttribute("data-hopping");
    delete document.documentElement.dataset.swHop;
  };

  const finished = transition.finished;
  if (!finished) {
    // Nothing to hang the settle off. Drop the aim on a timer regardless — a
    // pupil left staring sideways is worse than no flourish at all.
    window.setTimeout(() => {
      mark?.removeAttribute("data-aiming");
      mark?.removeAttribute("data-landing");
      leaveTransition();
    }, 620);
    return;
  }

  void finished
    .then(() => {
      if (!mark) return;
      // THE SETTLE, once the flight is over. The eye and the feet cannot move
      // during the transition — the creature is a rasterised snapshot then, not
      // elements — so the parts that should still be moving when the body stops
      // are handed back to the live element here.
      //
      // Swapped in ONE frame, and the settle's first pose is the aim, so the
      // pupil is never briefly re-centred between the two: the handover from
      // captured image to live element is invisible.
      mark.removeAttribute("data-aiming");
      mark.removeAttribute("data-landing");
      leaveTransition();
      mark.setAttribute("data-settling", "");
      // Outlasts the longest part, which is the PUPIL: it waits for the eye to
      // finish moving (460ms) and then constricts over 800ms, so it is still
      // going 620ms after the hat has stopped. Pulling the attribute early does
      // not shorten the flourish, it truncates it — at 620ms the hat's final
      // bounce was cut mid-air, and anything under 1260 snaps the last of the
      // dilation off in one frame.
      window.setTimeout(() => mark.removeAttribute("data-settling"), 1360);
    })
    .catch(() => {
      // A transition skipped or superseded by a faster second click. The rail
      // still moved; only the flourish is lost — but the aim must come off, or
      // the eye is left pointing at a jump that never happened.
      mark?.removeAttribute("data-aiming");
      mark?.removeAttribute("data-landing");
      leaveTransition();
    });
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

/**
 * Letters that grow from nothing to their natural width, and back.
 *
 * A GRID, not a `max-width`, and the difference is the whole reason this looks
 * right. Text has no width you can name in advance, so a max-width transition
 * has to guess a number bigger than the word — and then the visible growth
 * finishes early, at the word's real width, while the property keeps animating.
 * The letters appear to arrive and then wait. `0fr` to `1fr` animates to exactly
 * the content's own size, so the letters part at the speed the word needs.
 *
 * `overflow-hidden` on the inner span is what does the hiding; the outer grid
 * only owns the width.
 *
 * LIGHTER THAN THE MARK, in ink. The link is `font-bold` and the creature is the
 * thing that survives the collapse; the letters that grow out of it are the
 * word, so they sit at 90% opacity. Not animated, so a collapsing group stays
 * light the whole way in.
 */
function RevealedLetters({
  show,
  children,
}: Readonly<{ show: boolean; children: React.ReactNode }>) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        // THE TWO DIRECTIONS DO DIFFERENT THINGS, so the pacing lives on the
        // branch rather than above it.
        //
        // OPENING, THE WORD CARRIES THE CREATURE. It used to trail the launch by
        // a beat and finish in 420ms against a jump that lands at 680, so the
        // gap the creature was aiming for arrived first and sat waiting while
        // the creature caught up. Matching the group's own travel — same curve,
        // same 680ms, no delay — makes the creature sit IN the "o" slot the
        // whole way across instead of merely ending up there.
        //
        // It works out exactly, which is worth writing down because it looks
        // like a coincidence. The creature's group interpolates its box from
        // x=22 (alone in the rail) to x=153 (inside the word), so its position
        // is 22 + 131p. The slot's left edge is 22 plus the revealed width of
        // "media " and "m", and that width is 131 when fully revealed — so the
        // slot is 22 + 131q. Same form: give p and q the same curve and the two
        // are the same number at every instant.
        //
        // CLOSING IS STILL OVERLAPPING ACTION, and deliberately unchanged: the
        // word goes FIRST and quickly, clearing the space before the creature
        // jumps back into it. Loose parts lag the thing driving them, and which
        // part is loose depends on which way the motion runs.
        "grid transition-[grid-template-columns] motion-reduce:transition-none",
        show
          ? "delay-0 duration-[680ms] ease-[cubic-bezier(0.42,0.3,0.58,0.58)]"
          : "delay-0 duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
        show ? "grid-cols-[1fr]" : "grid-cols-[0fr]",
      )}
    >
      {/* NO WEIGHT of its own. Grandstander has real weights and the lockup's is
          picked once where the font is loaded (700). A utility here would
          override that for the letters only, and the wordmark would stop
          matching its own mark. */}
      <span className="overflow-hidden opacity-90">{children}</span>
    </span>
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
        <Link
          href="/"
          aria-label="Media Monster home"
          // LEADING, at the glyph column's inset, in both states. Centring the
          // mark in the 72px rail already put it within a pixel of 22px, so
          // pinning it there costs nothing closed and is what lets the name grow
          // to the right rather than the whole mark sliding.
          className="flex h-[72px] w-full items-center justify-start overflow-hidden whitespace-nowrap pl-[22px] font-[family-name:var(--font-grandstander)] font-bold text-[21px] text-white transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-500"
        >
          {/* THE CREATURE NEVER LEAVES. The letters around it collapse to
              nothing, so closing contracts the word onto the one thing that
              stays — same size, same font, same position throughout — which is
              why this reads as the mark contracting rather than a label being
              swapped for an abbreviation.

              HIDDEN FROM ASSISTIVE TECH. The word is split into spans so it can
              be revealed a piece at a time, and exposed spans like that risk
              being read out one fragment at a time. The `aria-label` on the link
              carries the whole name instead.

              THE TWO NAMES AGREE. A visible name not contained in the accessible
              one is `label-content-name-mismatch` (WCAG 2.5.3 "Label in Name"):
              someone driving by voice says what they see and matches nothing.
              With the label reading "Media Monster home" over a mark that reads
              "media monster", what you say is what is there.

              `display: contents` so hiding them costs no layout — the letters
              keep participating in the link's own flex box. */}
          <span aria-hidden="true" className="contents">
            <RevealedLetters show={railExpanded}>media&nbsp;</RevealedLetters>
            {/* The creature takes the monogram's place: it is what survives the
                collapse. The word rebuilds around it — "m" before, "nster"
                after — so opening the rail grows the name out of the mark rather
                than swapping one thing for another.

                `contents`, so "m", the creature and "nster" stay FLEX ITEMS of
                the link rather than becoming one narrow item that wraps inside
                itself. Colour still inherits through a `display: contents`
                box. */}
            <span className="contents" style={{ color: MEDIA_MONSTER_ACCENT }}>
              <RevealedLetters show={railExpanded}>m</RevealedLetters>
              {/* SMALL IN THE WORD, BIG ALONE. Expanded it is the source's own
                  proportion, which is what makes it read as the "o" of "monster"
                  rather than a creature parked beside it. Collapsed there is no
                  word left to belong to, so it grows into the mark the rail
                  needs — and past the 19px floor the design document measured,
                  below which the fur spikes and the glint start to merge.

                  0.97 IN THE WORD, and the number comes from the letters rather
                  than from taste. Measured against Grandstander at 21px the
                  x-height is 13px, and at 1.1 the creature's body drew 16.3 —
                  1.254x the letter it is standing in for, which is why it read
                  as parked beside the word rather than set into it. 0.97 puts
                  the body at about 1.1x the x-height: still the largest thing in
                  the lockup, because it is a face and it has to hold the eye,
                  but close enough to the "o" to belong to the same alphabet. The
                  antennae above and the feet below stay outside that band on
                  purpose — an ascender and a descender are what a letter is
                  allowed to have. */}
              <MediaMonsterMark
                scale={railExpanded ? 0.97 : 1.6}
                gaze={railExpanded ? "ahead" : "breadcrumb"}
              />
              <RevealedLetters show={railExpanded}>nster</RevealedLetters>
            </span>
          </span>
        </Link>

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
            onClick={() => writeRailExpanded(!railExpanded)}
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
