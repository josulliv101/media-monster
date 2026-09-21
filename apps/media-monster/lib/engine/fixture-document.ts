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
/**
 * Real footage, from the Toon Town project in the main app: Sequence 1's four
 * finished shots, the guard shot from Sequence 2, and three location stills.
 * Lengths were measured from the files (ffprobe), not copied from the app's
 * collection totals, which add up every take in a shot.
 */
const VIDEO = "https://res.cloudinary.com/drrxyckxi/video/upload";
const IMAGE = "https://res.cloudinary.com/drrxyckxi/image/upload";
const PROJECT = "timeline-gstudio001/LIdEO2P4EwWsn0ux1WmRAOvTDXu2/project-1785765266842-92sagu";

const video = (version: string, file: string) => ({
  kind: "video",
  src: `${VIDEO}/${version}/${PROJECT}/${file}.mp4`,
});
const image = (version: string, file: string) => ({
  kind: "image",
  src: `${IMAGE}/${version}/${PROJECT}/${file}.png`,
});

const DOCUMENT = {
  formatVersion: 1 as const,
  schemaVersions: { clip: 2, collection: 1 },
  rootIds: ["reel"],
  nodes: [
    {
      id: "reel",
      kind: "collection",
      data: { name: "Toon Town" },
      children: ["seq-1", "c-guard", "locations", "b-roll"],
    },

    {
      id: "seq-1",
      kind: "collection",
      data: { name: "Sequence 1" },
      children: ["c-shot-1", "c-shot-2", "c-shot-3", "c-shot-4"],
    },
    {
      id: "c-shot-1",
      kind: "clip",
      data: {
        title: "Shot 1 · Pat, lip-synced",
        seconds: 2.92,
        media: video("v1788783389", "SEQ1_SHOT1_LIPSYNCED_LB-1788783377886"),
      },
    },
    {
      id: "c-shot-2",
      kind: "clip",
      data: {
        title: "Shot 2 · Pat talks, full width",
        seconds: 4.46,
        media: video("v1788706515", "SEQ1_M6B_S02_1152_PATTALKS_s7734_00001_-1788706512869"),
      },
    },
    {
      id: "c-shot-3",
      kind: "clip",
      data: {
        title: "Shot 3 · Brian, lip-synced",
        seconds: 5.17,
        media: video("v1788726196", "SEQ1_SHOT3_LIPSYNCED-1788726185360"),
      },
    },
    {
      id: "c-shot-4",
      kind: "clip",
      data: {
        title: "Shot 4 · \"Let's roll\"",
        seconds: 3.33,
        media: video("v1788726198", "SEQ1_SHOT4_LIPSYNCED-1788726185360"),
      },
    },

    {
      id: "c-guard",
      kind: "clip",
      data: {
        title: "Guard reading",
        seconds: 3.04,
        media: video("v1788788452", "SEQ2_SHOT1_M6B_depth_s5101-1788788451873"),
      },
    },

    {
      id: "locations",
      kind: "collection",
      data: { name: "Locations" },
      children: ["c-street", "c-van", "c-lobby"],
    },
    {
      id: "c-street",
      kind: "clip",
      data: {
        title: "Street storefront row",
        seconds: 3,
        media: image("v1786244111", "loc_street_row-1786244087816"),
      },
    },
    {
      id: "c-van",
      kind: "clip",
      data: {
        title: "Van interior",
        seconds: 3,
        media: image("v1786244109", "loc_van_interior-1786244080409"),
      },
    },
    {
      id: "c-lobby",
      kind: "clip",
      data: {
        title: "Bank lobby, high corner",
        seconds: 3,
        media: image("v1786244113", "loc_bank_lobby-1786244096076"),
      },
    },

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
