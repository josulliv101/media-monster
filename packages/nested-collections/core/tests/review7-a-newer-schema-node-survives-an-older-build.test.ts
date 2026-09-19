// Seventh review round — a document from a NEWER build.
//
// `runMigrations` used to hand a node declared at a version ABOVE the
// registry's straight to the older `parse`, on the theory that an additive
// change "reads fine". It does read fine — and then it saves. The older
// `serialize` writes only the fields it knows, and `serializeGraph` stamps the
// kind with the REGISTRY's version, so the newer build reloads v1-labelled
// bytes, re-runs its migrations over them, and the fields the newer build
// wrote are gone. Nothing sealed and nothing was reported.
//
// SEALED, not refused. A sealed node keeps its raw bytes AND its own
// `schemaVersion` on re-emit (see `serializeGraph`), so the document still
// opens during a rolling deploy, the node still moves and deletes, and the
// newer build reads back exactly what it wrote.
import { describe, expect, it } from "vitest";

import {
  type ConsumerDefinedSummaryType,
  type Issue,
  type Result,
  defineNodeType,
} from "../index";
import { createEngine } from "../engine";

type Folder = Readonly<{ name: string }>;

// Tolerant of unknown fields on purpose — the case the old comment promised
// "reads fine". A strict parse already sealed.
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

const summary: ConsumerDefinedSummaryType<null> = {
  parse: () => ({ ok: true, value: null }),
  serialize: () => null,
};

const makeEngine = () =>
  createEngine<readonly [typeof folderType], null, {}>({
    types: [folderType] as const,
    summary,
    folds: {},
  });

const newerDocument = {
  formatVersion: 1,
  schemaVersions: { folder: 2 },
  rootIds: ["root"],
  nodes: [
    { id: "root", kind: "folder", data: { name: "root" }, children: ["newer"] },
    {
      id: "newer",
      kind: "folder",
      data: { name: "from v2", color: "blue" },
      children: [],
    },
  ],
};

describe("a node written by a newer build survives an older one", () => {
  it("seals the node and reports why", () => {
    const loaded = makeEngine().deserialize(newerDocument);
    if (!loaded.ok) throw new Error(loaded.error.message);

    const sealed = loaded.value.report.sealed.map((entry) => entry.nodeId);
    expect(sealed).toContain("newer");
  });

  it("writes the newer fields and the newer version back unchanged", () => {
    const engine = makeEngine();
    const loaded = engine.deserialize(newerDocument);
    if (!loaded.ok) throw new Error(loaded.error.message);

    const written = engine.serialize(loaded.value.graph);
    const node = written.nodes.find((n) => n.id === "newer");
    expect(node?.data).toEqual({ name: "from v2", color: "blue" });
    // The node's own label, or the newer build would read these bytes as v1.
    expect(node?.schemaVersion ?? written.schemaVersions["folder"]).toBe(2);
  });

  it("still opens a current-version document without sealing anything", () => {
    const loaded = makeEngine().deserialize({
      ...newerDocument,
      schemaVersions: { folder: 1 },
    });
    if (!loaded.ok) throw new Error(loaded.error.message);
    expect(loaded.value.report.sealed).toEqual([]);
  });
});
