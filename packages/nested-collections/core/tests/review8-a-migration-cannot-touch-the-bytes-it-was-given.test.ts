// Eighth review round — migrations were handed the document's own objects.
//
// `runMigrations` passed the wire value straight in. A migration that edited
// it in place and then threw sealed the node — and the sealed `raw`, which is
// promised byte-exact, was that same object, already edited. The save wrote
// the half-migrated value and the original was gone. A migration that edited in
// place and SUCCEEDED changed the caller's input document as a side effect.
//
// Migrations now run on a copy. The wire value is never written to.
import { describe, expect, it } from "vitest";

import { defineNodeType } from "../index";
import { createEngine } from "../engine";
import { countSummary } from "./_review8-fixture";

type Box = Readonly<{ n: number }>;

const document = (data: unknown) => ({
  formatVersion: 1,
  schemaVersions: { box: 1 },
  rootIds: ["root"],
  nodes: [{ id: "root", kind: "box", data, children: [] }],
});

const boxType = (migrate: (raw: Record<string, unknown>) => unknown) =>
  defineNodeType<Box, never>()({
    kind: "box",
    container: true,
    schemaVersion: 2,
    migrations: {
      2: (raw) => migrate(raw as Record<string, unknown>),
    },
    parse(raw) {
      const n =
        typeof raw === "object" && raw !== null
          ? ({ ...raw } as Record<string, unknown>)["n"]
          : undefined;
      return typeof n === "number"
        ? { ok: true, value: { n } }
        : { ok: false, error: [{ path: "$.n", message: "n" }] };
    },
    serialize: (data) => ({ n: data.n }),
    applyEdit: (data) => ({ ok: true, value: data }),
  });

const engineFor = (type: ReturnType<typeof boxType>) =>
  createEngine({ types: [type] as const, summary: countSummary, folds: {} });

describe("a migration cannot touch the bytes it was given", () => {
  it("a migration that edits in place and throws seals the ORIGINAL bytes", () => {
    const engine = engineFor(
      boxType((raw) => {
        raw["n"] = 999;
        throw new Error("migration failed");
      }),
    );
    const loaded = engine.deserialize(document({ n: 1 }));
    if (!loaded.ok) throw new Error(loaded.error.message);

    expect(loaded.value.report.sealed).toHaveLength(1);
    expect(engine.serialize(loaded.value.graph).nodes[0]?.data).toEqual({ n: 1 });
  });

  it("a migration that edits in place and succeeds leaves the input document alone", () => {
    const engine = engineFor(
      boxType((raw) => {
        raw["n"] = Number(raw["n"]) + 1;
        return raw;
      }),
    );
    const input = document({ n: 1 });
    const loaded = engine.deserialize(input);
    if (!loaded.ok) throw new Error(loaded.error.message);

    expect(engine.serialize(loaded.value.graph).nodes[0]?.data).toEqual({ n: 2 });
    expect(input.nodes[0]?.data).toEqual({ n: 1 });
  });
});
