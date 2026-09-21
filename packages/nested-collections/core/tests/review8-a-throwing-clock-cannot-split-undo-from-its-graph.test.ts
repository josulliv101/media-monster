// Eighth review round — the clock is consumer code too.
//
// `undo` and `redo` moved the history stack and THEN read `ctx.now()`. A clock
// that threw escaped a method that promises a `Result`, after the entry was
// consumed and before the graph moved: the edit stayed on screen and the only
// record of how to reverse it was gone. `dispatch` read the clock before
// committing, so it lost nothing, but it threw all the same.
//
// A timestamp is metadata about a change, not the change. A throwing clock is
// reported and replaced with `Date.now()`, the way a throwing listener is
// reported and skipped — the edit and its history go through regardless.
import { afterEach, describe, expect, it, vi } from "vitest";

import { getNode, parseNodeId } from "../index";
import { createEngine } from "../engine";
import { countSummary, folderType, rootDocument } from "./_review8-fixture";

const rootId = parseNodeId("root");

afterEach(() => {
  vi.restoreAllMocks();
});

function makeStore() {
  let clockThrows = false;
  const engine = createEngine({
    types: [folderType] as const,
    summary: countSummary,
    folds: {},
    now() {
      if (clockThrows) throw new Error("clock failed");
      return 1;
    },
  });
  const loaded = engine.deserialize(rootDocument);
  if (!loaded.ok) throw new Error(loaded.error.message);
  return {
    store: engine.createStore(loaded.value.graph),
    breakClock: () => {
      clockThrows = true;
    },
  };
}

const rename = (name: string) =>
  ({ type: "edit-nodes", edits: [{ nodeId: rootId, kind: "folder", edit: { name } }] }) as const;

const nameOf = (graph: Parameters<typeof getNode>[0]) => {
  const node = getNode(graph, rootId);
  return node !== undefined && !node.sealed ? node.data : undefined;
};

describe("a throwing clock cannot split undo from its graph", () => {
  it("undo still reverses the edit, and redo is still there", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { store, breakClock } = makeStore();
    expect(store.dispatch(rename("edited")).ok).toBe(true);
    breakClock();

    const undone = store.undo();
    expect(undone.ok).toBe(true);
    expect(nameOf(store.getGraph())).toEqual({ name: "root" });
    expect(store.canRedo()).toBe(true);

    const redone = store.redo();
    expect(redone.ok).toBe(true);
    expect(nameOf(store.getGraph())).toEqual({ name: "edited" });
    expect(store.canUndo()).toBe(true);
  });

  it("dispatch returns a result instead of throwing, and reports the clock", () => {
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { store, breakClock } = makeStore();
    breakClock();

    const result = store.dispatch(rename("edited"));
    expect(result.ok).toBe(true);
    expect(store.canUndo()).toBe(true);
    expect(report).toHaveBeenCalled();
  });
});
