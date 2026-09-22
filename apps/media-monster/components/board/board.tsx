"use client";

import { useState } from "react";
import { parseNodeId } from "@josulliv101/nested-collections";
import { Redo2, Undo2 } from "lucide-react";

import {
  NodeSlot,
  Provider,
  defineNodeView,
  useChildren,
  useDispatch,
  useFold,
  useHistory,
  useIsSelected,
  useNode,
  useSelectionActions,
  useStore,
} from "@/lib/engine/bindings";
import { engine } from "@/lib/engine/engine";
import {
  FIXTURE_ROOT_ID,
  loadFixtureGraph,
  readUnreadChildren,
} from "@/lib/engine/fixture-document";
import { BoardFilmStrip } from "./board-film-strip";
import { imageUrl, videoFrameUrl } from "@/lib/media/cloudinary";
import type { ClipMedia, NodeTypes } from "@/lib/engine/node-types";
import type { NodeViewProps } from "@josulliv101/nested-collections/react";
import { cn } from "@/lib/utils";

/**
 * The board: the engine, rendering.
 *
 * FIRST HOST FOR `@josulliv101/nested-collections`. Until now the package had
 * exactly one consumer in the repo and it was Storybook. This is the app
 * actually holding a document, folding it, and mutating it through the one
 * command path.
 *
 * WHAT IT DELIBERATELY IS NOT, so the gap is a decision rather than an oversight:
 * there is no drag and drop, no persistence and no routing. The document is a
 * fixture and every change is lost on reload. Those are the next three pieces
 * and each is larger than this one; what this proves is that the engine runs
 * here, with this app's own kinds, and that its uncertainty machinery survives
 * the trip to the screen.
 *
 * BOTH VIEWS ARE REGISTERED IN THIS FILE, at module scope, and that is not
 * laziness. `defineNodeView` mutates a registry and returns nothing, so
 * registration is a side effect with an ordering requirement: a kind registered
 * after its first render logs an error and renders nothing until the next one.
 * Keeping the registrations in the same module as the component that mounts the
 * provider is what makes "registered before anything renders" true by
 * construction rather than by import order.
 */

/** How the app writes a duration. Seconds under a minute, m:ss above. */
function formatSeconds(total: number): string {
  if (total < 60) {
    // One decimal only when there is one — "4.5s" is information, "8.0s" is
    // noise pretending to be precision.
    return `${Number.isInteger(total) ? total : total.toFixed(1)}s`;
  }
  const minutes = Math.floor(total / 60);
  const seconds = Math.round(total % 60);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/**
 * A duration, and how much of it is actually known.
 *
 * THE CERTAINTY IS RENDERED, not swallowed, and this component exists so that it
 * cannot quietly stop being. A fold over a subtree with an unread branch comes
 * back `"estimated"`; printing its number bare would be the exact failure the
 * engine's four-state children design exists to prevent — a total that looks
 * measured because nothing in the UI was obliged to say otherwise.
 *
 * "at least" rather than "about" for `partial`: partial means some branch
 * contributed nothing at all, so the true total can only be larger.
 */
function Duration({
  value,
  certainty,
}: Readonly<{ value: number; certainty: "exact" | "estimated" | "partial" }>) {
  const prefix =
    certainty === "exact" ? "" : certainty === "estimated" ? "about " : "at least ";
  return (
    <span
      className={cn(
        "tabular-nums",
        certainty === "exact" ? "text-zinc-400" : "text-amber-400/90",
      )}
      title={
        certainty === "exact"
          ? "Every clip in this subtree was counted"
          : "Part of this subtree has not been read, so this is not a measurement"
      }
    >
      {prefix}
      {formatSeconds(value)}
    </span>
  );
}

const THUMB = { width: 480, height: 270 } as const;

/**
 * The picture on a clip card: the VIDEO itself for a video clip, playing muted
 * while the pointer is over it, and the still for an image clip.
 *
 * `preload="none"` with a Cloudinary frame grab as the poster, so a board of
 * forty cards costs forty small jpegs until someone hovers — not forty video
 * downloads. The poster is taken a third of a second in, past the black first
 * frame many generated clips open on.
 */
function ClipPicture({ media, seconds }: Readonly<{ media: ClipMedia | null; seconds: number }>) {
  const frame = "aspect-video w-full bg-zinc-900 object-cover";
  if (media === null) {
    return (
      <div className={cn(frame, "grid place-items-center text-xs text-zinc-600")}>No media</div>
    );
  }
  if (media.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- a Cloudinary transform is already the optimised image
    return <img src={imageUrl(media.src, THUMB) ?? media.src} alt="" className={frame} />;
  }
  return (
    <video
      src={media.src}
      poster={videoFrameUrl(media.src, Math.min(0.35, seconds / 2), THUMB) ?? undefined}
      muted
      loop
      playsInline
      preload="none"
      className={frame}
      onPointerEnter={(event) => {
        void event.currentTarget.play().catch(() => undefined);
      }}
      onPointerLeave={(event) => {
        event.currentTarget.pause();
        event.currentTarget.currentTime = 0;
      }}
    />
  );
}

/**
 * DECLARED, THEN REGISTERED — not written inline in the `defineNodeView` call.
 * The React Compiler only recognises a component it can see as one: a
 * function expression passed as an argument is skipped, and these two are the
 * most-rendered components on the page.
 */
function ClipCard({ id, data }: NodeViewProps<NodeTypes, "clip">) {
  const selected = useIsSelected(id);
  const selection = useSelectionActions();
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => selection.toggle(id)}
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-lg border text-left transition-colors",
        selected
          ? "border-sky-400/60 bg-sky-400/10 text-zinc-50"
          : "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900",
      )}
    >
      <ClipPicture media={data.media} seconds={data.seconds} />
      <span className="flex items-baseline justify-between gap-3 px-3 py-2">
        <span className="min-w-0 truncate text-sm">{data.title}</span>
        <span className="shrink-0 text-xs tabular-nums text-zinc-500">
          {formatSeconds(data.seconds)}
        </span>
      </span>
    </button>
  );
}

