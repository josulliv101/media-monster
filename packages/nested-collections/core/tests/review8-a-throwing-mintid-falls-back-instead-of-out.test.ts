// Eighth review round — `mintId` was the one consumer callback left unguarded.
//
// Every other callback a consumer hands the engine (parse, serialize,
// contentKey, sourceKey, applyEdit, listeners) is caught and turned into a
// rejection or a report. `mintId` was called bare, so an id allocator that
// threw made `dispatch` throw — out of a method whose whole contract is that it
// returns a `Result`.
//
// A throw is treated as what it is, an allocator that cannot produce an id: it
// is reported once and the deterministic fallback takes over, exactly as for an
// allocator that keeps returning unusable ids.
import { afterEach, describe, expect, it, vi } from "vitest";

import { getChildren, parseNodeId } from "../index";
import { createEngine } from "../engine";
import { countSummary, folderType, rootDocument } from "./_review8-fixture";

const rootId = parseNodeId("root");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a throwing mintId falls back instead of out", () => {
  it("inserts with a fallback id, reports once, and the document reloads", () => {
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let calls = 0;
    const engine = createEngine({
      types: [folderType] as const,
      summary: countSummary,
      folds: {},
      mintId: () => {
        calls += 1;
        throw new Error("id allocation unavailable");
      },
    });
    const loaded = engine.deserialize(rootDocument);
    if (!loaded.ok) throw new Error(loaded.error.message);
    const store = engine.createStore(loaded.value.graph);

    const result = store.dispatch({
      type: "insert-nodes",
      seeds: [{ kind: "folder", data: { name: "new" } }],
      toParentId: rootId,
      toIndex: 0,
    });

    expect(result.ok).toBe(true);
    expect(getChildren(store.getGraph(), rootId)).toHaveLength(1);
    // Not retried 64 times: a throw is not a bad draw.
    expect(calls).toBe(1);
    expect(report).toHaveBeenCalledTimes(1);
    expect(engine.deserialize(engine.serialize(store.getGraph())).ok).toBe(true);
  });
});
