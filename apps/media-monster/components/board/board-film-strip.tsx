"use client";

import { useMemo } from "react";
import { documentOrder, getNode, getParent, type NodeId } from "@josulliv101/nested-collections";

import { FilmStrip, LOOKS, type FilmStripShot } from "@storyboard/ui/film-strip";
import { useGraph, useSelectionActions, useSelectionAnchor } from "@/lib/engine/bindings";

/**
 * The reel as a film strip: every clip the board can see, end to end, in
 * document order.
 *
 * READ, NOT OWNED. The strip keeps its own clock and play state (it runs
 * itself when those are not passed) because this app has no player yet;
 * selection is the one thing it shares with the board, so a clip picked on
 * either surface is picked on both.
 *
 * NO FOOTAGE YET, so a clip's frame is one of the reference design's
 * gradients, chosen by position so a clip keeps its look while nothing moves.
 * `FilmStripShot.frames` takes any CSS background, so real posters replace
 * this without touching the strip.
 *
 * AN UNREAD COLLECTION CONTRIBUTES NOTHING. Its clips are not in the graph, and
 * inventing a box for a stored summary would draw footage nobody has read. The
 * strip is the cut as far as it is known — the board's rollup is what says how
 * much is missing.
 */
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

export function BoardFilmStrip() {
  const graph = useGraph();
  const anchor = useSelectionAnchor();
  const selection = useSelectionActions();

  // The strip speaks plain strings; the engine takes branded ids. Kept as a
  // lookup rather than a cast, so an id the strip reports that is not a clip
  // on this board selects nothing.
  const { shots, clipIds } = useMemo(() => {
    const out: FilmStripShot[] = [];
    const ids = new Map<string, NodeId>();
    for (const id of documentOrder(graph)) {
      const node = getNode(graph, id);
      if (node === undefined || node.sealed || node.kind !== "clip") continue;
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
        frames: [LOOK_CYCLE[out.length % LOOK_CYCLE.length] ?? ""],
        sectionName,
      });
      ids.set(id, id);
    }
    return { shots: out, clipIds: ids };
  }, [graph]);

  if (shots.length === 0) return null;

  return (
    <FilmStrip
      standalone={false}
      shots={shots}
      selectedId={anchor}
      onSelect={(id) => {
        const clipId = clipIds.get(id);
        if (clipId !== undefined) selection.set([clipId]);
      }}
    />
  );
}
