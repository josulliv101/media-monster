// Eighth review round — a hole in a seed array.
//
// `buildSeedPlacements` skipped a missing seed with `continue` but still
// counted its slot, so `[ , seed]` inserted the node at position 0 and recorded
// it at position 1. The patch disagreed with the graph it described: undo
// refused it with `index-out-of-range`, and anything replaying the change feed
// would fail the same way. With `maxDepth` set it was worse — the depth walk
// runs first and read `.children` off the hole, so `dispatch` threw.
//
// A seed that is not there is refused, whichever walk meets it first. There is
// no honest position to give it and no honest way to close the gap.
import { describe, expect, it } from "vitest";

import { getChildren, parseNodeId, type Seed } from "../index";
import { createEngine } from "../engine";
import { type Count, countSummary, folderType, rootDocument } from "./_review8-fixture";

type Types = readonly [typeof folderType];
const rootId = parseNodeId("root");

const makeStore = (maxDepth?: number) => {
  const engine = createEngine({
    types: [folderType] as const,
    summary: countSummary,
    folds: {},
    ...(maxDepth === undefined ? {} : { maxDepth }),
  });
  const loaded = engine.deserialize(rootDocument);
  if (!loaded.ok) throw new Error(loaded.error.message);
  return engine.createStore(loaded.value.graph);
};

const sparse = (): Seed<Types, Count>[] => {
  const seeds: Seed<Types, Count>[] = new Array(2);
  seeds[1] = { kind: "folder", data: { name: "new" } };
  return seeds;
};

describe("a missing seed is refused, not skipped", () => {
  it.each([
    ["without a depth ceiling", undefined],
    ["with a depth ceiling", 10],
  ])("at the top level, %s", (_label, maxDepth) => {
    const store = makeStore(maxDepth);
    const before = store.getGraph();

    const result = store.dispatch({
      type: "insert-nodes",
      seeds: sparse(),
      toParentId: rootId,
      toIndex: 0,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("parse-failed");
    expect(store.getGraph()).toBe(before);
    expect(store.canUndo()).toBe(false);
  });

  it.each([
    ["without a depth ceiling", undefined],
    ["with a depth ceiling", 10],
  ])("among a seed's children, %s", (_label, maxDepth) => {
    const store = makeStore(maxDepth);
    const result = store.dispatch({
      type: "insert-nodes",
      seeds: [{ kind: "folder", data: { name: "parent" }, children: sparse() }],
      toParentId: rootId,
      toIndex: 0,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("parse-failed");
    expect(getChildren(store.getGraph(), rootId)).toEqual([]);
  });

  it("still inserts a dense batch, and undo takes it back out", () => {
    const store = makeStore();
    const result = store.dispatch({
      type: "insert-nodes",
      seeds: [
        { kind: "folder", data: { name: "a" } },
        { kind: "folder", data: { name: "b" } },
      ],
      toParentId: rootId,
      toIndex: 0,
    });
    expect(result.ok).toBe(true);
    expect(store.undo().ok).toBe(true);
    expect(getChildren(store.getGraph(), rootId)).toEqual([]);
  });
});
