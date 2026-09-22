"use client";

import { createContext, use, useId, useState, useSyncExternalStore } from "react";
import {
  documentOrder,
  getNode,
  getParent,
  parseNodeId,
  tryParseNodeId,
  type NodeId,
} from "@josulliv101/nested-collections";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Focus, Redo2, Undo2 } from "lucide-react";

import {
  NodeSlot,
  Provider,
  defineNodeView,
  useChildren,
  useDispatch,
  useFold,
  useGraph,
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
import type { FilmStripSize } from "@storyboard/ui/film-strip";
import {
  readFilmStripSize,
  subscribeFilmStripSize,
} from "@/components/settings/film-strip-size-store";
import {
  readBoardLayout,
  subscribeBoardLayout,
} from "@/components/settings/board-layout-store";
import type { BoardLayout } from "@/components/settings/board-layout-preference";
import { imageUrl, videoFrameUrl } from "@/lib/media/cloudinary";
import { switchedOffAt } from "@/lib/engine/branch-activity";
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
/**
 * HOW THE BOARD LAYS CLIPS OUT, as context rather than a prop.
 *
 * A view registered with `defineNodeView` is rendered by the engine's
 * `NodeSlot`, which hands it a node and nothing else — there is no call site to
 * pass this down through. Context is the seam that exists for exactly that, and
 * the value changes about as often as somebody opens the settings dialog.
 */
const BoardLayoutContext = createContext<BoardLayout>("grid");

/**
 * WHICH COLLECTION IS STANDING IN FOR THE ROOT, and how to change it.
 *
 * "Go to" on a collection makes it the top of the board: everything above it
 * goes, everything inside it stays. Context for the reason the layout is: the
 * cards are rendered by the engine's `NodeSlot` and cannot be handed props.
 * `focus(null)` goes back to the real root.
 */
type BoardFocus = Readonly<{
  shownRootId: NodeId | null;
  focus: (id: NodeId | null) => void;
}>;
const BoardFocusContext = createContext<BoardFocus>({
  shownRootId: null,
  focus: () => undefined,
});

/**
 * The collection named in the URL, if it is one this board can show.
 *
 * NOT TRUSTED: it came from the address bar. An id that does not parse, does
 * not exist, or names a clip or a sealed node falls back to the real root
 * rather than rendering a board with nothing on it — which is also what a
 * bookmark into a B-roll folder does after a reload, since loaded children do
 * not survive one.
 */
function resolveFocus(graph: ReturnType<typeof useGraph>, raw: string | null): NodeId | null {
  if (raw === null) return null;
  const parsed = tryParseNodeId(raw);
  if (!parsed.ok) return null;
  const node = getNode(graph, parsed.value);
  return node !== undefined && !node.sealed && node.kind === "collection" ? parsed.value : null;
}

/**
 * WHETHER THE BRANCH ABOVE IS IN THE CUT, handed down the tree.
 *
 * Each collection passes on whether it — and everything over it — is on, and
 * if not, which row switched it off. Clip cards dim from it, and a child row
 * disables its own switch from it, without anybody walking up the graph. The
 * board seeds it for whatever it shows as the root, so a view "gone to" inside
 * a switched-off branch starts off.
 */
type Branch = Readonly<{ offBy: NodeId | null; offByName: string | null }>;
const ON: Branch = { offBy: null, offByName: null };
const BranchContext = createContext<Branch>(ON);

/** A clip card's width in a row, where the grid's `1fr` has no meaning: the
 *  cards run off the edge instead of sharing the width. */
const ROW_CARD_WIDTH = "w-56";

function ClipCard({ id, data }: NodeViewProps<NodeTypes, "clip">) {
  const selected = useIsSelected(id);
  const selection = useSelectionActions();
  const branch = use(BranchContext);

  // DIMMED WHEN ITS BRANCH IS OFF, UNTIL YOU REACH FOR IT: hovering the card or
  // focusing it lifts the dim, so a clip out of the cut still reads normally
  // while you look at it. The switch is on the row above, not here.
  const dimmed =
    branch.offBy === null
      ? null
      : "opacity-35 grayscale group-hover/clip:opacity-100 group-hover/clip:grayscale-0 group-focus-within/clip:opacity-100 group-focus-within/clip:grayscale-0";

  return (
    <div
      data-clip-card
      data-in-cut={branch.offBy === null}
      title={branch.offByName === null ? undefined : `Not in the film strip: ${branch.offByName} is off`}
      className={cn(
        "group/clip flex flex-col overflow-hidden rounded-lg border transition-colors",
        selected
          ? "border-sky-400/60 bg-sky-400/10 text-zinc-50"
          : "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900",
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => selection.toggle(id)}
        className="flex w-full flex-col text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-500"
      >
        <span className={cn("block transition-[opacity,filter] duration-150", dimmed)}>
          <ClipPicture media={data.media} seconds={data.seconds} />
        </span>
        <span
          className={cn(
            "flex items-baseline justify-between gap-3 px-3 py-2 transition-opacity duration-150",
            dimmed,
          )}
        >
          <span className="min-w-0 truncate text-sm">{data.title}</span>
          <span className="shrink-0 text-xs tabular-nums text-zinc-500">
            {formatSeconds(data.seconds)}
          </span>
        </span>
      </button>
    </div>
  );
}

/**
 * The on/off switch a row wears: a track, and a knob that slides right when on.
 * Drawn only; the button around it owns the semantics.
 */
function SwitchTrack({ on }: Readonly<{ on: boolean }>) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-150",
        on ? "bg-sky-500" : "bg-zinc-700",
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 size-3 rounded-full bg-white shadow transition-transform duration-150 motion-reduce:transition-none",
          on ? "translate-x-3" : "translate-x-0",
        )}
      />
    </span>
  );
}


