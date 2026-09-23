import { getNode, tryParseNodeId, type NodeId } from "@josulliv101/nested-collections";

import { inactiveRowsFromCookies } from "@/components/settings/inactive-rows-preference";
import { engine } from "@/lib/engine/engine";
import { readUnreadChildren } from "@/lib/engine/fixture-document";

type BoardStore = Pick<
  ReturnType<typeof engine.createStore>,
  "getGraph" | "applyNonUndoableWrite" | "load" | "markMissing"
>;

/**
 * SWITCHED-OFF ROWS, KEPT BETWEEN LOADS (see `inactive-rows-preference.ts`).
 *
 * The document is rebuilt from the fixture on every load, so the rows the
 * cookie names are switched off again by a NON-UNDOABLE write: restoring what
 * you left is not an edit you made this session, and Undo must not offer to
 * take it back.
 *
 * Only ids that are in the graph NOW and still on are written. The rest are
 * not lost: an id inside a folder not read yet (B-roll's Locations) stays in
 * the cookie, and is applied here again when that folder is opened.
 */
export function restoreSwitchedOff(
  store: Pick<BoardStore, "getGraph" | "applyNonUndoableWrite">,
  ids: readonly string[],
): void {
  const graph = store.getGraph();
  const edits: { nodeId: NodeId; kind: "collection"; edit: { active: false } }[] = [];
  for (const raw of ids) {
    const parsed = tryParseNodeId(raw);
    if (!parsed.ok) continue;
    const node = getNode(graph, parsed.value);
    if (node !== undefined && !node.sealed && node.kind === "collection" && node.data.active) {
      edits.push({ nodeId: parsed.value, kind: "collection", edit: { active: false } });
    }
  }
  if (edits.length > 0) store.applyNonUndoableWrite(edits);
}

/** Whether `id` is a collection whose children have not been read yet. */
export function isUnread(graph: ReturnType<BoardStore["getGraph"]>, id: NodeId): boolean {
  const node = getNode(graph, id);
  if (node === undefined) return false;
  const children = node.sealed || node.container ? node.children : null;
  const status = children?.status ?? "loaded";
  return status === "unloaded" || status === "reference";
}

/**
 * READS AN UNREAD COLLECTION'S CHILDREN INTO THE STORE: what its Open button
 * does, and what hovering it with a dragged row does, since the engine will
 * not move anything into a collection whose real children it has never seen.
 *
 * Returns the refusal to show, or `null` when it loaded. Storage having
 * nothing for it is recorded as missing rather than left unread, so the board
 * stops offering to open something that cannot be read.
 */
export async function readCollection(store: BoardStore, id: NodeId): Promise<string | null> {
  const doc = await readUnreadChildren(id);
  if (doc === null) {
    store.markMissing(id, "storage has no children for this collection");
    return null;
  }
  const loaded = store.load(id, doc);
  if (!loaded.ok) return `${loaded.error.code}: ${loaded.error.message}`;
  // Rows switched off in an earlier session that live in THIS folder only
  // exist now, so their saved state is applied now. Same synchronous block as
  // the load, so nothing ever records them as on.
  restoreSwitchedOff(store, inactiveRowsFromCookies(document.cookie));
  return null;
}
