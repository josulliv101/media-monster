"use client";

import {
  Fragment,
  createContext,
  use,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  documentOrder,
  getChildren,
  getNode,
  getParent,
  parseNodeId,
  tryParseNodeId,
  type NodeId,
} from "@josulliv101/nested-collections";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Film,
  GripVertical,
  Layers,
  LogIn,
  Redo2,
  Undo2,
} from "lucide-react";

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
  useSelectionAnchor,
  useStore,
} from "@/lib/engine/bindings";
import { engine } from "@/lib/engine/engine";
import { FIXTURE_ROOT_ID, loadFixtureGraph } from "@/lib/engine/fixture-document";
import { BoardFilmStrip } from "./board-film-strip";
import { ActionMenu } from "./action-menu";
import type { RowAction } from "./row-actions";
import { SwipeGroup, SwipeRow } from "./swipe-row";
import { BoardDragProvider, DropPlaceholder, useBoardDrag } from "./board-drag";
import { readCollection, restoreSwitchedOff } from "./read-collection";
import {
  BOARD_RESET_EVENT,
  BOARD_SAVE_KEY,
  cancelPendingSave,
  clearSavedBoard,
  hasPendingSave,
  readSavedBoard,
  registerPendingSave,
  writeSavedBoard,
  type SavedBoard,
} from "./board-save";
import {
  BoardPreview,
  cardPicture,
  rectOf,
  stripFrame,
  stripFrameRect,
  type Rect,
} from "./board-preview";
import type { FilmStripOpenOrigin } from "@storyboard/ui/film-strip";
import { cardStill } from "./clip-still";
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
import {
  readHoverPlay,
  readHoverPlayOnServer,
  subscribeHoverPlay,
} from "@/components/settings/hover-play-store";
import { switchedOffAt } from "@/lib/engine/branch-activity";
import {
  encodeInactiveRows,
  inactiveRowsFromCookies,
  writeInactiveRows,
} from "@/components/settings/inactive-rows-preference";
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
 * WHERE IT STANDS: rows and clips drag anywhere in the tree (`board-drag.tsx`),
 * "go to" puts a collection in the URL, and edits are saved in this browser
 * (`board-save.ts`) — the sample document is only the starting point. Not yet:
 * a server copy, so a board lives on one device and one browser.
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
  quiet = false,
}: Readonly<{
  value: number;
  certainty: "exact" | "estimated" | "partial";
  /** Dimmer, for a duration riding along beside something more important
   *  (a row's name). An estimate stays amber, just fainter: that colour is
   *  what says the number is not a measurement. */
  quiet?: boolean;
}>) {
  const prefix =
    certainty === "exact" ? "" : certainty === "estimated" ? "about " : "at least ";
  return (
    <span
      className={cn(
        "tabular-nums",
        certainty === "exact"
          ? quiet
            ? "text-zinc-500"
            : "text-zinc-400"
          : quiet
            ? "text-amber-400/70"
            : "text-amber-400/90",
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
    return <img src={cardStill(media, seconds) ?? media.src} alt="" className={frame} />;
  }
  return <HoverVideo src={media.src} poster={cardStill(media, seconds)} className={frame} />;
}

/** How long the pointer must stay put on a card before its video plays. */
const REST_MS = 300;
/** Movement smaller than this is a hand holding still, not a hand moving on. */
const REST_JITTER_PX = 3;

/**
 * A CARD'S VIDEO PLAYS ONCE THE POINTER COMES TO REST ON IT, not as it passes
 * over: sweeping across a board of cards started every video under the path,
 * each one fetching. The pointer has to stay within a few pixels for
 * `REST_MS`; any real movement before then starts the wait again, and once it
 * plays, moving about the card does not stop it. Leaving stops it and rewinds
 * it to its still.
 *
 * A MOUSE (or pen) ONLY: a touch has no hover, and a tap opens the preview.
 *
 * Switched off entirely by the Settings choice "Play clips on hover"
 * (`hover-play-store.ts`), read live, so turning it off stops a card playing now.
 */
function HoverVideo({
  src,
  poster,
  className,
}: Readonly<{ src: string; poster: string | null; className: string }>) {
  const hoverPlay = useSyncExternalStore(subscribeHoverPlay, readHoverPlay, readHoverPlayOnServer);
  const videoRef = useRef<HTMLVideoElement>(null);
  const restRef = useRef<{ x: number; y: number; timer: number } | null>(null);

  const stopWaiting = () => {
    if (restRef.current !== null) window.clearTimeout(restRef.current.timer);
    restRef.current = null;
  };
  const stop = () => {
    stopWaiting();
    const video = videoRef.current;
    if (video === null || video.paused) return;
    video.pause();
    video.currentTime = 0;
  };

  // Off now: nothing plays, including a card playing when it was switched off.
  // And no timer outlives the card.
  useEffect(() => {
    if (hoverPlay === "off") stop();
    return stopWaiting;
    // `stop` and `stopWaiting` read refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverPlay]);

  const settle = (event: React.PointerEvent<HTMLVideoElement>) => {
    if (hoverPlay === "off" || event.pointerType === "touch") return;
    const video = event.currentTarget;
    if (!video.paused) return;
    const rest = restRef.current;
    if (
      rest !== null &&
      Math.hypot(event.clientX - rest.x, event.clientY - rest.y) <= REST_JITTER_PX
    ) {
      return;
    }
    stopWaiting();
    restRef.current = {
      x: event.clientX,
      y: event.clientY,
      timer: window.setTimeout(() => {
        restRef.current = null;
        void video.play().catch(() => undefined);
      }, REST_MS),
    };
  };

  return (
    <video
      ref={videoRef}
      src={src}
      poster={poster ?? undefined}
      muted
      loop
      playsInline
      preload="none"
      className={className}
      onPointerEnter={settle}
      onPointerMove={settle}
      onPointerLeave={stop}
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

/** Every collection switched off in `graph`, in document order. */
function switchedOffIds(graph: ReturnType<typeof useGraph>): string[] {
  const ids: string[] = [];
  for (const id of documentOrder(graph)) {
    const node = getNode(graph, id);
    if (node !== undefined && !node.sealed && node.kind === "collection" && !node.data.active) {
      ids.push(id);
    }
  }
  return ids;
}

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

/**
 * EVERY CHILD'S NEIGHBOURS OF ITS OWN KIND, worked out ONCE by the collection
 * that holds them: the clip before and after each clip, the row before and
 * after each row. Move up and Move down read theirs from here.
 *
 * Each card used to scan and slice its parent's whole child list to find its
 * neighbours, which is quadratic across a collection, and to do it read the
 * whole graph, so every card redrew on every edit anywhere on the board. Now
 * a collection splits its children in one pass, the map keeps its identity
 * while the children do, and a card subscribes only to its two neighbours'
 * nodes (for their names).
 */
type Neighbours = Readonly<{ before: NodeId | null; after: NodeId | null }>;
const NO_NEIGHBOURS: Neighbours = { before: null, after: null };
const NeighboursContext = createContext<ReadonlyMap<NodeId, Neighbours>>(new Map());

/** One pass: each child's previous and next sibling of the same kind. */
function neighboursOf(
  children: readonly NodeId[],
  isRow: ReadonlySet<NodeId>,
): ReadonlyMap<NodeId, Neighbours> {
  const map = new Map<NodeId, { before: NodeId | null; after: NodeId | null }>();
  let lastClip: NodeId | null = null;
  let lastRow: NodeId | null = null;
  for (const childId of children) {
    const row = isRow.has(childId);
    const before = row ? lastRow : lastClip;
    map.set(childId, { before, after: null });
    if (before !== null) {
      const previous = map.get(before);
      if (previous !== undefined) previous.after = childId;
    }
    if (row) lastRow = childId;
    else lastClip = childId;
  }
  return map;
}

/** Moves `id` to `toIndexBefore` among its current siblings, as a drop would.
 *  Reads the graph at the moment of the move, so no card subscribes to it. */
function moveAmongSiblings(
  store: ReturnType<typeof useStore>,
  id: NodeId,
  neighbour: NodeId,
  after: boolean,
): string | null {
  const graph = store.getGraph();
  const parentId = getParent(graph, id);
  if (parentId === null) return null;
  const at = getChildren(graph, parentId).indexOf(neighbour);
  if (at < 0) return null;
  const command = store.resolveDrop({
    type: "move",
    nodeIds: [id],
    toParentId: parentId,
    toIndexBefore: at + (after ? 1 : 0),
  });
  if (!command.ok) return `${command.error.code}: ${command.error.message}`;
  store.dispatch(command.value);
  return null;
}

/** A neighbour's display name, for "Before …" / "After …". */
function nameOfNode(node: ReturnType<typeof useNode>, fallback: string): string {
  if (node === undefined || node.sealed) return fallback;
  return node.kind === "clip" ? node.data.title : node.data.name;
}

/** Opens the preview on a clip, growing it out of that clip's card. Provided
 *  by `BoardBody`, which owns the preview and the space it fills. */
const BoardPreviewContext = createContext<(id: NodeId) => void>(() => undefined);

/** A clip card's width in a row, where the grid's `1fr` has no meaning: the
 *  cards run off the edge instead of sharing the width. */
const ROW_CARD_WIDTH = "w-56";

function ClipCard({ id, data }: NodeViewProps<NodeTypes, "clip">) {
  const selected = useIsSelected(id);
  const selection = useSelectionActions();
  const branch = use(BranchContext);
  const openPreview = use(BoardPreviewContext);
  const boardDrag = useBoardDrag();
  // Faded while it is the one being dragged, like a dragged row.
  const beingDragged = boardDrag.state.dragId === id;
  // Said on the card when it is the one under the pointer that will not take
  // the drop, as a row says it on its bar.
  const refusalHere = boardDrag.state.refusal?.at === id ? boardDrag.state.refusal : null;

  // MOVE UP AND DOWN, a clip's keyboard way to reorder, as a row's are: past
  // the neighbouring CLIP at the same level (not past a row), one undo step
  // each through `resolveDrop`, and the menu stays open on the moved card. The
  // neighbours come from the collection (`NeighboursContext`), not a scan.
  const store = useStore();
  const { before: clipBefore, after: clipAfter } = use(NeighboursContext).get(id) ?? NO_NEIGHBOURS;
  const beforeNode = useNode(clipBefore ?? id);
  const afterNode = useNode(clipAfter ?? id);
  const clipActions: readonly RowAction[] = [
    {
      id: "move-up",
      label: "Move up",
      hint:
        clipBefore === null ? "Already first" : `Before ${nameOfNode(beforeNode, "the clip before")}`,
      icon: <ArrowUp className="size-4" />,
      disabled: clipBefore === null,
      keepOpen: true,
      onSelect: () => {
        if (clipBefore !== null) moveAmongSiblings(store, id, clipBefore, false);
      },
    },
    {
      id: "move-down",
      label: "Move down",
      hint: clipAfter === null ? "Already last" : `After ${nameOfNode(afterNode, "the clip after")}`,
      icon: <ArrowDown className="size-4" />,
      disabled: clipAfter === null,
      keepOpen: true,
      onSelect: () => {
        if (clipAfter !== null) moveAmongSiblings(store, id, clipAfter, true);
      },
    },
  ];

  // NOT DIMMED WHEN ITS BRANCH IS OFF. The card is material you are keeping
  // either way; the row above says whether it plays (its icon and switch), so
  // the card draws the same in or out of the cut. `data-in-cut` still says
  // which, for anything that needs to know.

  return (
    <div
      data-clip-card
      data-clip-drop={id}
      data-in-cut={branch.offBy === null}
      title={branch.offByName === null ? undefined : `Not in the film strip: ${branch.offByName} is off`}
      className={cn(
        "group/clip relative flex flex-col overflow-hidden rounded-lg border transition-[border-color,background-color,opacity]",
        beingDragged && "opacity-40",
        refusalHere !== null && "ring-2 ring-red-400/70",
        selected
          ? "border-sky-400/60 bg-sky-400/10 text-zinc-50"
          : "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900",
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-haspopup="dialog"
        data-clip-open
        // A CLICK OPENS THE PREVIEW, and selects the clip so the film strip
        // goes to it. Ctrl or Cmd keeps the old gesture: add it to, or take it
        // out of, the selection without opening anything.
        onClick={(event) => {
          if (event.ctrlKey || event.metaKey) selection.toggle(id);
          else openPreview(id);
        }}
        className="flex w-full flex-col text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-500"
      >
        <span data-clip-picture={id} className="relative block">
          {refusalHere !== null ? (
            <span
              role="status"
              data-drop-refusal
              // Centred on the picture, as a row's is centred on its bar.
              className="pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-red-400/50 bg-zinc-950/90 px-3 py-1 text-xs font-medium whitespace-nowrap text-red-300 shadow-lg shadow-black/40"
            >
              {refusalHere.message}
            </span>
          ) : null}
          <ClipPicture media={data.media} seconds={data.seconds} />
        </span>
        {/* The right padding keeps the duration clear of the ⋮ and the grip,
            which sit over the end of this line. */}
        <span className="flex items-baseline justify-between gap-3 py-2 pr-16 pl-3 max-md:pr-24">
          <span className="min-w-0 truncate text-sm">{data.title}</span>
          <span className="shrink-0 text-xs tabular-nums text-zinc-500">
            {formatSeconds(data.seconds)}
          </span>
        </span>
      </button>
      {/* THE DRAG GRIP, bottom right, over the end of the title line. Outside
          the card's button, so pressing it never opens the preview. Press and
          drag to move the clip anywhere in the tree (`board-drag.tsx`).
          Pointer-only for now, like a row's. */}
      {/* THE CLIP'S ⋮ MENU, just left of the grip (see `action-menu.tsx`).
          Always shown: a clip has no swipe to hide its actions behind. */}
      <ActionMenu
        label={data.title}
        actions={clipActions}
        buttonClassName="absolute right-8 bottom-1 flex size-7 items-center justify-center rounded-md max-md:right-11 max-md:bottom-0 max-md:size-11"
      />
      {/* A button for the same touch-adjustment reason as a row's grip. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        data-clip-drag-handle
        title="Drag to move"
        onPointerDown={(event) => boardDrag.start(id, data.title, "clip", event)}
        // 44px on a phone, as a row's grip is, and for the same reason.
        className="absolute right-1 bottom-1 flex size-7 cursor-grab touch-none items-center justify-center rounded-md text-zinc-600 transition-colors select-none [-webkit-touch-callout:none] hover:bg-zinc-700/60 hover:text-zinc-200 max-md:right-0 max-md:bottom-0 max-md:size-11"
      >
        <GripVertical className="size-4" />
      </button>
    </div>
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

  // WHAT CAN BE DONE TO THIS ROW, as one list (see `row-actions.tsx`). The ⋮
  // menu shows `menuActions`; a phone's swipe tray shows `trayActions`, which
  // adds "go to" — on a wide screen that has its own icon in the bar.
  const activeAction: RowAction = {
    id: "active",
    label: "Active",
    hint: parentOff
      ? `Off because ${branch.offByName ?? "a collection above"} is off`
      : on
        ? "In the film strip"
        : "Not in the film strip",
    checked: on,
    disabled: parentOff,
    title: parentOff ? `Off because ${branch.offByName ?? "a collection above"} is off` : undefined,
    onSelect: toggleActive,
  };
  // MOVE UP AND DOWN, the keyboard's way to reorder rows (a drag is the
  // pointer's). Past the neighbouring ROW at the same level, not past a clip:
  // the rows are what you are looking at in a list of rows, and in the row
  // layout clips are not even drawn among them. Through `resolveDrop`, like a
  // drop, so it is one undoable step. Not on the row the board is showing,
  // which has no visible siblings to pass.
  // Its neighbours come from the collection above it (`NeighboursContext`).
  const { before: rowAbove, after: rowBelow } = use(NeighboursContext).get(id) ?? NO_NEIGHBOURS;
  const aboveNode = useNode(rowAbove ?? id);
  const belowNode = useNode(rowBelow ?? id);
  const moveActions: readonly RowAction[] = isRoot
    ? []
    : [
        {
          id: "move-up",
          label: "Move up",
          hint:
            rowAbove === null ? "Already first" : `Before ${nameOfNode(aboveNode, "the row above")}`,
          icon: <ArrowUp className="size-4" />,
          disabled: rowAbove === null,
          keepOpen: true,
          onSelect: () => {
            if (rowAbove !== null) setRejection(moveAmongSiblings(store, id, rowAbove, false));
          },
        },
        {
          id: "move-down",
          label: "Move down",
          hint:
            rowBelow === null ? "Already last" : `After ${nameOfNode(belowNode, "the row below")}`,
          icon: <ArrowDown className="size-4" />,
          disabled: rowBelow === null,
          keepOpen: true,
          onSelect: () => {
            if (rowBelow !== null) setRejection(moveAmongSiblings(store, id, rowBelow, true));
          },
        },
      ];
  const menuActions: readonly RowAction[] = [activeAction, ...moveActions];
  // THE PHONE'S TRAY keeps to Go to and Active: a phone moves rows by the grip,
  // and four buttons would push the row nearly off the screen to show them.
  const trayActions: readonly RowAction[] = isRoot
    ? [activeAction]
    : [
        {
          id: "go-to",
          label: "Go to",
          icon: <LogIn className="size-4" />,
          onSelect: () => focus(id),
        },
        activeAction,
      ];
  // THE REAL ROOT IS NOT DRAWN AS A BOX. It is the board itself — the page's
  // heading names it and the toolbar carries its running time — so its
  // children are the top level. A collection "gone to" keeps its box: it is the
  // thing you went to, and the trail names it.
  //
  // Asked of the GRAPH, not of `shownRootId` being null: the board always hands
  // down the id it shows, the real root included, so "nothing gone to" is "the
  // shown root is a real root".
  const showingRealRoot = shownRootId === null || graph.rootIds.includes(shownRootId);
  const bare = isRoot && showingRealRoot;
  const parentId = getParent(graph, id);
  const isTopLevel = showingRealRoot && parentId !== null && graph.rootIds.includes(parentId);
  const [collapsed, setCollapsed] = useState(!isRoot);

  // A ROW BEING DRAGGED (see `board-drag.tsx`). This card draws its part of it:
  // faded if it is the one being dragged, ringed if it is a CLOSED row about to
  // take the drop, and the parted-rows placeholder among its children if it is
  // the open row the drop will land in.
  const boardDrag = useBoardDrag();
  const dropTarget = boardDrag.state.target;
  // THE REFUSAL, when this row is the one under the pointer that will not
  // take the drop (or is being read so that it can): said here, on the row.
  const refusalHere = boardDrag.state.refusal?.at === id ? boardDrag.state.refusal : null;
  const beingDragged = boardDrag.state.dragId === id;
  const intoWhileClosed =
    dropTarget !== null && dropTarget.kind === "into" && dropTarget.parentId === id && collapsed;
  const placeholderAt =
    dropTarget !== null && dropTarget.parentId === id && !intoWhileClosed ? dropTarget.index : null;
  const dragKind = boardDrag.state.dragKind;
  const placeholder = <DropPlaceholder name={boardDrag.state.dragName} kind={dragKind} />;
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
  // ONE PASS, not a `filter` and then an `includes` inside another `filter`,
  // which was quadratic in the number of children.
  const clipIds: NodeId[] = [];
  const collectionIds: NodeId[] = [];
  for (const childId of children) {
    const child = getNode(graph, childId);
    if (child !== undefined && !child.sealed && child.kind === "collection") {
      collectionIds.push(childId);
    } else {
      clipIds.push(childId);
    }
  }
  // Kept while the children and their kinds are: a new map would redraw every
  // card that reads its neighbours from it.
  const rowKey = collectionIds.join("\u0000");
  const neighbours = useMemo(
    () => neighboursOf(children, new Set(rowKey === "" ? [] : (rowKey.split("\u0000") as NodeId[]))),
    [children, rowKey],
  );
  // In the row layout the rows are stacked apart from the clips, so a dragged
  // ROW's placeholder goes before the first row at or after its index, and a
  // dragged CLIP's before the first clip at or after it, in the clips' strip.
  const rowSlotAt = placeholderAt !== null && dragKind === "row" ? placeholderAt : null;
  const clipSlotAt = placeholderAt !== null && dragKind === "clip" ? placeholderAt : null;
  const firstCollectionAtOrAfter =
    rowSlotAt === null
      ? null
      : (collectionIds
          .map((childId) => children.indexOf(childId))
          .find((index) => index >= rowSlotAt) ?? null);
  const firstClipAtOrAfter =
    clipSlotAt === null
      ? null
      : (clipIds.map((childId) => children.indexOf(childId)).find((index) => index >= clipSlotAt) ??
        null);
  const summarized = total?.certainty === "estimated";

  // OPENING READS IT. `store.load` is IO landing: no patch, no history entry,
  // no change-feed event — loading is not an edit, so Undo does not un-read it.
  // The fold re-renders on its own because the load bumps the subtree revision
  // up the ancestor chain, which is how the estimate turns exact everywhere.
  const open = async () => {
    setReading(true);
    setRejection(null);
    // See `read-collection.ts`: the same read a dragged row hovering this
    // collection starts, so the two cannot disagree about what "read" means.
    setRejection(await readCollection(store, id));
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

  // What a collection holds, drawn inside its box — or, for the real root,
  // drawn as the board itself.
  const contents = (
    <NeighboursContext value={neighbours}>
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
        placeholderAt === null ? (
          <p className="px-1 py-2 text-xs text-zinc-600">Empty.</p>
        ) : (
          placeholder
        )
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
          {clipIds.length === 0 && clipSlotAt === null ? null : (
            <div
              data-board-row
              className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] md:gap-3"
            >
              {clipIds.map((childId) => (
                <Fragment key={childId}>
                  {clipSlotAt !== null && children.indexOf(childId) === firstClipAtOrAfter ? (
                    <div className={cn(ROW_CARD_WIDTH, "shrink-0")}>{placeholder}</div>
                  ) : null}
                  <div className={cn(ROW_CARD_WIDTH, "shrink-0")}>
                    <NodeSlot id={childId} />
                  </div>
                </Fragment>
              ))}
              {clipSlotAt !== null && firstClipAtOrAfter === null ? (
                <div className={cn(ROW_CARD_WIDTH, "shrink-0")}>{placeholder}</div>
              ) : null}
            </div>
          )}
          {collectionIds.map((childId) => (
            <Fragment key={childId}>
              {rowSlotAt !== null && children.indexOf(childId) === firstCollectionAtOrAfter
                ? placeholder
                : null}
              <NodeSlot id={childId} />
            </Fragment>
          ))}
          {rowSlotAt !== null && firstCollectionAtOrAfter === null ? placeholder : null}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2 md:gap-3">
          {children.map((childId, index) => (
            <Fragment key={childId}>
              {placeholderAt === index ? placeholder : null}
              <NodeSlot id={childId} />
            </Fragment>
          ))}
          {placeholderAt === children.length ? placeholder : null}
        </div>
      )}

      <div
        data-row-footer={id}
        data-row-root={isRoot}
        className="mt-2 flex items-center gap-3"
      >
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
    </NeighboursContext>
  );

  if (bare) {
    return (
      <div data-board-root>
        <BranchContext value={childBranch}>{contents}</BranchContext>
      </div>
    );
  }

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
      data-branch-in-cut={on}
      className={cn(
        "col-span-full border border-zinc-800 bg-zinc-950/60 p-2 transition-opacity md:p-3",
        isRoot || isTopLevel ? "rounded-xl" : "rounded-l-xl border-r-0 pr-0 md:pr-0",
        // Faded while dragged — except while the pointer is inside it, where
        // it is refused: the refusal is said on a row inside this one, and a
        // faded parent would fade the message with it.
        beingDragged && boardDrag.state.refusal?.ownBranch !== true && "opacity-40",
      )}
    >
      {/* THE WHOLE BAR TOGGLES: icon, name, duration, triangle and the space
          after them are one button. It bleeds 6px into the card's padding on three sides
          (block boxes, so the negative margins widen the bar rather than
          shrinking anything's natural width) and pads back by the same 6px,
          so the text sits exactly where the padding put it. The row's hover
          tint and focus ring (on the header, below) then read as the whole
          row, not as a tight box round the name. */}
      {/* ON A PHONE THE BAR SWIPES LEFT to show the row's actions behind it
          (`swipe-row.tsx`); the ⋮ and "go to" leave the bar there. */}
      <SwipeRow
        id={id}
        actions={trayActions}
        className={cn("-mx-1.5 -mt-1.5", collapsed ? "-mb-1.5" : "mb-0.5")}
      >
        {/* THE WHOLE ROW TINTS on hover, and while its bar has keyboard focus
            or its ⋮ menu is open, icons included; the tint used to stop where
            the bar button did. The icons take a brighter tint of their own on
            top, so the one under the pointer still reads as its own target. */}
        <header
          data-row-header={id}
          data-row-open={!collapsed}
          data-row-root={isRoot}
          className={cn(
            "group/row relative flex items-stretch gap-1 rounded-lg transition-colors hover:bg-zinc-800/60",
            intoWhileClosed && "bg-sky-400/10 ring-2 ring-sky-400 ring-inset",
            refusalHere?.why === "refused" && "bg-red-500/10 ring-2 ring-red-400/70 ring-inset",
            refusalHere?.why === "reading" && "bg-amber-400/10 ring-2 ring-amber-400/60 ring-inset",
            "has-[[data-collection-toggle]:focus-visible]:bg-zinc-800/60 has-[[data-collection-toggle]:focus-visible]:outline-2 has-[[data-collection-toggle]:focus-visible]:-outline-offset-2 has-[[data-collection-toggle]:focus-visible]:outline-sky-500",
            "has-[[data-menu-button][aria-expanded=true]]:bg-zinc-800/60",
          )}
        >
          <h3 className="min-w-0 flex-1 text-lg font-semibold text-zinc-100">
            <button
              type="button"
              aria-expanded={!collapsed}
              aria-controls={bodyId}
              data-collection-toggle
              onClick={() => setCollapsed((was) => !was)}
              className="group flex w-full items-center gap-3 rounded-lg px-1.5 py-3 text-left focus-visible:outline-none"
            >
              {/* BASELINE, so the small duration sits on the name's line rather
                  than centred against its taller box; the icon and the triangle
                  centre themselves. */}
              <span className="flex min-w-0 items-baseline gap-2">
                {/* IN THE STRIP OR NOT, AT A GLANCE, first in the row. One slot,
                    the same size in both states so the names line up down the
                    board: a white film icon on a small solid blue chip while this
                    branch plays — the switch's "on" blue, carried by a shape
                    rather than by coloured text, which read poorly — and the
                    collections icon, unfilled, when it does not. Layers is the
                    icon this project already means "collection" by (the film
                    strip's section labels, the old app's collection cards).
                    `mr-1` on top of the gap sets it apart from the name. Nothing
                    here dims: the row is still a row you open and read. The
                    switch carries the state for assistive tech, so this is
                    decorative. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "mr-1 flex size-6 shrink-0 items-center justify-center self-center rounded-md",
                    on ? "bg-sky-500" : null,
                  )}
                >
                  {on ? (
                    // Turned a quarter so the film runs SIDEWAYS, like the strip at the
                    // bottom of the board: sprocket holes top and bottom, not left
                    // and right.
                    <Film data-collection-in-cut className="size-3.5 rotate-90 text-white" />
                  ) : (
                    <Layers data-collection-out-of-cut className="size-4 text-zinc-300" />
                  )}
                </span>
                <span className="truncate">{data.name}</span>
                {/* THE DURATION RIDES WITH THE NAME, small and quiet: it is
                    about the row, but the name is what you read. */}
                {total ? (
                  <span className="shrink-0 text-xs font-normal">
                    <Duration value={total.value} certainty={total.certainty} quiet />
                  </span>
                ) : null}
                {/* AFTER THE NAME AND ITS DURATION. Points right when closed and
                    down when open; brightens with the bar on hover and focus. */}
                <svg
                  viewBox="0 0 10 10"
                  aria-hidden="true"
                  className={cn(
                    "ml-0.5 size-3 shrink-0 self-center fill-zinc-500 transition-[rotate,fill] duration-150 group-hover/row:fill-zinc-100 group-focus-visible:fill-zinc-100 motion-reduce:transition-none",
                    collapsed ? null : "rotate-90",
                  )}
                >
                  <path d="M2.5 1 L8.5 5 L2.5 9 Z" />
                </svg>
              </span>
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
              // SQUARE, 40px, centred in the row, like the ⋮ and the grip:
              // a full-height strip made a hover tint taller than it was wide.
              className="flex size-10 shrink-0 items-center justify-center self-center rounded-lg text-zinc-500 transition-colors max-md:sr-only max-md:focus-visible:not-sr-only hover:bg-zinc-700/60 hover:text-zinc-100 focus-visible:bg-zinc-700/60 focus-visible:text-zinc-100 focus-visible:outline-2 focus-visible:outline-sky-500"
            >
              {/* LogIn — an arrow going IN through a door: "enter this collection",
                  which is what the button does. */}
              <LogIn className="size-4" aria-hidden="true" />
            </button>
          )}
          {/* THE ROW'S MENU (see `action-menu.tsx`). Its items are `menuActions`. */}
          <ActionMenu label={data.name} actions={menuActions} />
          {/* WHAT A DROP HERE WOULD DO, in the middle of the row, both ways:
              where the eye already is while aiming at it. Over the bar, not in
              its flow, so nothing in the row moves when it appears; and it
              takes no pointer, so the row under it is still what is aimed at. */}
          {refusalHere !== null || intoWhileClosed ? (
            <span
              role="status"
              data-drop-refusal={refusalHere !== null ? true : undefined}
              data-drop-into={refusalHere === null ? true : undefined}
              className={cn(
                "pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap shadow-lg shadow-black/40",
                refusalHere === null
                  ? "border-sky-400/50 bg-zinc-950/90 text-sky-300"
                  : refusalHere.why === "refused"
                    ? "border-red-400/50 bg-zinc-950/90 text-red-300"
                    : "border-amber-400/50 bg-zinc-950/90 text-amber-200",
              )}
            >
              {refusalHere !== null ? refusalHere.message : "Move into"}
            </span>
          ) : null}
          {/* THE DRAG GRIP, last in the row so every grip sits against its
              box's right edge. Press and drag it to move the row anywhere in
              the tree (`board-drag.tsx`). Not on the row the board is showing:
              nothing around it is on the page to move it next to.
              Pointer-only for now, so it stays out of the accessibility tree
              rather than announce a control a keyboard cannot use. */}
          {isRoot ? null : (
            // A BUTTON, not a span, so a phone's touch adjustment counts it as
            // something to tap: Chrome moves a touch that lands near a button
            // onto that button, and with the grip a span, a touch inside the
            // grip's left edge was moved onto the row's bar (measured with
            // real touch input: 18px left of centre, on the grip, no drag).
            // Out of the tab order and hidden from assistive tech until a
            // keyboard can move rows.
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              data-row-drag-handle
              title="Drag to move"
              onPointerDown={(event) => boardDrag.start(id, data.name, "row", event)}
              // SQUARE: 40px, and a thumb-sized 44px on a phone, the icon
              // centred in it. At 24px, against the screen edge and beside a
              // bar that swipes and scrolls, a touch 14px left of the icon's
              // centre (measured, real touch input) grabbed the bar instead
              // and no drag started. No long-press callout or selection.
              className="flex size-10 shrink-0 cursor-grab touch-none items-center justify-center self-center rounded-lg text-zinc-600 transition-colors select-none [-webkit-touch-callout:none] hover:bg-zinc-700/60 hover:text-zinc-200 max-md:size-11"
            >
              <GripVertical className="size-4" />
            </button>
          )}
        </header>
      </SwipeRow>

      {/* Always in the DOM so `aria-controls` names something; its contents
          render only while open, so a closed collection mounts none of its
          cards. */}
      <div id={bodyId} hidden={collapsed}>
        <BranchContext value={childBranch}>{collapsed ? null : contents}</BranchContext>
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

/**
 * THE TOP BAR of the main content: where you are on the far left, the reel's
 * running time beside it, and undo and redo on the far right.
 *
 * WHERE YOU ARE IS A BREADCRUMB THAT STARTS AT THE TITLE. The document's name
 * (the root collection's, read from the data so the heading cannot disagree
 * with it) is the first crumb; going to a collection adds a crumb for every
 * collection on the way down to it. Every crumb but the last is a real link —
 * an `href` with the `?focus=` it goes to, so it can be opened in a new tab —
 * and a plain click goes there in place, through the same `onGo` the rows'
 * "go to" uses. The last crumb is where you are: the page's heading, not a link.
 *
 * The reel's running time stays about the WHOLE document wherever the board is
 * looking, like undo and redo.
 */
function TopNav({
  rootId,
  shownRootId,
  onGo,
}: Readonly<{
  rootId: NodeId;
  shownRootId: NodeId;
  onGo: (id: NodeId) => void;
}>) {
  const graph = useGraph();
  const pathname = usePathname();
  const { canUndo, canRedo, undo, redo } = useHistory();
  // THE REEL IS WHAT PLAYS: active clips only, so this agrees with the strip.
  const total = useFold("activeSeconds", rootId);
  const chain: NodeId[] = [];
  for (let at: NodeId | null = shownRootId; at !== null; at = getParent(graph, at)) {
    chain.unshift(at);
  }
  const nameOf = (id: NodeId): string => {
    const node = getNode(graph, id);
    return node !== undefined && !node.sealed && node.kind === "collection"
      ? node.data.name
      : "Untitled";
  };
  const hrefOf = (id: NodeId): string =>
    id === rootId ? pathname : `${pathname}?focus=${encodeURIComponent(id)}`;
  const button =
    "flex items-center gap-1.5 rounded-md border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-700 hover:text-zinc-50 disabled:cursor-not-allowed disabled:border-zinc-900 disabled:text-zinc-700";
  return (
    // ONE ROW ON A WIDE SCREEN; ON A PHONE THE TRAIL GETS A LINE OF ITS OWN
    // (`basis-full` wraps what follows it), with the reel and undo/redo on the
    // line below. Sharing one line, a two-deep trail was squeezed to nothing
    // and the current crumb ran over "Reel runs".
    <header
      data-top-nav
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 md:flex-nowrap"
    >
      {/* Centred rather than baseline-aligned, so the divider sits in the
          middle of the row between text of two different sizes. */}
      <nav aria-label="Breadcrumb" className="min-w-0 max-md:basis-full">
        <ol className="flex min-w-0 items-center gap-1.5 text-lg">
          {chain.map((crumbId, index) => {
            const current = index === chain.length - 1;
            return (
              <li
                key={crumbId}
                // The trail gives way from the FRONT when it runs out of room,
                // and only then: the crumbs above shrink a thousand times faster
                // than where you are, truncating first and each keeping a few
                // letters rather than vanishing; where you are truncates only
                // once they cannot give any more. (Not a percentage cap on the
                // last crumb: a percentage of the trail's own width is circular,
                // and cut "Toon Town" to two thirds with the page half empty.)
                className={cn(
                  "flex items-center gap-1.5",
                  current ? "min-w-0 shrink" : "min-w-14 shrink-[1000]",
                )}
              >
                {index === 0 ? null : (
                  <ChevronRight className="size-4 shrink-0 text-zinc-600" aria-hidden="true" />
                )}
                {current ? (
                  <h1
                    aria-current="page"
                    data-breadcrumb-current
                    className="truncate font-semibold text-zinc-100"
                  >
                    {nameOf(crumbId)}
                  </h1>
                ) : (
                  <Link
                    href={hrefOf(crumbId)}
                    data-breadcrumb-link
                    onClick={(event) => {
                      // A new tab or window is the browser's business; only a
                      // plain click is taken over, so it also moves the strip.
                      if (
                        event.button !== 0 ||
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey
                      ) {
                        return;
                      }
                      event.preventDefault();
                      onGo(crumbId);
                    }}
                    className="truncate rounded px-0.5 font-semibold text-zinc-400 underline-offset-4 transition-colors hover:text-zinc-100 hover:underline focus-visible:text-zinc-100 focus-visible:outline-2 focus-visible:outline-sky-500"
                  >
                    {nameOf(crumbId)}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      {/* A vertical rule between where you are and what follows it, with
          room to breathe: `mx-2` on top of the row's gap, 20px either side.
          Not on a phone, where the two are on different lines. */}
      <span
        aria-hidden="true"
        data-top-nav-divider
        className="mx-2 h-5 w-px shrink-0 bg-zinc-700 max-md:hidden"
      />
      {total ? (
        <span className="shrink-0 text-xs">
          Reel runs <Duration value={total.value} certainty={total.certainty} />
        </span>
      ) : null}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button type="button" disabled={!canUndo} onClick={() => undo()} className={button}>
          <Undo2 className="size-3.5" /> Undo
        </button>
        <button type="button" disabled={!canRedo} onClick={() => redo()} className={button}>
          <Redo2 className="size-3.5" /> Redo
        </button>
      </div>
    </header>
  );
}

/** A store the board runs on, and where it came from. */
type BuiltBoard = Readonly<{
  store: ReturnType<typeof engine.createStore>;
  sealedCount: number;
  builtBy: typeof engine;
  /** Changes on every rebuild, so the provider below remounts on a new store. */
  id: number;
  /** `"sample"` until this browser's save has been looked at; the fixture is
   *  drawn meanwhile only when no save is expected (see `hasSavedBoard`). */
  from: "sample" | "saved" | "sample-provisional";
  /** Why saving is paused, when it is: the saved copy could not be loaded, and
   *  writing over it would lose it for good. */
  savingBlockedBy: string | null;
}>;

let builds = 0;

function fromSample(inactiveRows: readonly string[], provisional: boolean): BuiltBoard {
  const { graph, report } = loadFixtureGraph();
  const store = engine.createStore(graph);
  restoreSwitchedOff(store, inactiveRows);
  builds += 1;
  return {
    store,
    sealedCount: report.sealed.length,
    builtBy: engine,
    id: builds,
    from: provisional ? "sample-provisional" : "sample",
    savingBlockedBy: null,
  };
}

function fromSaved(saved: SavedBoard, inactiveRows: readonly string[]): BuiltBoard {
  if (saved.kind === "ok") {
    builds += 1;
    // The save carries every row's Active switch itself; the cookie is not
    // applied over it.
    return {
      store: engine.createStore(saved.graph),
      sealedCount: saved.sealedCount,
      builtBy: engine,
      id: builds,
      from: "saved",
      savingBlockedBy: null,
    };
  }
  const sample = fromSample(inactiveRows, false);
  return saved.kind === "broken" ? { ...sample, savingBlockedBy: saved.reason } : sample;
}

/** How long after the last edit the board is written, so a burst of edits
 *  (a drag's worth of undo and redo) is one write. */
const SAVE_DELAY_MS = 400;

export function Board({
  initialFilmStripSize = "default",
  initialBoardLayout = "grid",
  initialInactiveRows = [],
  hasSavedBoard = false,
}: Readonly<{
  /** What the server rendered the strip at, from the cookie. The settings
   *  dialog changes it live; this only makes the first paint agree. */
  initialFilmStripSize?: FilmStripSize;
  /** The same, for how the board lays clips out. */
  initialBoardLayout?: BoardLayout;
  /** Collection ids switched off when the page was last left, from the cookie.
   *  Applied to the fixture as it is built, on the server and the client alike,
   *  so both render the same rows off. */
  initialInactiveRows?: readonly string[];
  /** This browser has a saved board (the `mm_board_saved` cookie): draw a
   *  loading state until it is read, rather than the sample and then a swap. */
  hasSavedBoard?: boolean;
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
  // THE SAVED BOARD, read once per mount. Through `useSyncExternalStore` so the
  // server and the hydrating client both see "not read yet" (storage is the
  // browser's), and the client reads it on the render straight after. Cached
  // per mount: the save changes with every edit, and the board must not
  // rebuild itself from its own writes.
  const [mount] = useState(() => ({ read: null as SavedBoard | null }));
  const saved = useSyncExternalStore(
    noSubscription,
    () => (mount.read ??= readSavedBoard()),
    () => null,
  );

  // ONE STORE AT A TIME, built from the save when there is one. With no save
  // expected the sample is drawn at once, as before, and swapped only if a save
  // turns up anyway (the cookie was cleared but storage was not). With one
  // expected, nothing is drawn until it is read.
  const [built, setBuilt] = useState<BuiltBoard | null>(() =>
    hasSavedBoard ? null : fromSample(initialInactiveRows, true),
  );
  if (saved !== null && (built === null || built.from === "sample-provisional")) {
    setBuilt(
      saved.kind === "ok" || built === null
        ? fromSaved(saved, initialInactiveRows)
        : saved.kind === "broken"
          ? { ...built, from: "sample", savingBlockedBy: saved.reason }
          : { ...built, from: "sample" },
    );
  }
  // A NEW ENGINE MEANS A NEW STORE. Only hot reload makes one: an edit to
  // `engine.ts` (or the node types) re-runs it and the bindings, while Fast
  // Refresh keeps this state, so the board held a store from the old engine
  // and the bindings refused it ("built by a different engine"). Rebuilt
  // during render from what is saved now.
  if (built !== null && built.builtBy !== engine) {
    setBuilt(fromSaved(readSavedBoard(), initialInactiveRows));
  }

  // SAVED AFTER EVERY EDIT, undo and redo included (all three come through the
  // change feed; loads and restored switches do not, by design). Batched a
  // moment, and flushed when the page is hidden so the last edit before
  // leaving is not lost. A refused save (the engine found the board would not
  // load back) writes NOTHING, keeps the last good save, and says so.
  const [saveError, setSaveError] = useState<string | null>(null);
  // ANOTHER TAB SAVED this board (see below): "adopted" when this tab had
  // nothing unsaved and took the other tab's version; "conflict" when it had an
  // edit of its own waiting, and saving is paused until the user picks.
  const [otherTab, setOtherTab] = useState<"adopted" | "conflict" | null>(null);
  const store = built?.store ?? null;
  const savingBlockedBy = built?.savingBlockedBy ?? null;
  const savingPaused = savingBlockedBy !== null || otherTab === "conflict";
  useEffect(() => {
    if (store === null || savingPaused) return;
    let timer: number | null = null;
    const flush = () => {
      if (timer === null) return;
      window.clearTimeout(timer);
      timer = null;
      setSaveError(writeSavedBoard(store.getGraph()));
    };
    const release = registerPendingSave({
      pending: () => timer !== null,
      cancel: () => {
        if (timer !== null) window.clearTimeout(timer);
        timer = null;
      },
    });
    const unsubscribe = store.subscribeToChanges(() => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        setSaveError(writeSavedBoard(store.getGraph()));
      }, SAVE_DELAY_MS);
    });
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      flush();
      release();
      unsubscribe();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
    };
  }, [store, savingPaused]);

  // ANOTHER TAB SAVED. Each tab used to hold the board it loaded and write the
  // whole of it back, so a second tab's edit replaced the first tab's without a
  // word (measured: tab A's move was gone after tab B saved). The browser tells
  // every OTHER tab when the save changes (`storage`); this tab then takes the
  // newer board if it has nothing unsaved of its own, and says so. If it does
  // have an edit waiting, that write is held back and the user chooses.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      // `key` is null when storage was cleared outright.
      if (event.key !== null && event.key !== BOARD_SAVE_KEY) return;
      if (hasPendingSave()) {
        cancelPendingSave();
        setOtherTab("conflict");
        return;
      }
      setSaveError(null);
      setOtherTab("adopted");
      setBuilt(fromSaved(readSavedBoard(), []));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // RESET FROM SETTINGS: the save is already cleared there; the board goes
  // back to the sample, every row on.
  useEffect(() => {
    const onReset = () => {
      // Settings has cleared the save, cancelling a write still in its delay;
      // cancelled again here so a reset from anywhere cannot be undone by the
      // old store's cleanup flushing it back.
      cancelPendingSave();
      setSaveError(null);
      setOtherTab(null);
      setBuilt(fromSample([], false));
    };
    window.addEventListener(BOARD_RESET_EVENT, onReset);
    return () => window.removeEventListener(BOARD_RESET_EVENT, onReset);
  }, []);

  if (built === null) {
    return (
      <div
        role="status"
        aria-label="Loading your board"
        data-board-loading
        className="flex flex-1 flex-col gap-3"
      >
        <div className="h-8 w-56 animate-pulse rounded-md bg-zinc-900 motion-reduce:animate-none" />
        {[0, 1, 2, 3].map((row) => (
          <div
            key={row}
            className="h-[4.5rem] animate-pulse rounded-xl border border-zinc-900 bg-zinc-950 motion-reduce:animate-none"
          />
        ))}
      </div>
    );
  }
  const sealed = { length: built.sealedCount };
  return (
    <Provider key={built.id} store={built.store}>
      {built.savingBlockedBy !== null ? (
        <SaveBlockedNotice
          reason={built.savingBlockedBy}
          onStartOver={() => {
            clearSavedBoard();
            setBuilt(fromSample([], false));
          }}
        />
      ) : otherTab === "conflict" ? (
        <OtherTabConflictNotice
          onLoadTheirs={() => {
            setOtherTab(null);
            setBuilt(fromSaved(readSavedBoard(), []));
          }}
          onKeepMine={() => {
            setOtherTab(null);
            setSaveError(writeSavedBoard(built.store.getGraph()));
          }}
        />
      ) : otherTab === "adopted" ? (
        <p
          role="status"
          data-other-tab-adopted
          className="mb-3 flex items-center gap-3 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-200"
        >
          <span className="min-w-0 flex-1">
            Updated with changes made in another tab.
          </span>
          <button
            type="button"
            onClick={() => setOtherTab(null)}
            className="shrink-0 rounded-md px-2 py-0.5 text-sky-100 transition-colors hover:bg-sky-500/20"
          >
            Dismiss
          </button>
        </p>
      ) : saveError !== null ? (
        <p
          role="alert"
          className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
        >
          Your last change could not be saved ({saveError}). The previous save is kept.
        </p>
      ) : null}
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
const noSubscription = () => () => undefined;

/**
 * THIS BOARD WAS CHANGED IN ANOTHER TAB while this one had an edit not yet
 * written. Neither version is thrown away without asking: saving here is
 * paused, and the user picks which one becomes the saved board.
 */
function OtherTabConflictNotice({
  onLoadTheirs,
  onKeepMine,
}: Readonly<{ onLoadTheirs: () => void; onKeepMine: () => void }>) {
  return (
    <div
      role="alert"
      data-other-tab-conflict
      className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
    >
      <span className="min-w-0 flex-1">
        This board was changed in another tab, and your latest change here isn’t saved
        yet. Which version should be kept?
      </span>
      <button
        type="button"
        onClick={onLoadTheirs}
        className="shrink-0 rounded-md border border-amber-400/50 px-2 py-1 text-amber-100 transition-colors hover:border-amber-300 hover:bg-amber-500/10"
      >
        Load the other tab’s
      </button>
      <button
        type="button"
        onClick={onKeepMine}
        className="shrink-0 rounded-md border border-amber-400/50 px-2 py-1 text-amber-100 transition-colors hover:border-amber-300 hover:bg-amber-500/10"
      >
        Keep mine
      </button>
    </div>
  );
}

/**
 * THE SAVED BOARD COULD NOT BE LOADED. The sample is shown instead, and saving
 * is paused: an edit now would write the sample over the only copy of the
 * user's board. Starting over is their call, made here.
 */
function SaveBlockedNotice({
  reason,
  onStartOver,
}: Readonly<{ reason: string; onStartOver: () => void }>) {
  return (
    <div
      role="alert"
      data-save-blocked
      className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
    >
      <span className="min-w-0 flex-1">
        Your saved board couldn’t be loaded ({reason}). It’s kept as it is, and changes
        won’t be saved until you start over. You’re looking at the sample.
      </span>
      <button
        type="button"
        onClick={onStartOver}
        className="shrink-0 rounded-md border border-amber-400/50 px-2 py-1 text-amber-100 transition-colors hover:border-amber-300 hover:bg-amber-500/10"
      >
        Start over from the sample
      </button>
    </div>
  );
}

function BoardBody({
  boardLayout,
  filmStripSize,
}: Readonly<{ boardLayout: BoardLayout; filmStripSize: FilmStripSize }>) {
  const graph = useGraph();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const topId = parseNodeId(FIXTURE_ROOT_ID);

  // THE COOKIE FOLLOWS THE BOARD. Recomputed from the graph after every change,
  // so a switch flipped, undone or redone are all the same event here, and the
  // cookie cannot drift from what is on screen. Ids for rows not in the graph
  // at all (inside a folder not read yet) are carried over, not dropped.
  // Written only when the set actually changed.
  useEffect(() => {
    const saved = inactiveRowsFromCookies(document.cookie);
    const unread = saved.filter((raw) => {
      const parsed = tryParseNodeId(raw);
      return parsed.ok && getNode(graph, parsed.value) === undefined;
    });
    const next = [...switchedOffIds(graph), ...unread];
    if (encodeInactiveRows(next) !== encodeInactiveRows(saved)) writeInactiveRows(next);
  }, [graph]);

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

  // THE PREVIEW (see `board-preview.tsx`). Both rects are measured in the
  // click, after the page is locked still, so the zoom starts on the card
  // exactly where it is on screen.
  const [preview, setPreview] = useState<{
    openedId: NodeId;
    /** Where it was opened from, and so where it prefers to close back into. */
    origin: "card" | "strip";
    from: Rect | null;
    start: { clipId: NodeId; background: string | null; seconds: number; key: number } | null;
    stage: Rect;
    closing: boolean;
  } | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const anchor = useSelectionAnchor();
  const anchorNode = anchor === null ? undefined : getNode(graph, anchor);
  // THE PREVIEW FOLLOWS THE SELECTION: pick another shot in the film strip and
  // that is the one shown. Anything that is not a single clip leaves it on the
  // clip it was showing.
  const previewedId =
    preview === null
      ? null
      : anchor !== null && anchorNode !== undefined && !anchorNode.sealed && anchorNode.kind === "clip"
        ? anchor
        : preview.openedId;

  // THE STAGE: the board's column, from the top of the tree (or of the screen,
  // scrolled past it, or the phone's top bar) down to the film strip.
  const measureStage = (): Rect => {
    const tree = treeRef.current;
    const strip = stripRef.current;
    if (tree === null || strip === null) {
      return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    }
    const column = tree.getBoundingClientRect();
    const bar = document.querySelector("[data-mobile-top-bar]")?.getBoundingClientRect().bottom ?? 0;
    const top = Math.max(column.top, bar, 0);
    const bottom = strip.getBoundingClientRect().top;
    return { left: column.left, top, width: column.width, height: Math.max(0, bottom - top) };
  };

  // Locked BEFORE measuring: the lock can hide the scrollbar, which moves
  // everything, and the gutter class keeps its space when there was one.
  const lockPage = () => {
    const html = document.documentElement;
    if (html.scrollHeight > html.clientHeight) html.classList.add("board-preview-gutter");
    html.classList.add("board-preview-open");
  };
  const openPreview = (id: NodeId) => {
    selection.set([id]);
    lockPage();
    const card = cardPicture(id);
    setPreview({
      openedId: id,
      origin: "card",
      from: card === null ? null : rectOf(card),
      start: null,
      stage: measureStage(),
      closing: false,
    });
  };
  // FROM THE FILM STRIP: the same preview, grown out of the frame that was
  // tapped and playing from the moment it was tapped at. Opened again while
  // it is already up (another shot double-tapped), it stays where it is and
  // only moves to the new shot and moment.
  const openFromStrip = (id: NodeId, origin: FilmStripOpenOrigin) => {
    selection.set([id]);
    const start = {
      clipId: id,
      background: origin.frame?.style.background || null,
      seconds: origin.seconds,
      key: performance.now(),
    };
    if (preview !== null && !preview.closing) {
      setPreview({ ...preview, openedId: id, start });
      return;
    }
    lockPage();
    setPreview({
      openedId: id,
      origin: "strip",
      from: origin.frame === null ? null : stripFrameRect(origin.frame),
      start,
      stage: measureStage(),
      closing: false,
    });
  };
  // BACK WHERE IT CAME FROM when that is still on the page, else the other
  // place the clip is drawn, else nowhere (it fades).
  const returnTo = (id: NodeId): Rect | null => {
    const card = cardPicture(id);
    const frame = stripFrame(id);
    const cardRect = card === null ? null : rectOf(card);
    const frameRect = frame === null ? null : stripFrameRect(frame);
    return preview?.origin === "strip" ? (frameRect ?? cardRect) : (cardRect ?? frameRect);
  };
  const closePreview = () =>
    setPreview((open) => (open === null || open.closing ? open : { ...open, closing: true }));
  const previewClosed = () => {
    // Focus back on the card it closed into, as a dialog hands it back to the
    // button that opened it.
    if (previewedId !== null) {
      if (preview?.origin === "strip") {
        document.querySelector<HTMLElement>("[data-seam-bar]")?.focus({ preventScroll: true });
      } else {
        cardPicture(previewedId)?.closest("button")?.focus({ preventScroll: true });
      }
    }
    setPreview(null);
  };

  // The page's scroll lock lasts exactly as long as the preview is up, and is
  // let go if the board goes away with it open.
  const previewing = preview !== null;
  useEffect(() => {
    if (!previewing) return;
    return () => {
      document.documentElement.classList.remove("board-preview-open", "board-preview-gutter");
    };
  }, [previewing]);
  const treeFaded = preview !== null && !preview.closing;

  return (
    <>
      {/* The breadcrumb to where the board is looking, then the REEL's
          controls: undo, redo and the running time stay about the whole
          document wherever that is. */}
      <TopNav rootId={topId} shownRootId={shownRootId} onGo={focus} />
      {/* THE TREE FADES, AND STAYS MOUNTED, under an open preview: its rows keep
          whatever you had open, and the preview closes back into a card that
          is still where it was. `inert` takes it out of clicks and tabbing
          while it is only scenery. */}
      <div
        ref={treeRef}
        data-board-tree
        inert={treeFaded}
        className={cn(
          "transition-opacity duration-300 motion-reduce:transition-none",
          treeFaded && "opacity-15",
        )}
      >
        <BoardDragProvider>
          <BoardFocusContext value={{ shownRootId, focus }}>
            <BoardLayoutContext value={boardLayout}>
              <BoardPreviewContext value={openPreview}>
                {/* KEYED on the root it shows, so going somewhere is a fresh view:
                    the new top opens and everything inside it starts closed, rather
                    than inheriting whatever state that card had deeper in the tree. */}
                <BranchContext value={rootBranch}>
                  <SwipeGroup>
                    <NodeSlot key={shownRootId} id={shownRootId} />
                  </SwipeGroup>
                </BranchContext>
              </BoardPreviewContext>
            </BoardLayoutContext>
          </BoardFocusContext>
        </BoardDragProvider>
      </div>
      {preview === null || previewedId === null ? null : (
        <BoardPreview
          clipId={previewedId}
          from={preview.from}
          start={preview.start}
          returnTo={returnTo}
          initialStage={preview.stage}
          measureStage={measureStage}
          closing={preview.closing}
          onClose={closePreview}
          onClosed={previewClosed}
        />
      )}
      {/* PINNED TO THE BOTTOM OF THE VIEWPORT. The strip is the reel's timeline,
          so it stays in reach while the board scrolls above it. `sticky` rather
          than `fixed`: it keeps its place in the page's width (beside the rail,
          inside `main`'s padding) with no offsets to keep in step, and it
          settles into its own spot at the end of the board. The background is
          the page's, so cards scrolling under it do not show through. */}
      {/* THE SPACER THAT PUTS THE STRIP AT THE BOTTOM. It grows to fill the
          screen when the board is short, so the strip sits on the bottom edge
          instead of right under the last row; with a tall board it collapses
          to its 24px minimum, the gap the strip used to keep as a margin, and
          `sticky` does the pinning while the page scrolls. The page and `main`
          above are flex columns for this; see `app/page.tsx`. */}
      <div aria-hidden="true" className="min-h-6 flex-1" />
      <div ref={stripRef} data-board-strip className="sticky bottom-0 z-40 bg-zinc-950 pt-3 pb-4 max-md:-mx-2">
        <BoardFilmStrip size={filmStripSize} onOpen={openFromStrip} />
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
