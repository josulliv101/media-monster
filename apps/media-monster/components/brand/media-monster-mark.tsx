/**
 * The media monster — the creature that sits in the "o" of "monster".
 *
 * Ported from the logo design document's TURN 54, variant 48a ("antenna pair"),
 * its latest direction: the same one-eyed fuzzball, now with two stalks and
 * round knobs where the pinched-crown hat used to be. It is drawn in CSS rather
 * than SVG, exactly as the source is: a masked `repeating-conic-gradient` makes
 * the fur spikes and the eye is four nested circles. The antennae are the one
 * place this file departs from the source's construction — 48a draws each as a
 * single leaning bar, and a single bar cannot bend, so each is rebuilt as a
 * chain of three that arcs. It resolves to the same drawing at rest; see
 * `SEG_BEND`.
 *
 * THE GEOMETRY IS THE SOURCE'S, VERBATIM. 48a re-expresses the drawing against
 * a 1em box where earlier turns used 0.72em; every inner number is the old one
 * times 1/0.72, so the creature itself did not change size, only the unit it is
 * quoted in. Keeping the source's numbers rather than re-deriving them is what
 * lets the next turn be diffed against this file.
 *
 * WHICH IS WHY `scale` IS FOLDED INTO THE FONT-SIZE AT 0.72. `scale` keeps
 * meaning what it has always meant to the callers — 1.1 in the word, 1.6 alone
 * in the rail — and the 0.72 converts that expectation into the source's basis.
 * Drop it and every call site silently grows by 39%.
 *
 * THE HEAD IS ROUND AGAIN, and that is the largest thing this turn changed
 * besides the antennae. The body was stretched into an egg (1.12 against a
 * width of 0.98) for exactly one reason: headroom between the eye and the hat's
 * BRIM. Antennae have no brim — they leave the top of the head from a point, so
 * they need no clearance at all — and the stretch with nothing left to buy just
 * reads as a tall head. So the body, the fur that tracks it and the eye centred
 * in it all go back to the source's own circle, and `bodyTopFor`, `BODY_LIFT`
 * and the hatted/bare pair of heights go with them.
 *
 * COLOURS: the file gives one as a literal and the rest as design-system tokens
 * it does not ship — `_ds/organic-…/styles.css` is not in the export, and the
 * document renders black-on-black without it, so there are no frames to sample
 * either. The sage below is the source's own value; the cream, the pupil, the
 * antennae and the feet are matched to those tokens' roles in the ramp, and the
 * last two are the ones worth checking against the real palette.
 */

import React from "react";

import { Antennae } from "@/components/brand/media-monster-antennae";
export { MEDIA_MONSTER_ACCENT } from "@/components/brand/media-monster-palette";
import {
  CREAM,
  FEET,
  PUPIL,
  SAGE,
} from "@/components/brand/media-monster-palette";



/** The source's circle, restored — see the head note in the header. */
const BODY = 0.98;
/** Bottom edge where it has always been (0.99em), so the feet keep their line. */
const BODY_TOP = 0.99 - BODY;

