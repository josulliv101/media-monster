import { engine } from "@/lib/engine/engine";

/**
 * A document to render, until documents come from storage.
 *
 * THE WIRE FORMAT IS A FLAT NODE LIST — no recursion, no depth limit, and a
 * sealed container's children stay addressable. What `deserialize` receives
 * below is exactly that list, the shape a persistence layer will hand back; it
 * is never assembled through `insert-nodes`, which would prove nothing about
 * loading. The nested `TREE` is only how it is WRITTEN — at fifty-odd clips a
 * hand-kept flat list of ids and child arrays is where typos go to hide — and
 * `flatten` turns it into the wire form one-to-one.
 *
 * It has one unloaded collection on purpose. Everything else in this file is
 * arrangement; that one node is the engine's whole reason for existing — a
 * collection that knows the difference between "empty" and "not read yet", and
 * a rollup that says which of the two it is looking at. Render a board without
 * one and the certainty machinery is untested decoration.
 */

/**
 * THE TOON TOWN PROJECT from the main app, and only that project: the
 * Sequence 1 shots with every take, the Sequence 2 guard shot, the final
 * lip-synced cut, the Bank Robbery van takes, the location plates and every
 * character sheet.
 *
 * LEFT OUT ON PURPOSE: the project's "Joe" and "Reference" collections, whose
 * clips are the source film and face crops taken from it rather than renders.
 * Audio clips are left out too — a clip here is a video or a still.
 *
 * Video lengths are the files' own, measured with ffprobe; the app's
 * collection totals add up every take and would overstate a shot. A still
 * holds for 3 seconds, as it does in the app.
 */
const VIDEO = "https://res.cloudinary.com/drrxyckxi/video/upload";
const IMAGE = "https://res.cloudinary.com/drrxyckxi/image/upload";
const PROJECT = "timeline-gstudio001/LIdEO2P4EwWsn0ux1WmRAOvTDXu2/project-1785765266842-92sagu";
const STILL_SECONDS = 3;

type Media = Readonly<{ kind: "video" | "image"; src: string }>;
type ClipSeed = Readonly<{ clip: string; seconds: number; media: Media }>;
type CollectionSeed = Readonly<{
  collection: string;
  children?: readonly Seed[];
  /**
   * Present only on a collection that has NOT BEEN READ. These are the children
   * storage holds for it; the first document leaves them out, and they arrive
   * through `readUnreadChildren` when the board opens the collection.
   */
  unread?: readonly Seed[];
}>;
type Seed = ClipSeed | CollectionSeed;

const video = (title: string, version: string, file: string, seconds: number): ClipSeed => ({
  clip: title,
  seconds,
  media: { kind: "video", src: `${VIDEO}/${version}/${PROJECT}/${file}.mp4` },
});
const still = (title: string, version: string, file: string): ClipSeed => ({
  clip: title,
  seconds: STILL_SECONDS,
  media: { kind: "image", src: `${IMAGE}/${version}/${PROJECT}/${file}.png` },
});
const collection = (name: string, children: readonly Seed[]): CollectionSeed => ({
  collection: name,
  children,
});
/** A collection whose children stay in storage until it is opened. */
const unreadCollection = (name: string, unread: readonly Seed[]): CollectionSeed => ({
  collection: name,
  unread,
});

