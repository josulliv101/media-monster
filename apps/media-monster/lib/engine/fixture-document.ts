import { engine } from "@/lib/engine/engine";

/**
 * A document to render, until documents come from storage.
 *
 * THE WIRE FORMAT IS A FLAT NODE LIST — no recursion, no depth limit, and a
 * sealed container's children stay addressable. Written out here the way it
 * would arrive rather than built with `insert-nodes` calls, because the shape
 * this app has to be able to LOAD is the thing worth exercising: a persistence
 * layer will hand back exactly this, and a fixture assembled through commands
 * would never prove `deserialize` works.
 *
 * It has one unloaded collection on purpose. Everything else in this file is
 * arrangement; that one node is the engine's whole reason for existing — a
 * collection that knows the difference between "empty" and "not read yet", and
 * a rollup that says which of the two it is looking at. Render a board without
 * one and the certainty machinery is untested decoration.
 */
const DOCUMENT = {
  formatVersion: 1 as const,
  schemaVersions: { clip: 1, collection: 1 },
  rootIds: ["reel"],
  nodes: [
    {
      id: "reel",
      kind: "collection",
      data: { name: "First reel" },
      children: ["opening", "c-wide", "b-roll"],
    },

    {
      id: "opening",
      kind: "collection",
      data: { name: "Opening" },
      children: ["c-establish", "c-push"],
    },
    { id: "c-establish", kind: "clip", data: { title: "Establishing, rooftop", seconds: 6 } },
    { id: "c-push", kind: "clip", data: { title: "Slow push, doorway", seconds: 4.5 } },

    { id: "c-wide", kind: "clip", data: { title: "Wide, street level", seconds: 8 } },

    // NOT READ YET, and it says so. `children` is absent rather than empty, and
    // the stored `summary` is what the fold reports in its place — at certainty
    // "estimated", never as a measurement. Opening this collection in a real app
    // is what would fetch its children and replace the estimate with a count.
    {
      id: "b-roll",
      kind: "collection",
      data: { name: "B-roll" },
      summary: { seconds: 42 },
    },
  ],
};

/**
 * Load it, once.
 *
 * `ok: true` IS NOT "EVERY NODE ARRIVED INTACT" — sealing is a success path, so
 * a document with a kind this app does not know still loads, with those nodes
 * held as raw bytes. `report.sealed` is the only way to tell, which is why it is
 * surfaced rather than dropped: a board that quietly renders fewer cards than
 * the document has is the failure this check exists to make visible.
 */
export function loadFixtureGraph() {
  const loaded = engine.deserialize(DOCUMENT);
  if (!loaded.ok) {
    // A fixture that does not load is a programming error here rather than bad
    // input — it ships with the app — so it fails loudly at module scope instead
    // of rendering an empty board.
    throw new Error(`fixture failed to load: ${loaded.error.message}`);
  }
  return { graph: loaded.value.graph, report: loaded.value.report };
}