/**
 * WHERE THE CREATURE IS LOOKING WHEN NOTHING IS HAPPENING.
 *
 * At rest it watches the breadcrumb — the back arrow and project name at the
 * top of the board, which is the thing a reader arriving at this corner is
 * about to use. Measured rather than guessed, in both rail states: from the
 * eye's centre to the project title is +161px x by -2px y with the rail open
 * and +155 by -3 collapsed. Both are within a degree of straight right, so the
 * gaze does NOT need to flip with the rail — a fact worth writing down, because
 * "it must need to mirror when it collapses" is the obvious wrong assumption.
 *
 * IT IS A POSITION, NOT A TRANSFORM, and that is the whole reason it composes.
 * The aim and the settle in `media-monster-motion.css` are transforms, so they read as
 * deltas from wherever the pupil sits — the eye still throws itself along the
 * jump and still comes home to `translate(0, 0)`, which now means "back to
 * watching the breadcrumb" instead of "dead centre". Putting the gaze in the
 * transform would have meant every keyframe carrying it too.
 *
 * ONLY WHEN THE RAIL IS COLLAPSED. Open, the creature stands inside the word —
 * it IS the "o" of "monster" — and a letterform with its counter shoved to one
 * side stops being a letter. So it looks front and centre there, the way the
 * source draws it, and turns its head only once the word is gone and it is
 * alone in the corner with nothing left to be part of.
 *
 * THE WHOLE RANGE IS ABOUT 2.7px, which is why this number is larger than
 * "slightly" sounds. The pupil can travel (0.64 - 0.39) / 2 = 0.125em before it
 * reaches the white's rim, and on the collapsed mark that is 2.7px end to end.
 * At 60% of it the gaze is about 1.6px — the smallest offset that survives
 * rounding at this size. Anything genuinely subtle here is simply invisible.
 *
 * NO VERTICAL COMPONENT, because the measurement did not ask for one: the
 * breadcrumb sits within a degree of level with the eye in both rail states. A
 * tilt would be invention dressed as observation, and the glint already keeps
 * the eye from reading flat.
 *
 * It composes cleanly with the jump, and only because it is collapsed-only: the
 * aim in `media-monster-motion.css` throws the pupil 26% of its own width ALONG travel, and
 * the creature only ever ARRIVES collapsed by travelling left — so the aim
 * subtracts from a rightward gaze rather than stacking onto it, and the pupil
 * never reaches the rim. The eye white keeps its `overflow: hidden` regardless:
 * a pupil cannot leave an eye, and the next person to touch these numbers
 * should not have to rediscover that.
 */
/* The numbers themselves are in `media-monster-motion.css` — see the note above. Centred is
   (0.64 - 0.39) / 2 = 0.125em, and the breadcrumb gaze adds 0.075em to it. */

/**
 * The fur ring: a conic gradient of spikes, masked to an annulus.
 *
 * IT RENDERS NOTHING, AND THAT IS THE SOURCE'S OWN BEHAVIOUR — left verbatim
 * rather than "fixed", because the fix is not ours to make.
 *
 * The document reads its stops as shares of the fur BOX: 35%–50% of 1.38em is a
 * ring from 0.483em to 0.69em, starting at the body's edge (0.49em radius) and
 * reaching 0.2em past it. CSS resolves them against the GRADIENT's radius
 * instead, and an unsized `circle` is farthest-corner — so the ring lands
 * roughly 0.36em–0.51em and sits under the body, which is painted after it.
 * Measured on this build: at a 133px mark the fur box is 184px, its gradient
 * radius 130px, and the ring falls at 45.6–65px against a body radius of
 * 65.2px.
 *
 * Re-expressing it as `ellipse closest-side` with 71%/100% DOES produce the
 * document's intended geometry, and the result is a starburst — 0.2em of spike
 * on a 0.49em body is a 40% overhang, which reads as a sun, not as fur. At rail
 * size the honest range is worse: a collar small enough to read as fuzz is
 * about 1px and invisible, which is presumably why every legibility turn in the
 * document (16, 17) solves smallness with the glint and never with the fur.
 *
 * So the creature is smooth, here and in the document. Worth raising against
 * the source rather than papering over locally — the element is kept so that a
 * later turn changing the ratios brings the fur back on its own.
 */
const FUR_MASK =
  "radial-gradient(circle at 50% 50%, transparent 0 35%, #000 35% 50%, transparent 50%)";

const FUR: React.CSSProperties = {
  position: "absolute",
  // A uniform 0.2em outside the body on every side, the way the source holds it
  // around the circle. Nothing shows today (above), but a box that has drifted
  // out of register with the body is a worse starting point for whoever picks
  // the fur back up.
  left: "-0.19em",
  top: `${BODY_TOP - 0.2}em`,
  width: `${BODY + 0.4}em`,
  height: `${BODY + 0.4}em`,
  background: `repeating-conic-gradient(from 0deg, ${SAGE} 0deg 11deg, transparent 11deg 22deg)`,
  WebkitMaskImage: FUR_MASK,
  maskImage: FUR_MASK,
  // THE BODY'S SCALE ORIGIN, EXPRESSED IN THIS BOX. The body scales about its
  // own bottom edge, at (0.5em, 0.99em) in the mark; this box runs from -0.19em
  // for 1.38em, so the same point is 50% across and (0.99 + 0.19) / 1.38 =
  // 85.5% down. Sharing the origin is what lets `sw-body-settle` drive both
  // and keep them registered — see the marker note below.
  transformOrigin: "50% 85.5%",
};