function CollectionCard({ id, data }: NodeViewProps<NodeTypes, "collection">) {
  const node = useNode(id);
  const children = useChildren(id);
  const graph = useGraph();
  const layout = use(BoardLayoutContext);
  const total = useFold("seconds", id);
  const dispatch = useDispatch();
  const store = useStore();
  const [rejection, setRejection] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  // OPEN OR CLOSED ON THE BOARD, and nothing more: a view preference held by
  // the card, not a document edit. The engine never hears about it, so it is
  // not undoable and does not touch the film strip, which is the whole reel
  // whatever the board is showing. Resets on reload.
  //
  // STARTS CLOSED, so the board opens as an outline — every collection a bar
  // you can open — rather than a wall of cards. The ROOT is the exception: it
  // is the board itself, and closing it would leave one bar on an empty page.
  // "Root" means whatever the board is SHOWING as its root: after "go to", the
  // collection you went to opens, and everything inside it starts closed.
  const { shownRootId, focus } = use(BoardFocusContext);
  const branch = use(BranchContext);

  // IN THE CUT, per branch. `data.active` is this row's own setting; it counts
  // only while everything above is on. A row under a switched-off parent shows
  // OFF and cannot be flipped, but keeps its own setting for when the parent
  // comes back on — the edit below never touches a child.
  const parentOff = branch.offBy !== null;
  const on = !parentOff && data.active;
  const childBranch: Branch = parentOff
    ? branch
    : data.active
      ? ON
      : { offBy: id, offByName: data.name };
  const toggleActive = () => {
    dispatch({
      type: "edit-nodes",
      edits: [{ nodeId: id, kind: "collection", edit: { active: !data.active } }],
    });
  };
  const isRoot = id === (shownRootId ?? graph.rootIds[0]);
  const [collapsed, setCollapsed] = useState(!isRoot);
  const bodyId = useId();

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

  // Split once, read by the row layout below. A sealed child's kind came off
  // the wire and cannot be trusted to name a view, so it is grouped with the
  // clips — it draws as a card either way.
  const clipIds = children.filter((childId) => {
    const child = getNode(graph, childId);
    return child === undefined || child.sealed || child.kind !== "collection";
  });
  const collectionIds = children.filter((childId) => !clipIds.includes(childId));
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
    //
    // TIGHTER PADDING ON A PHONE, and the saving compounds: collections nest,
    // so every level charges the cards inside it twice over — three deep at
    // 12px was 72px of a 375px screen before a card was drawn.
    //
    // INDENTED ON THE LEFT ONLY. A nested collection drops its right padding and
    // right border, so it runs to its parent's content edge, and so does the one
    // inside it: every row ends on one line whatever its depth, and the switches
    // at the ends of the rows line up exactly. Each level used to step in 13px on
    // the right as well, which staggered them. The depth still reads from the
    // left, where the names step in. The row shown as the root keeps its box.
    <section
      className={cn(
        "col-span-full border border-zinc-800 bg-zinc-950/60 p-2 md:p-3",
        isRoot ? "rounded-xl" : "rounded-l-xl border-r-0 pr-0 md:pr-0",
      )}
    >
      {/* THE WHOLE BAR TOGGLES: name, duration and the space between them are
          one button. It bleeds 6px into the card's padding on three sides
          (block boxes, so the negative margins widen the bar rather than
          shrinking anything's natural width) and pads back by the same 6px,
          so the text sits exactly where the padding put it. The hover tint and
          focus ring then read as the bar, not as a tight box round the name. */}
      <header
        className={cn("-mx-1.5 -mt-1.5 flex items-stretch gap-1", collapsed ? "-mb-1.5" : "mb-0.5")}
      >
        <h3 className="min-w-0 flex-1 text-sm font-semibold text-zinc-100">
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            data-collection-toggle
            onClick={() => setCollapsed((was) => !was)}
            className="group flex w-full items-baseline justify-between gap-3 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-zinc-800/60 focus-visible:bg-zinc-800/60 focus-visible:outline-2 focus-visible:outline-sky-500"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {/* Points right when closed and down when open; brightens with
                  the bar on hover and focus. */}
              <svg
                viewBox="0 0 10 10"
                aria-hidden="true"
                className={cn(
                  "size-2.5 shrink-0 fill-zinc-500 transition-[rotate,fill] duration-150 group-hover:fill-zinc-100 group-focus-visible:fill-zinc-100 motion-reduce:transition-none",
                  collapsed ? null : "rotate-90",
                )}
              >
                <path d="M2.5 1 L8.5 5 L2.5 9 Z" />
              </svg>
              <span className={cn("truncate", on ? null : "text-zinc-500")}>{data.name}</span>
            </span>
            {total ? (
              <span className="shrink-0 text-base font-normal">
                <Duration value={total.value} certainty={total.certainty} />
              </span>
            ) : null}
          </button>
        </h3>
        {/* GO TO: make this collection the top of the board. Its own button
            beside the duration rather than part of the bar, because the bar
            already means "open or close", and a click cannot mean both. Not on
            the collection that is already the top — there is nowhere to go. */}
        {isRoot ? null : (
          <button
            type="button"
            aria-label={`Go to ${data.name}`}
            title={`Go to ${data.name}: show it, and everything inside it, on its own`}
            data-collection-focus
            onClick={() => focus(id)}
            className="flex shrink-0 items-center rounded-lg px-2 text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-100 focus-visible:bg-zinc-800/60 focus-visible:text-zinc-100 focus-visible:outline-2 focus-visible:outline-sky-500"
          >
            <Focus className="size-4" aria-hidden="true" />
          </button>
        )}
        {/* IN THE CUT OR NOT, for this whole branch. Its own control beside
            the bar, for the reason "go to" is: the bar means open or close.
            Disabled, and shown off, while a row above is off.

            LAST IN THE ROW, so every switch sits against its box's right edge.
            Before "go to" it was pushed left by that icon on every row but the
            top one, which has no icon — a 49px stagger down the right side. */}
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={`Active: ${data.name}`}
          disabled={parentOff}
          title={
            parentOff
              ? `Off because ${branch.offByName ?? "a collection above"} is off`
              : on
                ? `${data.name} is in the film strip. Switch off to take it out.`
                : `${data.name} is out of the film strip. Switch on to put it back.`
          }
          data-collection-active
          onClick={toggleActive}
          className="flex shrink-0 items-center rounded-lg px-1.5 transition-colors hover:bg-zinc-800/60 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <SwitchTrack on={on} />
        </button>
      </header>

      {/* Always in the DOM so `aria-controls` names something; its contents
          render only while open, so a closed collection mounts none of its
          cards. */}
      <div id={bodyId} hidden={collapsed}>
        <BranchContext value={childBranch}>
        {collapsed ? null : (
          <>
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
            ) : layout === "row" ? (
              // ONE ROW THAT RUNS OFF THE EDGE, scrolled sideways, the way the
              // film strip reads the reel. A collection's height then stops
              // depending on how much it holds, which is what makes a document
              // this deep scannable by scrolling the page.
              //
              // NESTED COLLECTIONS STAY STACKED, below the clips: a folder is
              // not a card, and a horizontal scroller full of folders hides the
              // thing you opened the folder to see. So the children are split
              // by kind here — the only place that distinction matters.
              <div className="grid gap-2">
                {clipIds.length === 0 ? null : (
                  <div
                    data-board-row
                    className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] md:gap-3"
                  >
                    {clipIds.map((childId) => (
                      <div key={childId} className={cn(ROW_CARD_WIDTH, "shrink-0")}>
                        <NodeSlot id={childId} />
                      </div>
                    ))}
                  </div>
                )}
                {collectionIds.map((childId) => (
                  <NodeSlot key={childId} id={childId} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2 md:gap-3">
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
          </>
        )}
        </BranchContext>
      </div>
    </section>
  );
}

/**
 * THE BOARD'S VIEWS, REGISTERED ONCE PER REGISTRY.
 *
 * Hot reload re-runs this module without re-running `bindings.ts`, whose
 * registry already holds the views, so registering unconditionally reported
 * "a view for kind ... is already registered" on every edit to this file.
 *
 * KEYED ON THE REGISTRY, not on the page. The first version of this guard was
 * one page-wide flag, and an edit to `engine.ts` broke it: that re-runs
 * `bindings.ts`, which builds a NEW, empty registry, and the flag then kept
 * this module from filling it — "no view registered for kind collection" and a
 * blank board until a full reload. `defineNodeView` is created with its
 * registry, so a new registry means a new function, and a WeakSet of the
 * functions already used answers "has THIS registry got the views?".
 *
 * An edit to this file still shows without a reload: Fast Refresh swaps a
 * component's implementation by its identity in the refresh runtime, not
 * through whatever reference the registry kept.
 */
const REGISTERED_WITH = Symbol.for("media-monster:board-views-registered-with");
const holder = globalThis as { [REGISTERED_WITH]?: WeakSet<object> };
const registeredWith = (holder[REGISTERED_WITH] ??= new WeakSet<object>());
if (!registeredWith.has(defineNodeView)) {
  registeredWith.add(defineNodeView);
  defineNodeView("clip", ClipCard);
  defineNodeView("collection", CollectionCard);
}

function Toolbar({ rootId }: Readonly<{ rootId: ReturnType<typeof parseNodeId> }>) {
  const { canUndo, canRedo, undo, redo } = useHistory();
  // THE REEL IS WHAT PLAYS: active clips only, so this agrees with the strip.
  const total = useFold("activeSeconds", rootId);
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

export function Board({
  initialFilmStripSize = "default",
  initialBoardLayout = "grid",
}: Readonly<{
  /** What the server rendered the strip at, from the cookie. The settings
   *  dialog changes it live; this only makes the first paint agree. */
  initialFilmStripSize?: FilmStripSize;
  /** The same, for how the board lays clips out. */
  initialBoardLayout?: BoardLayout;
}> = {}) {
  const filmStripSize = useSyncExternalStore(
    subscribeFilmStripSize,
    readFilmStripSize,
    () => initialFilmStripSize,
  );
  const boardLayout = useSyncExternalStore(
    subscribeBoardLayout,
    readBoardLayout,
    () => initialBoardLayout,
  );
  // ONE STORE FOR THE LIFE OF THE MOUNT. Built in a lazy initializer rather than
  // at module scope so React Strict Mode's double render does not build two, and
  // so a future document id can key it. `loadFixtureGraph` throws on a fixture
  // that does not parse, which is what should happen — it ships with the app.
  const buildStore = () => {
    const { graph, report } = loadFixtureGraph();
    return { store: engine.createStore(graph), sealed: report.sealed, builtBy: engine };
  };
  const [built, setBuilt] = useState(buildStore);
  // A NEW ENGINE MEANS A NEW STORE. Only hot reload makes one: an edit to
  // `engine.ts` (or the node types) re-runs it and the bindings, while Fast
  // Refresh keeps this state, so the board held a store from the old engine
  // and the bindings refused it ("built by a different engine"). Rebuilt
  // during render, React's pattern for state that follows a changed input.
  // The fixture reloads, so unsaved edits go with it, as they would on reload.
  if (built.builtBy !== engine) setBuilt(buildStore());
  const { store, sealed } = built;

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
      <BoardBody boardLayout={boardLayout} filmStripSize={filmStripSize} />
    </Provider>
  );
}

/**
 * Everything under the store's Provider, which is where the graph can be read.
 *
 * SPLIT FROM `Board` for that reason: "go to" has to check the URL's id against
 * the live graph (a folder that was just read in is a valid target, and one that
 * was deleted is not), and only a component inside the Provider can subscribe.
 */
function BoardBody({
  boardLayout,
  filmStripSize,
}: Readonly<{ boardLayout: BoardLayout; filmStripSize: FilmStripSize }>) {
  const graph = useGraph();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const topId = parseNodeId(FIXTURE_ROOT_ID);

  // IN THE URL, so the browser's Back button goes back up, and a link to a
  // collection opens on it. `?focus=` naming the real root, or nothing valid,
  // is the whole board.
  const selection = useSelectionActions();
  const focusedId = resolveFocus(graph, params.get("focus"));
  const shownRootId = focusedId ?? topId;
  // The rows ABOVE what is shown are not on the page to pass their state down,
  // so it is read from the graph here: gone to inside a switched-off branch,
  // the view starts off.
  const aboveId = getParent(graph, shownRootId);
  const offAbove = aboveId === null ? null : switchedOffAt(graph, aboveId);
  const offAboveNode = offAbove === null ? undefined : getNode(graph, offAbove);
  const rootBranch: Branch =
    offAbove === null
      ? ON
      : {
          offBy: offAbove,
          offByName:
            offAboveNode !== undefined && !offAboveNode.sealed && offAboveNode.kind === "collection"
              ? offAboveNode.data.name
              : null,
        };
  const focus = (id: NodeId | null) => {
    router.push(
      id === null || id === topId ? pathname : `${pathname}?focus=${encodeURIComponent(id)}`,
    );
    // THE STRIP FOLLOWS, as if the collection's first clip had been tapped:
    // selecting it centres its box and puts the playhead on its first frame.
    // Done here, on the gesture, rather than whenever the URL changes — Back
    // and a link opened cold are not somebody asking to go there now.
    const first = firstClipInStrip(graph, id ?? topId);
    if (first !== null) selection.set([first]);
  };

  return (
    <>
      {/* The REEL's controls: undo, redo and the running time stay about the
          whole document wherever the board is looking. */}
      <Toolbar rootId={topId} />
      {focusedId === null ? null : <FocusTrail shownRootId={focusedId} onGo={focus} />}
      <BoardFocusContext value={{ shownRootId, focus }}>
        <BoardLayoutContext value={boardLayout}>
          {/* KEYED on the root it shows, so going somewhere is a fresh view:
              the new top opens and everything inside it starts closed, rather
              than inheriting whatever state that card had deeper in the tree. */}
          <BranchContext value={rootBranch}>
            <NodeSlot key={shownRootId} id={shownRootId} />
          </BranchContext>
        </BoardLayoutContext>
      </BoardFocusContext>
      {/* PINNED TO THE BOTTOM OF THE VIEWPORT. The strip is the reel's timeline,
          so it stays in reach while the board scrolls above it. `sticky` rather
          than `fixed`: it keeps its place in the page's width (beside the rail,
          inside `main`'s padding) with no offsets to keep in step, and it
          settles into its own spot at the end of the board. The background is
          the page's, so cards scrolling under it do not show through. */}
      <div className="sticky bottom-0 z-40 mt-6 bg-zinc-950 pt-3 pb-4 max-md:-mx-2">
        <BoardFilmStrip size={filmStripSize} />
      </div>
    </>
  );
}

/**
 * The first clip under `rootId`, in document order, that the film strip shows.
 *
 * IN THE CUT ONLY, because the strip leaves switched-off branches out: selecting
 * a clip there would highlight a card the strip has no box for, and the strip
 * would not move. A collection with nothing in the strip — switched off, or not
 * read yet — gives `null`, and the strip stays where it is.
 */
function firstClipInStrip(graph: ReturnType<typeof useGraph>, rootId: NodeId): NodeId | null {
  const inside = (id: NodeId): boolean => {
    for (let at: NodeId | null = id; at !== null; at = getParent(graph, at)) {
      if (at === rootId) return true;
    }
    return false;
  };
  for (const id of documentOrder(graph)) {
    const node = getNode(graph, id);
    if (node === undefined || node.sealed || node.kind !== "clip") continue;
    if (inside(id) && switchedOffAt(graph, id) === null) return id;
  }
  return null;
}

/**
 * The way back up: every collection from the real root down to the one being
 * shown, each a link to go there. Only drawn while the board is focused.
 */
function FocusTrail({
  shownRootId,
  onGo,
}: Readonly<{ shownRootId: NodeId; onGo: (id: NodeId | null) => void }>) {
  const graph = useGraph();
  const chain: NodeId[] = [];
  for (let at: NodeId | null = shownRootId; at !== null; at = getParent(graph, at)) {
    chain.unshift(at);
  }
  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      <ol className="flex flex-wrap items-center gap-1 text-sm">
        {chain.map((crumbId, index) => {
          const node = getNode(graph, crumbId);
          const name =
            node !== undefined && !node.sealed && node.kind === "collection"
              ? node.data.name
              : crumbId;
          const current = index === chain.length - 1;
          return (
            <li key={crumbId} className="flex min-w-0 items-center gap-1">
              {index === 0 ? null : (
                <ChevronRight className="size-3.5 shrink-0 text-zinc-600" aria-hidden="true" />
              )}
              {current ? (
                <span aria-current="page" className="truncate px-1 font-semibold text-zinc-100">
                  {name}
                </span>
              ) : (
                <button
                  type="button"
                  data-focus-crumb
                  onClick={() => onGo(crumbId)}
                  className="truncate rounded px-1 text-zinc-400 transition-colors hover:bg-zinc-800/60 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-sky-500"
                >
                  {name}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