const TREE: CollectionSeed = collection("Toon Town", [
  collection("Sequence 1", [
    // EVERY TAKE IN ONE ROW, in shot order, rather than a folder per shot. The
    // four held two, one, four and two — small enough that the folder cost more
    // than it organised, and short enough that a row of them never ran off the
    // edge. The shot each take belongs to is in its name.
    collection("Shots, every take", [
      video("Shot 1 · lip-synced, letterboxed", "v1788783389", "SEQ1_SHOT1_LIPSYNCED_LB-1788783377886", 2.92),
      video("Shot 1 · M6A, reframed ref", "v1788706507", "SEQ1_M6_S01_CTLFIX_sage_s7734_00001_-1788706507014", 3.04),
      video("Shot 2 · Pat talks, full width", "v1788706515", "SEQ1_M6B_S02_1152_PATTALKS_s7734_00001_-1788706512869", 4.46),
      video("Shot 3 · Brian, lip-synced", "v1788726196", "SEQ1_SHOT3_LIPSYNCED-1788726185360", 5.17),
      video("Shot 3 · dialogue locked, s3701", "v1788716148", "SEQ1_M6B_S03_AUDIO_s3701_00001_-1788716148472", 5.17),
      video("Shot 3 · v2, s3701", "v1788711098", "SEQ1_M6B_S03_v2_s3701_00001_-1788711098066", 5.17),
      video("Shot 3 · v2, s3702", "v1788711100", "SEQ1_M6B_S03_v2_s3702_00001_-1788711098090", 5.17),
      video("Shot 4 · \"Let's roll\"", "v1788726198", "SEQ1_SHOT4_LIPSYNCED-1788726185360", 3.33),
      video("Shot 4 · end line, s4401", "v1788714152", "SEQ1_M6B_S04_ENDLINE_s4401_00001_-1788714151837", 3.75),
    ]),
    video("Sequence 1 · final cut", "v1788783391", "SEQ1_LIPSYNCED_FINAL_LB-1788783377886", 15.88),
  ]),
  collection("Sequence 2", [
    video("Guard reading", "v1788788452", "SEQ2_SHOT1_M6B_depth_s5101-1788788451873", 3.04),
  ]),
  collection("Bank Robbery", [
    collection("Van Interior", [
      video("Pat briefing", "v1786325925", "S01_pat_briefing_s303_20step-1786325912623", 10.13),
      video("First cloud render, seed 884", "v1786375176", "S02_cloud_s884_pixar_cast_first_cloud_render-1786375162483", 5.17),
      collection("Takes", [
        video("Pat close to lens, seed 885", "v1786377643", "S02_cloud_s885_pat_close_to_lens-1786377629850", 5.17),
        video("Sebastian, single role", "v1786383996", "S02SEB2_scail2_singlerole_native-1786383985757", 2.93),
        video("Van pan, seed 883", "v1786384167", "S02_h3_v8_seed883-1786384152917", 5.17),
      ]),
    ]),
  ]),
  // TWO COLLECTIONS, NOT SIX. The cast sheets were a folder per character,
  // five or so each: every row short, every folder the same shape. The split
  // that earns its keep is the one the story makes — who is in the van, and who
  // is outside it — so the sheets are grouped that way and each row is long
  // enough to run off the edge.
  collection("Characters", [
    collection("Leads", [
      still("Pat · neutral", "v1786237360", "lead_qw1_neutral-1786237344923"),
      still("Pat · base, 28-3 shirt", "v1786284091", "PAT_base_283_straight_faded_s7202-1786284082174"),
      still("Pat · hard stare", "v1786237400", "lead_qw2_hard_stare-1786237386248"),
      still("Pat · wry half-smile", "v1786237444", "lead_qw3_wry_halfsmile-1786237428182"),
      still("Pat · laughing", "v1786237490", "lead_qw4_laughing-1786237474721"),
      still("Brian · base", "v1786237137", "jim_v1_base-1786237121790"),
      still("Brian · crooked smirk", "v1786237269", "jim_v4_crooked_smirk-1786237252509"),
      still("Brian · laughing", "v1786237316", "jim_v5_laughing-1786237300129"),
      still("Brian · neutral", "v1786237183", "jim_v2_neutral-1786237168383"),
      still("Brian · angry glare", "v1786237223", "jim_v3_angry_glare-1786237208350"),
      still("Carmine · shamrock shirt", "v1786284122", "CARMINE_base_shamrock_small_s8101-1786284111633"),
      still("Carmine · buzz cut, stubble", "v1786241331", "heavy_v2_buzz_stubble-1786241313879"),
      still("Carmine · angry glare", "v1786242384", "heavy_v4_angry_glare-1786242376195"),
      still("Carmine · crooked smirk", "v1786242404", "heavy_v5_crooked_smirk-1786242396036"),
      still("Carmine · laughing", "v1786242425", "heavy_v6_laughing-1786242416293"),
      still("Carmine · neutral", "v1786241940", "heavy_v3_neutral-1786241924164"),
      still("Carmine · base", "v1786238388", "heavy_v1_base-1786238372298"),
      still("Sebastian · base", "v1786242566", "wiry_v1_base-1786242559048"),
      still("Sebastian · neutral", "v1786242584", "wiry_v2_neutral-1786242577082"),
      still("Sebastian · angry glare", "v1786242605", "wiry_v3_angry_glare-1786242596436"),
      still("Sebastian · crooked smirk", "v1786242624", "wiry_v4_crooked_smirk-1786242616525"),
      still("Sebastian · laughing", "v1786242644", "wiry_v5_laughing-1786242634754"),
    ]),
    collection("Guards", [
      still("Street Guard · base", "v1786243893", "sguard_v1_base-1786243862665"),
      still("Street Guard · neutral", "v1786243894", "sguard_v2_neutral-1786243864246"),
      still("Street Guard · bored", "v1786243895", "sguard_v3_bored-1786243870540"),
      still("Street Guard · alert", "v1786243896", "sguard_v4_alert-1786243872711"),
      still("Street Guard · alarm", "v1786243897", "sguard_v5_alarm-1786243879797"),
      still("Street Guard · recast", "v1788788915", "Guard3_v1_base-1788788914597"),
      still("Truck Guard · base", "v1786243804", "tguard_v1_base-1786243775845"),
      still("Truck Guard · neutral", "v1786243805", "tguard_v2_neutral-1786243778249"),
      still("Truck Guard · bored", "v1786243806", "tguard_v3_bored-1786243782969"),
      still("Truck Guard · alert", "v1786243807", "tguard_v4_alert-1786243785012"),
      still("Truck Guard · alarm", "v1786243808", "tguard_v5_alarm-1786243791044"),
    ]),
  ]),
  // NOT READ YET, and it says so. `children` is absent rather than empty, and
  // the stored `summary` is what the fold reports in its place — at certainty
  // "estimated", never as a measurement. Opening it reads the real children
  // (the project's location plates, empty sets with nobody in them, which is
  // what B-roll is) and the estimate becomes an exact total.
  unreadCollection("B-roll", [
    collection("Locations", [
      still("Street storefront row", "v1786244111", "loc_street_row-1786244087816"),
      still("Armoured truck cab", "v1786244110", "loc_armoured_truck_cab-1786244082080"),
      still("Van interior", "v1786244109", "loc_van_interior-1786244080409"),
      still("Bank exterior", "v1786244112", "loc_bank_exterior-1786244089386"),
      still("Bank lobby, high corner", "v1786244113", "loc_bank_lobby-1786244096076"),
      // The S08 street plate, converted to Pixar with Qwen-Image-Edit. It sits
      // in the project's "Joe" collection beside the source film, which is why
      // it was left out at first — but the plate itself is a render, and B-roll
      // is where an empty set belongs.
      still("Street plate · Pixar conversion", "v1785834645", "s08_plate_pixar-1785834627047"),
    ]),
  ]),
]);

