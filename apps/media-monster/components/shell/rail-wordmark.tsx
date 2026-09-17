"use client";

import React from "react";
import Link from "next/link";

import {
  MediaMonsterMark,
  MEDIA_MONSTER_ACCENT,
} from "@/components/brand/media-monster-mark";
import { cn } from "@/lib/utils";

/**
 * The lockup at the top of the rail: "media monster", with the creature standing
 * in for the "o".
 *
 * Split from `rail.tsx`, which is the rail's frame and its controls. This is the
 * one thing in the rail that is not a tile, and it is the half that has to stay
 * in step with `media-monster-motion.css` — the letters' reveal is timed against
 * the creature's own travel, and the arithmetic that makes the two agree is in
 * `RevealedLetters` below.
 */

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

export function RailWordmark({ expanded }: Readonly<{ expanded: boolean }>) {
  return (
    <Link
      href="/"
      aria-label="Media Monster home"
      // LEADING, at the glyph column's inset, in both states. Centring the mark
      // in the 72px rail already put it within a pixel of 22px, so pinning it
      // there costs nothing closed and is what lets the name grow to the right
      // rather than the whole mark sliding.
      className="flex h-[72px] w-full items-center justify-start overflow-hidden whitespace-nowrap pl-[22px] font-[family-name:var(--font-grandstander)] font-bold text-[21px] text-white transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-500"
    >
      {/* THE CREATURE NEVER LEAVES. The letters around it collapse to nothing,
          so closing contracts the word onto the one thing that stays — same
          size, same font, same position throughout — which is why this reads as
          the mark contracting rather than a label being swapped for an
          abbreviation.

          HIDDEN FROM ASSISTIVE TECH. The word is split into spans so it can be
          revealed a piece at a time, and exposed spans like that risk being read
          out one fragment at a time. The `aria-label` on the link carries the
          whole name instead.

          THE TWO NAMES AGREE. A visible name not contained in the accessible one
          is `label-content-name-mismatch` (WCAG 2.5.3 "Label in Name"): someone
          driving by voice says what they see and matches nothing. With the label
          reading "Media Monster home" over a mark that reads "media monster",
          what you say is what is there.

          `display: contents` so hiding them costs no layout — the letters keep
          participating in the link's own flex box. */}
      <span aria-hidden="true" className="contents">
        <RevealedLetters show={expanded}>media&nbsp;</RevealedLetters>
        {/* The creature takes the monogram's place: it is what survives the
            collapse. The word rebuilds around it — "m" before, "nster" after —
            so opening the rail grows the name out of the mark rather than
            swapping one thing for another.

            `contents`, so "m", the creature and "nster" stay FLEX ITEMS of the
            link rather than becoming one narrow item that wraps inside itself.
            Colour still inherits through a `display: contents` box. */}
        <span className="contents" style={{ color: MEDIA_MONSTER_ACCENT }}>
          <RevealedLetters show={expanded}>m</RevealedLetters>
          {/* SMALL IN THE WORD, BIG ALONE. Expanded it is the source's own
              proportion, which is what makes it read as the "o" of "monster"
              rather than a creature parked beside it. Collapsed there is no word
              left to belong to, so it grows into the mark the rail needs — and
              past the 19px floor the design document measured, below which the
              fur spikes and the glint start to merge.

              0.97 IN THE WORD, and the number comes from the letters rather than
              from taste. Measured against Grandstander at 21px the x-height is
              13px, and at 1.1 the creature's body drew 16.3 — 1.254x the letter
              it is standing in for, which is why it read as parked beside the
              word rather than set into it. 0.97 puts the body at about 1.1x the
              x-height: still the largest thing in the lockup, because it is a
              face and it has to hold the eye, but close enough to the "o" to
              belong to the same alphabet. The antennae above and the feet below
              stay outside that band on purpose — an ascender and a descender are
              what a letter is allowed to have. */}
          <MediaMonsterMark
            scale={expanded ? 0.97 : 1.6}
            gaze={expanded ? "ahead" : "breadcrumb"}
          />
          <RevealedLetters show={expanded}>nster</RevealedLetters>
        </span>
      </span>
    </Link>
  );
}
