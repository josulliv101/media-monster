/**
 * The creature's jump between its two homes, and the view transition that
 * carries it.
 *
 * Split from `rail.tsx`, which is now the rail's markup. Everything here is
 * choreography: two arcs, the attributes the stylesheet animates off, and the
 * lifecycle that puts them on and takes them off again. It knows nothing about
 * where the preference is stored — the caller hands it a `commit`.
 *
 * The keyframes themselves are in `app/media-monster-motion.css`.
 */

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
 * How long to wait for a transition that has not started before giving up on it.
 *
 * COMFORTABLY LONGER THAN THE JUMP, which is 680ms. This is not a deadline on
 * the animation — a transition that is merely slow must be allowed to finish —
 * it is the point past which one has demonstrably never begun. See
 * `runRailJump` for what it guards against.
 */
const JUMP_WATCHDOG_MS = 1500;

/** Every attribute the jump stamps, and the only place the list is written. */
function leaveJump(mark: Element | null): void {
  mark?.removeAttribute("data-aiming");
  mark?.removeAttribute("data-landing");
  mark?.removeAttribute("data-hopping");
  delete document.documentElement.dataset.swHop;
}

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
 * `commit` is not optional and is not a callback in the ordinary sense: it is
 * what CHANGES the rail, and it has to run inside the transition's own callback
 * and synchronously. `startViewTransition` captures the "after" state when that
 * callback returns, so a React re-render landing later would make the browser
 * animate from a state to itself. The caller wraps it in `flushSync`.
 *
 * `mark` is the creature to animate, and it is PASSED IN rather than looked up.
 * This used to be `document.querySelector("[data-media-monster]")`, which is the
 * first mark in the document and only happens to be the rail's: the placeholder
 * page renders a second one, so the query was correct by DOM order rather than
 * by construction. Reorder the layout and the toggle would have animated the
 * page's creature while the rail's teleported.
 *
 * Falls back to a plain commit where the API is missing or the reader asked for
 * less motion; the rail still moves, it just cuts.
 */
export function runRailJump(
  next: boolean,
  mark: Element | null,
  commit: (next: boolean) => void,
): void {
  const doc = document as Document & {
    startViewTransition?: (callback: () => void) => unknown;
  };
  const reduced =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  if (typeof doc.startViewTransition !== "function" || reduced) {
    commit(next);
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
  // capture too. Cleared on every exit below.
  mark?.setAttribute("data-hopping", "");
  document.documentElement.dataset.swHop = "";

  // THE RAIL MUST MOVE EVEN IF THE ANIMATION DOES NOT, which is the one thing
  // the source app's version of this does not guarantee. Every path below is
  // about making sure `commit` runs exactly once and the attributes always come
  // off — because the failure is not "no animation", it is a rail that is dead
  // for good: the state never changes, and `data-hopping` is left on, so the
  // creature stays a named participant and the NEXT transition anyone starts
  // snapshots it and replays the jump. Observed for real in a browser surface
  // that does not composite frames, where the callback never ran and neither
  // promise ever settled.
  let committed = false;
  const commitOnce = () => {
    if (committed) return;
    committed = true;
    commit(next);
  };

  let transition: { finished?: Promise<unknown> };
  try {
    transition = doc.startViewTransition(() => {
      commitOnce();
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
  } catch {
    // The API exists and refused the call. Nothing was captured, so there is no
    // flight to clean up after — just move the rail.
    leaveJump(mark);
    commitOnce();
    return;
  }

  // NEVER STARTED, as distinct from still running. If the callback has not been
  // invoked by now, no transition is in flight and none is coming; commit
  // directly so the press is not simply lost. A transition that DID start has
  // already committed, so this fires and does nothing.
  const watchdog = window.setTimeout(() => {
    if (committed) return;
    leaveJump(mark);
    commitOnce();
  }, JUMP_WATCHDOG_MS);

  const settle = () => {
    window.clearTimeout(watchdog);
    if (!mark) return;
    // THE SETTLE, once the flight is over. The eye and the feet cannot move
    // during the transition — the creature is a rasterised snapshot then, not
    // elements — so the parts that should still be moving when the body stops
    // are handed back to the live element here.
    //
    // Swapped in ONE frame, and the settle's first pose is the aim, so the pupil
    // is never briefly re-centred between the two: the handover from captured
    // image to live element is invisible.
    leaveJump(mark);
    mark.setAttribute("data-settling", "");
    // Outlasts the longest part, which is the PUPIL: it waits for the eye to
    // finish moving (460ms) and then constricts over 800ms, so it is still going
    // 620ms after the hat has stopped. Pulling the attribute early does not
    // shorten the flourish, it truncates it — at 620ms the hat's final bounce
    // was cut mid-air, and anything under 1260 snaps the last of the dilation
    // off in one frame.
    window.setTimeout(() => mark.removeAttribute("data-settling"), 1360);
  };

  const finished = transition.finished;
  if (!finished) {
    // Nothing to hang the settle off. Drop the aim on a timer regardless — a
    // pupil left staring sideways is worse than no flourish at all.
    window.setTimeout(() => {
      window.clearTimeout(watchdog);
      leaveJump(mark);
      commitOnce();
    }, 620);
    return;
  }

  void finished.then(settle).catch(() => {
    // A transition skipped or superseded by a faster second click. The rail
    // still moved; only the flourish is lost — but the aim must come off, or the
    // eye is left pointing at a jump that never happened.
    window.clearTimeout(watchdog);
    leaveJump(mark);
    commitOnce();
  });
}