type WireNode = Readonly<Record<string, unknown>>;

/** Every clip's seconds under a seed — what a stored summary would record. */
function secondsIn(seed: Seed): number {
  if ("clip" in seed) return seed.seconds;
  return [...(seed.children ?? []), ...(seed.unread ?? [])].reduce((sum, child) => sum + secondsIn(child), 0);
}

/**
 * The tree as the wire's flat node list, parents before children. Ids are
 * minted from the path of names, so they read like the board and stay stable
 * across edits to this file that do not rename anything.
 *
 * An unread collection's children go into a SEPARATE flat list, keyed by that
 * collection's id: the page storage would hand back when it is opened. They
 * share one id namespace with the main list, because once loaded they live in
 * the same graph and the engine refuses a payload that reuses an id.
 */
function flatten(root: CollectionSeed): {
  rootId: string;
  nodes: WireNode[];
  unread: Map<string, { rootIds: string[]; nodes: WireNode[] }>;
} {
  const used = new Set<string>();
  const unread = new Map<string, { rootIds: string[]; nodes: WireNode[] }>();
  const idFor = (path: readonly string[]): string => {
    const base = path
      .join("-")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    let id = base;
    for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
    used.add(id);
    return id;
  };
  const visit = (seed: Seed, path: readonly string[], into: WireNode[]): string => {
    if ("clip" in seed) {
      const id = idFor([...path, seed.clip]);
      into.push({
        id,
        kind: "clip",
        data: { title: seed.clip, seconds: seed.seconds, media: seed.media },
      });
      return id;
    }
    const here = [...path, seed.collection];
    const id = idFor(here);
    const node: Record<string, unknown> = { id, kind: "collection", data: { name: seed.collection } };
    into.push(node);
    if (seed.unread !== undefined) {
      // The summary is COMPUTED from what storage holds, so the estimate the
      // board shows before opening is the total it shows after.
      node.summary = { seconds: secondsIn(seed) };
      const page: WireNode[] = [];
      const rootIds = seed.unread.map((child) => visit(child, here, page));
      unread.set(id, { rootIds, nodes: page });
    } else {
      node.children = (seed.children ?? []).map((child) => visit(child, here, into));
    }
    return id;
  };
  const nodes: WireNode[] = [];
  return { rootId: visit(root, [], nodes), nodes, unread };
}

const FLAT = flatten(TREE);

const SCHEMA_VERSIONS = { clip: 4, collection: 2 };

const DOCUMENT = {
  formatVersion: 1 as const,
  schemaVersions: SCHEMA_VERSIONS,
  rootIds: [FLAT.rootId],
  nodes: FLAT.nodes,
};

/** The board's root, for the view that needs to name it. */
export const FIXTURE_ROOT_ID = FLAT.rootId;

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

/** How long the pretend storage read takes — long enough to see the loading state. */
const READ_DELAY_MS = 600;

/**
 * Read an unread collection's children from "storage": a FULL document whose
 * roots become that collection's children, which is the shape `store.load`
 * takes (a full document, so migrations run on lazy pages too).
 *
 * Async and delayed on purpose. Until documents come from a real backend this
 * stands in for one, and a synchronous answer would hide the loading state the
 * board has to handle. `null` means storage has nothing for that id.
 */
export async function readUnreadChildren(id: string): Promise<unknown> {
  await new Promise((resolve) => setTimeout(resolve, READ_DELAY_MS));
  const page = FLAT.unread.get(id);
  if (page === undefined) return null;
  return {
    formatVersion: 1 as const,
    schemaVersions: SCHEMA_VERSIONS,
    rootIds: page.rootIds,
    nodes: page.nodes,
  };
}
