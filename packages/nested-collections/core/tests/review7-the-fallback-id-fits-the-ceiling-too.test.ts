// Seventh review round — the fallback id was exempt from the ceiling it exists
// to respect.
//
// `mintFreshId` retries a consumer `mintId` 64 times, refusing anything over
// `maxNodeIdLength`, and then falls back to `graph-node-N` — which its own
// comment called "short by construction, so it cannot itself trip the
// ceiling". It is twelve characters at minimum, and `maxNodeIdLength` accepts
// any positive integer. With a ceiling of 4, the insert succeeded, the save
// wrote the id, and `deserialize` refused the document it had just produced.
import { describe, expect, it } from "vitest";

import {
  type ConsumerDefinedSummaryType,
  type Issue,
  type Result,
  defineNodeType,
  parseNodeId,
} from "../index";
import { createEngine } from "../engine";

type Folder = Readonly<{ name: string }>;

const folderType = defineNodeType<Folder, never>()({
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
  applyEdit(data) {
    return { ok: true, value: data };
  },
});

const types = [folderType] as const;

const summary: ConsumerDefinedSummaryType<null> = {
  parse: () => ({ ok: true, value: null }),
  serialize: () => null,
};

// Every minted id is over the ceiling, so every insert reaches the fallback.
const makeEngine = (maxNodeIdLength: number) =>
  createEngine<typeof types, null, {}>({
    types,
    summary,
    folds: {},
    maxNodeIdLength,
    mintId: () => "far-too-long-for-the-ceiling",
  });

const document = {
  formatVersion: 1,
  schemaVersions: { folder: 1 },
  rootIds: ["root"],
  nodes: [{ id: "root", kind: "folder", data: { name: "r" }, children: [] }],
};

const insert = (count: number) =>
  ({
    type: "insert-nodes",
    toParentId: parseNodeId("root"),
    toIndex: 0,
    seeds: Array.from({ length: count }, () => ({
      kind: "folder" as const,
      data: { name: "n" },
    })),
  }) as const;

describe("the fallback id fits the ceiling too", () => {
  it("saves a document that loads back under a short ceiling", () => {
    const engine = makeEngine(4);
    const loaded = engine.deserialize(document);
    if (!loaded.ok) throw new Error(loaded.error.message);
    const store = engine.createStore(loaded.value.graph);

    const inserted = store.dispatch(insert(3));
    expect(inserted.ok).toBe(true);

    const reloaded = engine.deserialize(engine.serialize(store.getGraph()));
    expect(reloaded.ok).toBe(true);
  });

  it("refuses, typed, when no id that short is free", () => {
    // A ceiling of 1 has 36 base-36 ids. `root` is 4 characters, so this
    // ceiling cannot even hold the fixture — load with a one-character root.
    const engine = makeEngine(1);
    const loaded = engine.deserialize({
      ...document,
      rootIds: ["r"],
      nodes: [{ ...document.nodes[0], id: "r" }],
    });
    if (!loaded.ok) throw new Error(loaded.error.message);
    const store = engine.createStore(loaded.value.graph);

    const result = store.dispatch({ ...insert(40), toParentId: parseNodeId("r") });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("would-exceed-max-node-id-length");
    }
  });
});
