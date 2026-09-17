import React from "react";

import {
  ANTENNA_KNOB,
  ANTENNA_STALK,
} from "@/components/brand/media-monster-palette";

/**
 * The creature's antennae: two stalks, each a chain that arcs, with a knob on
 * the tip.
 *
 * Split out of `media-monster-mark.tsx`, which draws the body, the eye and the
 * feet. This is the one part of the mark that is NOT the source document's
 * construction — 48a draws each stalk as a single leaning bar, and a bar cannot
 * bend — so it is also the part whose geometry has to be re-solved rather than
 * copied. Keeping it in its own file is what makes the mark's own numbers
 * readable as the source's.
 *
 * The blocks below are verbatim from the mark, so both can still be diffed
 * against the document turn they came from. The keyframes that move any of this
 * are in `app/media-monster-motion.css`.
 */

/**
 * The pair, as ONE group — and the group being transform-free is load-bearing.
 *
 * It holds no transform of its own. That is what lets `media-monster-motion.css` own the
 * antennae's motion: an inline `transform` beats any stylesheet rule, so a pair
 * whose resting pose lived on the animated element could not be animated from
 * CSS at all. The group therefore expresses DELTAS from rest, and rest is
 * simply no transform.
 *
 * IT CARRIES ONLY ONE THING NOW, and that is worth knowing before adding to it.
 * The bend lives on the segments (see `SEG_BEND`), so the whole pair's swing
 * and shear are gone from here; what is left is a `translateY` that tracks the
 * body's landing squash, so the antennae ride a head whose top edge is moving.
 * The two are derived from each other in `media-monster-motion.css` and have to stay that
 * way.
 *
 * The origin is where the antennae attach — each stalk's root is 0.06em from
 * the mark's top — so anything that IS added here turns about the right point
 * rather than about the group's middle.
 */
const ANTENNA_GROUP: React.CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  width: "1em",
  height: "1em",
  transformOrigin: "50% 6%",
};

/**
 * EACH STALK IS A CHAIN OF THREE, and that is what lets it ARC.
 *
 * A stalk drawn as one bar can lean and it can shear, but it cannot bend: both
 * are affine, and an affine map takes a straight edge to a straight edge. What
 * actually bends is a chain — three short segments, each a child of the one
 * below it and each rotated by the SAME angle, so the rotations compound down
 * the chain (b, 2b, 3b) and the three chords approximate an arc. Ten degrees a
 * segment is thirty at the tip, which on the collapsed mark carries the knob
 * 3.0px back from where it rests.
 *
 * THE ROOT IS A FIXED POINT OF IT, which is the second reason to prefer this
 * over the shear it replaces. The first segment turns about its own bottom
 * edge, so no amount of bend moves where the antenna enters the head — the
 * root-lift ceiling that a rotating group has (see `sw-antennae-settle`) simply
 * does not exist here. The knob rides the last segment and therefore ROTATES
 * rather than shearing, so it stays a circle at every angle; the old skew
 * ovalised it by a pixel at full lean.
 *
 * THE BEND ARRIVES AS A CUSTOM PROPERTY, `--sw-antenna-bend`, for the same
 * reason the gaze does: an inline `transform` beats any stylesheet rule, and
 * every one of these segments needs an inline transform to read the property at
 * all. So the component owns the expression and `media-monster-motion.css` owns the VALUE,
 * set on an ancestor and inherited down. One declaration there bends all six
 * segments at once.
 */
const SEG_BEND = "rotate(var(--sw-antenna-bend, 0deg))";

/**
 * Where each antenna leaves the head, and how long its chain is.
 *
 * DERIVED FROM THE SOURCE'S OWN NUMBERS rather than replacing them. 48a draws
 * each stalk as a bar at a fixed lean and then FLOATS the knob near its tip,
 * by eye and not quite symmetrically — the left knob sits 0.0875em outboard of
 * its root and the right one 0.1025em, over the same 0.40em rise. Rebuilding
 * the stalk as a chain means the knob has to ride it, so the chain's angle and
 * length are solved from where the source put that knob: 12.34deg over 0.4095em
 * on the left, 14.37deg over 0.4129em on the right. At rest this lands both
 * knobs within 0.0015em of the source's own positions, asymmetry included.
 *
 * The chain is LONGER than the source's 0.32em bar because it runs to the knob's
 * CENTRE rather than to its edge. The extra 0.09em is covered by the knob, which
 * is painted after it, so the visible stalk is the source's length exactly.
 */
const ANTENNA = {
  left: { x: 0.3275, splay: -12.34, seg: 0.1365 },
  right: { x: 0.6775, splay: 14.37, seg: 0.1376 },
} as const;

/** The anchor each chain grows out of: a zero-size point at the root, carrying
 *  the fixed splay. The splay is inline because nothing animates it — the bend
 *  and the pair's tracking are separate channels on separate elements. */
const antennaRoot = (side: keyof typeof ANTENNA): React.CSSProperties => ({
  position: "absolute",
  left: `${ANTENNA[side].x}em`,
  top: "0.06em",
  width: 0,
  height: 0,
  transform: `rotate(${ANTENNA[side].splay}deg)`,
  transformOrigin: "0 0",
});

/** The first segment: bottom edge on the root point, centred across it. */
const segRoot = (side: keyof typeof ANTENNA): React.CSSProperties => ({
  position: "absolute",
  left: "-0.0275em",
  bottom: 0,
  width: "0.055em",
  height: `${ANTENNA[side].seg}em`,
  background: ANTENNA_STALK,
  borderRadius: "999px",
  transform: SEG_BEND,
  transformOrigin: "50% 100%",
});

/** Every segment after the first: same bar, standing on the one below. */
const segNext = (side: keyof typeof ANTENNA): React.CSSProperties => ({
  position: "absolute",
  left: 0,
  bottom: "100%",
  width: "100%",
  height: `${ANTENNA[side].seg}em`,
  background: ANTENNA_STALK,
  borderRadius: "999px",
  transform: SEG_BEND,
  transformOrigin: "50% 100%",
});

/** The knob, centred on the chain's tip: `bottom: 100%` puts its bottom edge
 *  there and the negative margin pulls it down by its own radius. It inherits
 *  the last segment's rotation, so it turns with the arc and stays circular. */
const KNOB: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: "100%",
  width: "0.16em",
  height: "0.16em",
  marginLeft: "-0.08em",
  marginBottom: "-0.08em",
  borderRadius: "999px",
  background: ANTENNA_KNOB,
};

/** One antenna: the root anchor, three segments nested so their bends compound,
 *  and the knob riding the last one. */
function Antenna({ side }: Readonly<{ side: keyof typeof ANTENNA }>) {
  return (
    <span data-monster-antenna={side} style={antennaRoot(side)}>
      <span style={segRoot(side)}>
        <span style={segNext(side)}>
          <span style={segNext(side)}>
            <span data-monster-knob="" style={KNOB} />
          </span>
        </span>
      </span>
    </span>
  );
}

/**
 * The pair, ready to drop into the mark.
 *
 * A component rather than an exported style object plus two `<Antenna>` calls,
 * because the group and its two children are one fact: the group must be the
 * BODY'S SIBLING and not its child, and `data-monster-antennae` is what every
 * rule in the stylesheet keys off. Handing the mark a single element is what
 * stops that arrangement from being re-assembled, slightly differently, at the
 * call site.
 */
export function Antennae() {
  return (
    <span data-monster-antennae="" style={ANTENNA_GROUP}>
      <Antenna side="left" />
      <Antenna side="right" />
    </span>
  );
}
