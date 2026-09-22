"use client";

import { documentOrder, getNode, getParent, type NodeId } from "@josulliv101/nested-collections";

import { FilmStrip, LOOKS, type FilmStripShot, type FilmStripSize } from "@storyboard/ui/film-strip";
import { useGraph, useSelectionActions, useSelectionAnchor } from "@/lib/engine/bindings";
import type { ClipMedia } from "@/lib/engine/node-types";
import { imageUrl, videoFrameUrl } from "@/lib/media/cloudinary";

/**
 * The reel as a film strip: every clip the board can see, end to end, in
 * document order.
 *
 * READ, NOT OWNED. The strip keeps its own clock and play state (it runs
 * itself when those are not passed) because this app has no player yet;
 * selection is the one thing it shares with the board, so a clip picked on
 * either surface is picked on both.
 *
 * REAL FRAMES. A video clip is sampled across its length with Cloudinary frame
 * grabs, one frame per ~200px of box (~114px when compact) so a long shot reads as a run of footage
 * and a short one as its middle. An image clip is its still. A clip with no
 * media, or media Cloudinary cannot transform, falls back to one of the
 * reference design's gradients so the box is never blank.
 *
 * ONLY ACTIVE CLIPS. A clip flagged inactive on the board (an alternate take,
 * a plate kept for later) is left out, which is the whole point of the flag.
 *
 * AN UNREAD COLLECTION CONTRIBUTES NOTHING. Its clips are not in the graph, and
 * inventing a box for a stored summary would draw footage nobody has read. The
 * strip is the cut as far as it is known — the board's rollup is what says how
 * much is missing.
 */
/** The strip's own scale (`@storyboard/ui/film-strip`): 44px a second, 150px tall. */
const PX_PER_SECOND = 44;
const FRAME = { width: 320, height: 180 } as const;
/** Box width each sampled frame covers, per strip size. The compact strip's
 *  frames are 64px tall rather than 150, so a 16:9 grab is ~114px wide there;
 *  sampling at the default's 200px would crop every frame to its middle. */
const FRAME_SPAN_PX: Readonly<Record<FilmStripSize, number>> = { default: 200, compact: 114 };

const cover = (url: string) => `url("${url}") center / cover no-repeat, #0b0d12`;

function framesFor(
  media: ClipMedia | null,
  seconds: number,
  spanPx: number,
): readonly string[] | null {
  if (media === null) return null;
  if (media.kind === "image") {
    const still = imageUrl(media.src, FRAME);
    return still === null ? null : [cover(still)];
  }
  const count = Math.max(1, Math.round((seconds * PX_PER_SECOND) / spanPx));
  const frames: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const url = videoFrameUrl(media.src, ((i + 0.5) / count) * seconds, FRAME);
    if (url === null) return null;
    frames.push(cover(url));
  }
  return frames;
}

// The LIT looks only. The reference's cycle opens on its fade-outs and night
// plates, which on a strip of placeholder frames read as boxes that failed to
// load.
const LOOK_CYCLE = [
  "streetDay",
  "faceWarmC",
  "carCool",
  "storefront",
  "emberProfile",
  "duskWide",
  "goldenPair",
  "vanPop",
].map((name) => LOOKS[name] ?? "");

/**
 * The board's clips as strip shots, plus a lookup back to engine ids.
 *
 * The strip speaks plain strings; the engine takes branded ids. Kept as a
 * lookup rather than a cast, so an id the strip reports that is not a clip on
 * this board selects nothing.
 *
 * A plain function of the graph and nothing else. It used to sit in a
 * `useMemo` keyed on `graph`; the React Compiler now caches the call on the
 * graph's identity, which is the same dependency.
 */
function shotsFromGraph(graph: ReturnType<typeof useGraph>, size: FilmStripSize) {
  const out: FilmStripShot[] = [];
  const ids = new Map<string, NodeId>();
  for (const id of documentOrder(graph)) {
    const node = getNode(graph, id);
    if (node === undefined || node.sealed || node.kind !== "clip") continue;
    // INACTIVE CLIPS ARE NOT IN THE CUT. They stay on the board; the strip is
    // what plays.
    if (!node.data.active) continue;
    // A clip directly under a root is not in a section; one inside a
    // collection is labelled with it on the ruler.
    const parentId = getParent(graph, id);
    const parent = parentId === null ? undefined : getNode(graph, parentId);
    const sectionName =
      parent !== undefined &&
      !parent.sealed &&
      parent.kind === "collection" &&
      !graph.rootIds.includes(parent.id)
        ? parent.data.name
        : null;
    out.push({
      id,
      label: node.data.title,
      seconds: node.data.seconds,
      frames: framesFor(node.data.media, node.data.seconds, FRAME_SPAN_PX[size]) ?? [
        LOOK_CYCLE[out.length % LOOK_CYCLE.length] ?? "",
      ],
      sectionName,
    });
    ids.set(id, id);
  }
  return { shots: out, clipIds: ids };
}

export function BoardFilmStrip({ size }: Readonly<{ size: FilmStripSize }>) {
  const graph = useGraph();
  const anchor = useSelectionAnchor();
  const selection = useSelectionActions();

  const { shots, clipIds } = shotsFromGraph(graph, size);

  if (shots.length === 0) return null;

  return (
    <FilmStrip
      standalone={false}
      size={size}
      shots={shots}
      selectedId={anchor}
      onSelect={(id) => {
        const clipId = clipIds.get(id);
        if (clipId !== undefined) selection.set([clipId]);
      }}
    />
  );
}
