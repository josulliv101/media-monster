/**
 * The creature's colours, and why each one stands where it does.
 *
 * Split out of `media-monster-mark.tsx` so the drawing and its palette can be
 * read separately — most of what follows is the REASONING for a value rather
 * than the value, and it is the half that gets revisited when the logo document
 * turns again. The blocks below are the source's own notes, moved verbatim.
 *
 * The file gives one colour as a literal and the rest as design-system tokens it
 * does not ship — `_ds/organic-…/styles.css` is not in the export, and the
 * document renders black-on-black without it, so there are no frames to sample
 * either. The sage below is the source's own value; the cream, the pupil, the
 * antennae and the feet are matched to those tokens' roles in the ramp, and the
 * last two are the ones worth checking against the real palette.
 */

/** The source's literal, unchanged since turn 9: fur and body. */
export const SAGE = "oklch(0.86 0.17 128)";
/** `--color-bg`: the eye white and the glint. A warm off-white. */
export const CREAM = "oklch(0.96 0.02 95)";
/** `--color-accent-2-900`: the pupil, near-black. */
export const PUPIL = "oklch(0.27 0.03 145)";
/**
 * The word "monster" in the rail's lockup.
 *
 * TAILWIND'S `blue-400`, RESOLVED, and deliberately not the source's colour.
 * The design document paints the word in `--color-accent-300`, the same pale
 * terracotta as the antenna knobs. That reads beautifully in the document and
 * makes the wordmark a stranger in this app: the projects list already labels
 * itself `text-blue-400`, so that blue is what the product calls a heading, and
 * the rail's wordmark was the last place still speaking the logo's private
 * dialect.
 *
 * Written as the resolved value rather than the class because it is consumed as
 * an inline `color` on a span inside the lockup, not as a utility. If the app's
 * blue ever moves this has to move with it by hand — the PAIRING is the point,
 * not the number.
 *
 * The antennae keep their own terracotta (`ANTENNA_KNOB` below). One token in
 * the source, two here on purpose: the antennae belong to the creature, the
 * word belongs to the product.
 */
export const MEDIA_MONSTER_ACCENT = "oklch(0.707 0.165 254.624)";
/**
 * The stalks.
 *
 * STANDS OFF THE SOURCE'S RAMP ON PURPOSE, and the reasoning the hat needed is
 * MORE pressing here, not less. The document paints the stalks from
 * `--color-accent` with `--color-accent-300` as the knob — a darker stem under
 * a lighter head, which is right on its own pale ground. On the rail's
 * near-black it is not: a 0.62-lightness stalk sits closer to the rail than to
 * anything it is attached to, and a stalk is 0.055em WIDE. On the collapsed
 * mark that is about 1.2px, which is a single antialiased column of pixels —
 * the thinnest thing in the whole drawing, and the first to disappear.
 *
 * So the pair is lifted TOGETHER and the contrast between them is what is
 * preserved, not the absolute values: stalk to 0.70 with the chroma pushed to
 * hold its identity against the near-black, knob to 0.89 so it stays the
 * lighter head the source drew. Raising only the stalk would have closed the
 * gap to the knob and flattened each antenna into one shape.
 */
export const ANTENNA_STALK = "oklch(0.70 0.18 45)";
/** The knobs. Lighter than the stalks by more than the source needed — see
 *  above. Still terracotta, so each antenna stays one object and not two. */
export const ANTENNA_KNOB = "oklch(0.89 0.08 48)";
/**
 * The feet: the SAME terracotta as the antenna knobs, which is the source's own
 * scheme restored.
 *
 * They were denim for a long time, and the argument for it had quietly expired
 * before this turn removed it — worth recording so nobody re-derives the dead
 * version. Denim was chosen when terracotta was also the WORD's colour, so
 * terracotta feet read as part of the letters rather than as part of the
 * creature. The word went blue (see `MEDIA_MONSTER_ACCENT`), and with it
 * the only thing that clash was ever about.
 *
 * What the source's scheme buys instead is a BOOKEND: the same pale terracotta
 * at the top of the creature and at the bottom of it, with the sage body
 * between, so the drawing reads as one object with two ends rather than as
 * three unrelated bands. It also means the two smallest shapes in the mark —
 * a 3.5px knob and a 4px foot — carry the same value, so they hold or fail
 * together instead of one of them going first.
 *
 * The rest of the old reasoning still applies as written, and is why this is
 * the LIGHT terracotta and not the stalks' darker one: cream would make the
 * feet the brightest thing in the rail, anything near-black vanishes outright
 * because the feet sit BELOW the body against the rail rather than against the
 * sage, and at about 4px tall a small shape needs MORE contrast than a large
 * one, not less.
 */
export const FEET = ANTENNA_KNOB;