defineNodeView("clip", ClipCard);

function CollectionCard({ id, data }: NodeViewProps<NodeTypes, "collection">) {
  const node = useNode(id);
  const children = useChildren(id);
  const total = useFold("seconds", id);
  const dispatch = useDispatch();
  const store = useStore();
  const [rejection, setRejection] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  // AN UNREAD COLLECTION IS NOT AN EMPTY ONE, and this is the only place the app
  // can tell them apart. `useChildren` returns nothing for both — there are no
  // child ids to hand back either way — so emptiness alone would render "B-roll"
  // as a folder somebody emptied.
  //
  // READ THE NODE'S OWN LOAD STATE, not the fold's certainty. This used to infer
  // "unread" from `estimated`, which only a STORED SUMMARY produces: an unread
  // collection with no summary folds to `partial` instead, and rendered "Empty."
  // `children.status` is the fact itself. Narrowed on `sealed` first, because a
  // sealed node's `container` comes off the wire and cannot discriminate; a
  // sealed leaf carries `null`, which reads as loaded — it has no children.
  const childrenState =
    node === undefined ? null : node.sealed || node.container ? node.children : null;
  const loadState = childrenState?.status ?? "loaded";
  const unread = loadState === "unloaded" || loadState === "reference";
  const summarized = total?.certainty === "estimated";

  // OPENING READS IT. `store.load` is IO landing: no patch, no history entry,
  // no change-feed event — loading is not an edit, so Undo does not un-read it.
  // The fold re-renders on its own because the load bumps the subtree revision
  // up the ancestor chain, which is how the estimate turns exact everywhere.
  const open = async () => {
    setReading(true);
    setRejection(null);
    const doc = await readUnreadChildren(id);
    if (doc === null) {
      // Storage has nothing for it. Recorded as missing rather than left unread,
      // so the board stops offering to open something that cannot be read.
      store.markMissing(id, "storage has no children for this collection");
    } else {
      const loaded = store.load(id, doc);
      if (!loaded.ok) setRejection(`${loaded.error.code}: ${loaded.error.message}`);
    }
    setReading(false);
  };

  const addClip = () => {
    const result = dispatch({
      type: "insert-nodes",
      toParentId: id,
      toIndex: children.length,
      seeds: [{ kind: "clip", data: { title: "Untitled clip", seconds: 3, media: null } }],
    });
    // EVERY FAILURE IS A TYPED RESULT, never a throw — so a refusal has to be
    // read to be noticed. Inserting into an unread collection is refused with
    // `target-not-loaded`, which is correct and is exactly the case a board
    // would otherwise "succeed" at by writing into a parent whose real children
    // it has never seen.
    setRejection(result.ok ? null : `${result.error.code}: ${result.error.message}`);
  };

  return (
    // `col-span-full`: a collection nested in another sits in its parent's grid
    // of clip cards, and takes a whole row rather than one card's column.
    <section className="col-span-full rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
      <header className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="truncate text-sm font-semibold text-zinc-100">
          {data.name}
        </h3>
        {total ? (
          <Duration value={total.value} certainty={total.certainty} />
        ) : null}
      </header>

      {unread ? (
        <p className="rounded-lg border border-dashed border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-300/80">
          {summarized
            ? "Not read yet. Its stored summary is answering for it."
            : "Not read yet, and nothing is stored about what it holds."}{" "}
          <button
            type="button"
            onClick={() => void open()}
            disabled={reading}
            className="ml-1 rounded-md border border-amber-400/40 px-2 py-0.5 text-amber-200 transition-colors hover:border-amber-300 hover:text-amber-100 disabled:cursor-wait disabled:opacity-60"
          >
            {reading ? "Reading…" : "Open"}
          </button>
        </p>
      ) : loadState === "missing" ? (
        <p className="px-1 py-2 text-xs text-zinc-500">Gone from storage.</p>
      ) : children.length === 0 ? (
        <p className="px-1 py-2 text-xs text-zinc-600">Empty.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3">
          {children.map((childId) => (
            <NodeSlot key={childId} id={childId} />
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={addClip}
          className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-100"
        >
          Add clip
        </button>
        {rejection ? (
          <span role="status" className="truncate text-xs text-red-400">
            {rejection}
          </span>
        ) : null}
      </div>
    </section>
  );
}

defineNodeView("collection", CollectionCard);

function Toolbar({ rootId }: Readonly<{ rootId: ReturnType<typeof parseNodeId> }>) {
  const { canUndo, canRedo, undo, redo } = useHistory();
  const total = useFold("seconds", rootId);
  const button =
    "flex items-center gap-1.5 rounded-md border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-700 hover:text-zinc-50 disabled:cursor-not-allowed disabled:border-zinc-900 disabled:text-zinc-700";
  return (
    <div className="mb-4 flex items-center gap-2">
      <button type="button" disabled={!canUndo} onClick={() => undo()} className={button}>
        <Undo2 className="size-3.5" /> Undo
      </button>
      <button type="button" disabled={!canRedo} onClick={() => redo()} className={button}>
        <Redo2 className="size-3.5" /> Redo
      </button>
      {total ? (
        <span className="ml-2 text-xs">
          Reel runs <Duration value={total.value} certainty={total.certainty} />
        </span>
      ) : null}
    </div>
  );
}

export function Board() {
  // ONE STORE FOR THE LIFE OF THE MOUNT. Built in a lazy initializer rather than
  // at module scope so React Strict Mode's double render does not build two, and
  // so a future document id can key it. `loadFixtureGraph` throws on a fixture
  // that does not parse, which is what should happen — it ships with the app.
  const [{ store, sealed }] = useState(() => {
    const { graph, report } = loadFixtureGraph();
    return { store: engine.createStore(graph), sealed: report.sealed };
  });
  const rootId = parseNodeId(FIXTURE_ROOT_ID);

  return (
    <Provider store={store}>
      {/* SEALING IS A SUCCESS PATH, so `ok: true` alone would have said nothing.
          A node whose kind this app does not know keeps its bytes and stays
          movable, and the board simply renders fewer cards than the document
          has. Saying so is the difference between a bug and a known state. */}
      {sealed.length > 0 ? (
        <p className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          {sealed.length} node{sealed.length === 1 ? "" : "s"} could not be read
          by this version and {sealed.length === 1 ? "is" : "are"} held as-is.
        </p>
      ) : null}
      <Toolbar rootId={rootId} />
      <NodeSlot id={rootId} />
      {/* PINNED TO THE BOTTOM OF THE VIEWPORT. The strip is the reel's timeline,
          so it stays in reach while the board scrolls above it. `sticky` rather
          than `fixed`: it keeps its place in the page's width (beside the rail,
          inside `main`'s padding) with no offsets to keep in step, and it
          settles into its own spot at the end of the board. The background is
          the page's, so cards scrolling under it do not show through. */}
      <div className="sticky bottom-0 z-40 mt-6 bg-zinc-950 pt-3 pb-4">
        <BoardFilmStrip />
      </div>
    </Provider>
  );
}
