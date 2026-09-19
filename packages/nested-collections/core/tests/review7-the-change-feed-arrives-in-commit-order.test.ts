// Seventh review round — the change feed is a LOG, and a log has an order.
//
// `dispatch` committed the graph (notifying graph subscribers) and only then
// emitted the patch. A graph subscriber that dispatched in response ran its
// whole dispatch — commit AND emit — inside the first one's commit, so the
// feed carried the second patch before the first. A persistence layer
// replaying that feed applies a patch whose `before` does not match the graph
// it is replaying onto.
//
// The same inversion reached the feed from the other side: a change listener
// that dispatched delivered the nested patch to every listener AFTER it before
// they had seen the outer one. Both are one rule — every listener sees every
// patch, in the order the graph committed them.
import { describe, expect, it } from "vitest";

import {
  type ConsumerDefinedSummaryType,
  type Issue,
  type Patch,
  type Result,
  defineNodeType,
  parseNodeId,
} from "../index";
import { createEngine } from "../engine";

type Folder = Readonly<{ name: string }>;
type FolderEdit = Readonly<{ name: string }>;

const folderType = defineNodeType<Folder, FolderEdit>()({
  kind: "folder",
  container: true,
  schemaVersion: 1,
  parse(raw): Result<Folder, readonly Issue[]> {
    const name =
      typeof raw === "object" && raw !== null
        ? ({ ...raw } as Record<string, unknown>)["name"]
        : undefined;
    if (typeof name !== "string") {
      return { ok: false, error: [{ path: "$.name", message: "name" }] };
    }
    return { ok: true, value: { name } };
  },
  serialize(data): unknown {
    return { name: data.name };
  },
  applyEdit(_data, edit) {
    return { ok: true, value: { name: edit.name } };
  },
});

const types = [folderType] as const;
type Types = typeof types;

const summary: ConsumerDefinedSummaryType<null> = {
  parse: () => ({ ok: true, value: null }),
  serialize: () => null,
};

const engine = createEngine<Types, null, {}>({ types, summary, folds: {} });
const rootId = parseNodeId("root");

const makeStore = () => {
  const loaded = engine.deserialize({
    formatVersion: 1,
    schemaVersions: { folder: 1 },
    rootIds: ["root"],
    nodes: [{ id: "root", kind: "folder", data: { name: "a" }, children: [] }],
  });
  if (!loaded.ok) throw new Error(loaded.error.message);
  return engine.createStore(loaded.value.graph);
};

const rename = (name: string) =>
  ({
    type: "edit-nodes",
    edits: [{ nodeId: rootId, kind: "folder", edit: { name } }],
  }) as const;

describe("the change feed arrives in commit order", () => {
  it("when a graph subscriber dispatches in response to a commit", () => {
    const store = makeStore();
    const committed: Patch<Types, null>[] = [];
    const feed: Patch<Types, null>[] = [];

    store.subscribeToChanges((change) => feed.push(change.patch));
    let reacted = false;
    store.subscribeToGraph(() => {
      if (reacted) return;
      reacted = true;
      const nested = store.dispatch(rename("c"));
      if (nested.ok) committed.push(nested.value);
    });

    const outer = store.dispatch(rename("b"));
    if (!outer.ok) throw new Error(outer.error.message);
    // The outer commit happened FIRST; its dispatch just returned last.
    committed.unshift(outer.value);

    expect(feed).toEqual(committed);
  });

  it("for every listener when a change listener dispatches", () => {
    const store = makeStore();
    const first: Patch<Types, null>[] = [];
    const second: Patch<Types, null>[] = [];

    let reacted = false;
    store.subscribeToChanges((change) => {
      first.push(change.patch);
      if (reacted) return;
      reacted = true;
      store.dispatch(rename("c"));
    });
    store.subscribeToChanges((change) => second.push(change.patch));

    store.dispatch(rename("b"));

    expect(first).toHaveLength(2);
    expect(second).toEqual(first);
  });
});
