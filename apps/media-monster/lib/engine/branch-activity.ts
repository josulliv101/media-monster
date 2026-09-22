import { getNode, getParent, type Graph, type NodeId } from "@josulliv101/nested-collections";

import type { CollectionSummary } from "@/lib/engine/engine";
import type { NodeTypes } from "@/lib/engine/node-types";

/**
 * WHERE THE CUT IS SWITCHED OFF, read from the collections above a node.
 *
 * The switch lives on collections (`Collection.active`), and it covers a whole
 * branch: a clip is in the film strip only when EVERY collection above it is
 * on. These answer that for one node by walking up — the fold does the same
 * sum bottom-up for the running time, and the board passes it down by context
 * — so this is for the places that start from a single id: the film strip's
 * shot list, and "go to" picking the first clip to land on.
 *
 * Pure, with no React: it reads a graph and nothing else.
 */
type BoardGraph = Graph<NodeTypes, CollectionSummary>;

/**
 * The NEAREST collection at or above `id` that is switched off, or `null` when
 * every collection on the way to the root is on. Nearest, because that is the
 * one worth naming: "off because Leads is off" beats naming the root.
 */
export function switchedOffAt(graph: BoardGraph, id: NodeId): NodeId | null {
  for (let at: NodeId | null = id; at !== null; at = getParent(graph, at)) {
    const node = getNode(graph, at);
    if (node !== undefined && !node.sealed && node.kind === "collection" && !node.data.active) {
      return at;
    }
  }
  return null;
}

/** Whether `id` sits in a branch the film strip plays. */
export function inTheCut(graph: BoardGraph, id: NodeId): boolean {
  return switchedOffAt(graph, id) === null;
}
