// Eighth review round — the insert door checked a seed's data but not its
// summary.
//
// `seed.data` goes through the node type's `parse`, so a value that breaks the
// consumer's own invariants is refused at insert exactly as it would be at
// load. `seed.summary` was stored as handed in. A summary the summary type
// itself rejects (a negative count, here) went into the graph looking healthy,
// saved, and SEALED its node on the next load — an edit that succeeded and
// damaged the document it was saved into.
//
// A seed's summary now makes the same trip a stored one does —
// `parse(serialize(summary))` — and the parsed value is what is kept.
import { describe, expect, it } from "vitest";

import { getNode, parseNodeId } from "../index";
import { createEngine } from "../engine";
import { countSummary, folderType, rootDocument } from "./_review8-fixture";

const rootId = parseNodeId("root");

const makeStore = () => {
  const engine = createEngine({
    types: [folderType] as const,
    summary: countSummary,
    folds: {},
    mintId: () => "new",
  });
  const loaded = engine.deserialize(rootDocument);
  if (!loaded.ok) throw new Error(loaded.error.message);
  return { engine, store: engine.createStore(loaded.value.graph) };
};

describe("an inserted summary passes the door a loaded one does", () => {
  it("refuses a summary the summary type rejects", () => {
    const { store } = makeStore();
    const before = store.getGraph();

    const result = store.dispatch({
      type: "insert-nodes",
      seeds: [{ kind: "folder", data: { name: "new" }, summary: { count: -1 } }],
      toParentId: rootId,
      toIndex: 0,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("parse-failed");
      expect(result.error.issues?.[0]?.path).toBe("$.count");
    }
    expect(store.getGraph()).toBe(before);
  });

  it("keeps a valid summary, and the node survives a save and reload", () => {
    const { engine, store } = makeStore();
    const result = store.dispatch({
      type: "insert-nodes",
      seeds: [{ kind: "folder", data: { name: "new" }, summary: { count: 3 } }],
      toParentId: rootId,
      toIndex: 0,
    });
    expect(result.ok).toBe(true);

    const reloaded = engine.deserialize(engine.serialize(store.getGraph()));
    if (!reloaded.ok) throw new Error(reloaded.error.message);
    const node = getNode(reloaded.value.graph, parseNodeId("new"));
    expect(node?.sealed).toBe(false);
    expect(node !== undefined && !node.sealed && node.container ? node.summary : null).toEqual({
      count: 3,
    });
  });
});