/** Marked so the settle can move the feet after the body has stopped — see
 *  `sw-foot-settle` in media-monster-motion.css. The marker also carries WHICH foot: the two
 *  splay apart in flight, which needs a side, and counting `:nth-child` past the
 *  fur and the body to work it out would break the next time a part is added. */
const foot = (left: string): React.CSSProperties => ({
  position: "absolute",
  left,
  bottom: "-0.1em",
  width: "0.38em",
  height: "0.2em",
  background: FEET,
  borderRadius: "999px",
});


export function MediaMonsterMark({
  scale = 1,
  gaze = "ahead",
  antennae = true,
}: Readonly<{
  scale?: number;
  /** Where the pupil rests. `"ahead"` is the source's centred eye, which is what
   *  the wordmark needs; `"breadcrumb"` turns it toward the board's header and
   *  belongs to the collapsed rail. See the GAZE_X note above. */
  gaze?: "ahead" | "breadcrumb";
  /**
   * Whether the creature has its antennae. Turn 54's direction, so `true` by
   * default.
   *
   * Removing them is genuinely free, and freer than removing the hat was. The
   * antennae are their own absolutely-positioned layer above the body, and
   * every rule that animates them in `media-monster-motion.css` — the flight pose,
   * `sw-antennae-settle`, the reduced-motion guard — keys off
   * `[data-monster-antennae]`, so with nothing rendered they match nothing and
   * do nothing. No orphaned animation, no layout shift.
   *
   * AND IT NO LONGER RESHAPES THE HEAD, which the hat's version of this prop
   * did. The egg existed to clear a brim; antennae leave the skull from a point
   * and need no clearance, so the body is the source's circle either way and
   * bare-versus-not is now purely a question of whether two stalks are drawn.
   *
   * NOTHING PASSES `false` HERE YET, and nothing can show the two side by side:
   * the source app has a `WithoutTheAntennae` story for that and this app has no
   * Storybook. The prop came over with the drawing because removing it would
   * mean re-deriving that the body no longer depends on it.
   */
  antennae?: boolean;
}>) {
  // THE GAZE TRAVELS AS A CUSTOM PROPERTY, which is the one channel a stylesheet
  // can still take back. Written as an inline `left` it worked everywhere and
  // could be overridden nowhere — inline beats any rule — so the pre-jump look
  // in `media-monster-motion.css` silently did nothing. Written only in `media-monster-motion.css` it was
  // overridable but invisible in Storybook, which loads its own Tailwind entry
  // and never sees the app's stylesheet; the mark's own story failed on it.
  //
  // A custom property set HERE and read by the pupil's `left` below satisfies
  // both: the component still owns its resting positions and renders correctly
  // anywhere, and `media-monster-motion.css` re-declares the property ON THE PUPIL for the
  // flight pose, where a value set directly on the element beats one inherited
  // from this ancestor.
  return (
    <span
      data-media-monster=""
      data-monster-gaze={gaze}
      // The growth between rail states. Everything about the creature is sized
      // off its own font-size, so animating that one property scales the whole
      // drawing — fur, eye, glint, antennae and feet together.
      className="transition-[font-size] duration-200 motion-reduce:transition-none"
      style={{
        // Read by the pupil's `left`, and re-declared by the flight pose — see
        // the note above.
        ["--monster-gaze-x" as string]:
          gaze === "breadcrumb" ? "0.075em" : "0em",
        display: "inline-block",
        width: "1em",
        height: "1em",
        // Never let the lockup's flex row squeeze the drawing; it has no text of
        // its own to establish a min-content width.
        flex: "none",
        lineHeight: 1,
        // The creature's own box drives its parts, so one number scales the
        // whole drawing without touching the geometry below. See the 0.72 note
        // in the header: it converts `scale` into the source's 1em basis.
        fontSize: `${scale * 0.72}em`,
        // NOT NAMED HERE, and the absence is the fix rather than an omission.
        //
        // Collapsing the rail does not move this element, it re-lays it out —
        // inline in the word, then alone and larger — so there is nothing for
        // an ordinary transition to animate between, and it needs a
        // `view-transition-name` for the browser to snapshot both states and
        // interpolate. It had one here, inline and unconditional.
        //
        // A NAME IS PARTICIPATION IN EVERY TRANSITION, NOT JUST THIS ONE. The
        // app starts view transitions elsewhere — the item details modal and
        // the trash drawer both go through `withViewTransition` — and a named
        // element is lifted out of the root snapshot by ALL of them. So opening
        // a modal ran the creature's whole 680ms jump, and painted the group's
        // opaque hole-filler over it on the way, because `--sw-group-fill` is
        // only set by the rail toggle and falls back to a near-black rectangle.
        // The jump then vanished mid-flight when the transition it had
        // hitched a ride on finished on its own schedule.
        //
        // So the name lives in `media-monster-motion.css` behind `[data-hopping]`, which
        // `writeRailExpanded` sets before it starts the transition and clears
        // when that transition finishes — the same lifecycle `data-aiming`
        // already has. Inline would beat that rule outright, which is why this
        // is a comment and not a value.
        // BASELINE-ALIGNED BY MEASUREMENT, not by `align-self`. The lockup is
        // a flex row and the pieces around this are `RevealedLetters` —
        // `display: grid`, so they can only be flex items and the row is laid
        // out by flex, not by inline text. `align-self: baseline` on an item
        // with no text of its own resolves to its bottom margin edge and threw
        // the creature to the top of the 72px row, which is why this is an
        // explicit offset at all.
        //
        // THE NUMBER IS WHERE THE FEET MEET THE BASELINE. Measured on the
        // rendered lockup rather than derived: the feet's top edge has to land
        // on the baseline, so the feet hang under it like a descender and the
        // body overshoots it a little the way a round letter should.
        //
        // IT IS TIED TO `scale`, which is the thing to know before changing
        // either. The offset is a constant em of the MARK, and the baseline
        // belongs to the TEXT — so they do not move together, and every change
        // to the in-word scale lands the feet somewhere new. This value goes
        // with 0.97: at 1.1 it was -0.1136em, and shrinking the creature lifted
        // its feet 0.55px clear of the line until this followed. Re-measure
        // rather than re-derive; the probe is a zero-size inline-block, because
        // a Range rect returns the line box and not the glyph.
        //
        // NO `* scale`, and removing it is a fix rather than a simplification.
        // `em` here resolves against this element's OWN font-size — set
        // directly above, and already multiplied by `scale`. Multiplying again
        // made the offset grow with the SQUARE of the scale, so the drawing
        // that is 1.45x larger in the collapsed rail was dropped 2.1x further.
        // A constant em is what keeps one optical relationship at every size.
        position: "relative",
        top: "-0.0758em",
      }}
    >
      {/* MARKED SO IT CAN FOLLOW THE BODY'S SQUASH, which is not decoration.
          The masked ring lands 0.4879em out against a body radius of 0.4900em,
          so it clears the silhouette by 0.0021em — 0.05px at rail size. It is a
          SIBLING of the body, so when `sw-body-settle` squashed the head and
          the fur did not follow, the head's top dropped out from under it and
          the ring showed: 2.10px of bare starburst above the skull at the
          bottom of the squash, which is exactly the artifact that put this
          marker here. Both elements now run the same animation about the same
          point, so the 0.05px margin holds at every frame instead of only at
          rest. */}
      <span data-monster-fur="" style={FUR} />
      {/* MARKED SO THE BODY CAN SQUASH WITHOUT THE ANTENNAE SQUASHING WITH IT.
          The antenna group is a SIBLING of this element, not a child, so a
          scale here reaches the eye and the glint inside the head and nothing
          above it. That separation is the whole reason the landing can be
          heavy on the body and light on the stalks — see `sw-body-settle` in
          media-monster-motion.css, and the tracking note beside it for how the antennae
          stay rooted while this moves under them. */}
      <span
        data-monster-body=""
        style={{
          position: "absolute",
          left: "0.01em",
          top: `${BODY_TOP}em`,
          width: `${BODY}em`,
          height: `${BODY}em`,
          borderRadius: "999px",
          background: SAGE,
          // Stands on its own feet: a squash presses the head DOWN onto the
          // line it shares with them rather than sinking the whole creature.
          transformOrigin: "50% 100%",
        }}
      >
        {/* NO SECOND ELLIPSE HERE, and the empty space is the point.

            There used to be one: a narrower sage ellipse hidden inside the body
            that the flight pose leaned over the base, so the union of the two
            read as a head arcing over feet that had not moved. It was the only
            way this drawing could BEND -- every transform is affine, so no
            amount of rotating or skewing turns an ellipse into a banana, and a
            view transition freezes the geometry, so a curve could not be
            keyframed either.

            It did not survive being looked at. The body is 0.98 wide and the
            ellipse was 0.9, which leaves it about 0.01em of clearance at its
            widest point -- so the moment the pose translated it 5% and rotated
            it 7deg it broke the silhouette, measured at 0.049-0.092em past the
            body's leading edge and up to 0.049em over the top, for EVERY frame
            of the flight including the first. At rail size that is a ~3px green
            lump beside the head, and it reads as a second body showing through
            rather than as a bend.

            So the lean is the body's own, carried by the `rotate` and `skewX`
            already in `sw-monster-hop`. Straight rather than curved, and
            honest: one shape, one outline. Anything that wants a real arc back
            has to change the GEOMETRY -- a border-radius that differs per
            corner, or a clip-path -- not stack a second copy behind it. */}
        {/* eye white — marked because the WHOLE eye turns before a jump, not
            just the pupil sliding inside a fixed one. See the departure pose in
            media-monster-motion.css. */}
        <span
          data-monster-eye=""
          style={{
            position: "absolute",
            left: "0.17em",
            // Centred in the body, which is the source's own 0.17em now that
            // the head is round again.
            top: `${(BODY - 0.64) / 2}em`,
            width: "0.64em",
            height: "0.64em",
            borderRadius: "999px",
            background: CREAM,
            // A PUPIL CANNOT LEAVE THE EYE. With the resting gaze offset added
            // to the settle's own excursion, the far edge of the pupil reaches
            // about half a pixel past the white and would otherwise be drawn on
            // the sage. Clipping it to the circle is both the fix and what
            // actually happens to an eye looking hard to one side.
            overflow: "hidden",
          }}
        >
          {/* pupil */}
          <span
            data-monster-pupil=""
            style={{
              position: "absolute",
              // Centred is (0.64 - 0.39) / 2: the pupil is 0.39em inside a
              // 0.64em eye. The gaze rides on top as a custom property.
              left: "calc(0.125em + var(--monster-gaze-x, 0em))",
              top: "0.125em",
              width: "0.39em",
              height: "0.39em",
              borderRadius: "999px",
              background: PUPIL,
            }}
          >
            {/* the glint — the document's turn 17 exists for this one dot, and
                it is the first thing to disappear at small sizes */}
            <span
              style={{
                position: "absolute",
                left: "0.05em",
                top: "0.05em",
                width: "0.14em",
                height: "0.14em",
                borderRadius: "999px",
                background: CREAM,
              }}
            />
          </span>
        </span>
      </span>
      <span data-monster-foot="left" style={foot("0.08em")} />
      <span data-monster-foot="right" style={foot("0.55em")} />
      {antennae ? <Antennae /> : null}
    </span>
  );
}
