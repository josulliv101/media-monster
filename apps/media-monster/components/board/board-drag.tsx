"use client";

import { getChildren, getParent, type NodeId } from "@josulliv101/nested-collections";
import { createContext, use, useRef, useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";

import { useStore } from "@/lib/engine/bindings";
import { isUnread, readCollection } from "./read-collection";

/**
 * DRAGGING A ROW OR A CLIP to anywhere in the tree: between two rows or two
 * clips at any depth, into any row (a child row included, making the dragged
 * thing its child), or out and up past the end of the row it is in. Rows and
 * clips move by the same rules, the same targets and the same engine check;
 * only the placeholder's shape differs (`dragKind`).
 *
 * PICKED UP BY THE GRIP — at the far right of a row's bar, at the bottom right
 * of a clip card — and nowhere else: a row's bar already means open-or-close
 * (and on a phone, a sideways drag on it is the swipe), and a card already
 * means "open the preview". The grip takes the whole gesture
 * (`touch-action: none`).
 *
 * WHERE IT WILL LAND IS SHOWN BY THE ROWS PARTING: a dashed placeholder opens
 * at that spot, at that depth, and the rows below slide down to make room
 * (`DropPlaceholder`, drawn by the collection that will receive it). Into a
 * closed row, where there is no list to open a gap in, that row is ringed
 * instead. The row being dragged stays where it is, faded, until it lands.
 *
 * WHERE THE POINTER IS decides the target, read off what is under it:
 *   - a clip card: before it on its left half, after it on its right, among
 *     its siblings (cards run left to right);
 *   - anywhere on a row's bar: INTO that row, at the end of what it holds,
 *     except a thin strip along its edges (`EDGE_BAND_PX`):
 *   - the top strip, or the gap just above the bar: before that row, among its
 *     siblings;
 *   - the bottom strip of a CLOSED row: after it (an open row's bottom edge
 *     runs into its own contents, so there it stays "into");
 *   - a row's footer (its "Add clip" line, below everything it holds): after
 *     that row, one level up. This is how a row is moved out and higher: past
 *     the end of the row it is in.
 * INTO GETS NEARLY ALL OF THE BAR. It had only the middle 40%, and because the
 * rows part, a pointer heading down onto a row opened a gap above it first,
 * which pushed the row down and left the pointer on its edge or in the gap:
 * "into" was reachable only dead centre.
 * Anywhere else inside the board keeps the last target, so the cards and the
 * placeholder itself (which the pointer sits on once the rows have parted) do
 * not flicker it away. Outside the board there is no target, and letting go
 * there puts nothing anywhere.
 *
 * A ROW NOT READ YET (B-roll) IS READ ON HOVER. The engine will not move
 * anything into a collection whose real children it has never seen, so
 * hovering one starts the same read its Open button does; the label says
 * "Opening" meanwhile, and the drop is allowed the moment it lands.
 *
 * THE ENGINE DECIDES WHAT IS LEGAL. Every candidate goes through
 * `store.resolveDrop` — the only place a post-removal index is computed — which
 * refuses a row dropped inside its own branch, into a collection not read yet,
 * or anywhere else the graph cannot take it. A refused spot shows no gap and a
 * not-allowed cursor; a spot that would not move it (next to itself) shows
 * nothing either. Letting go dispatches exactly the command it returned, so the
 * move is one undoable step.
 */

export type DropTarget = Readonly<{
  parentId: NodeId;
  /** Among the parent's children as they stand NOW, the dragged row included. */
  index: number;
  kind: "between" | "into";
}>;

export type DragKind = "row" | "clip";

type BoardDragState = Readonly<{
  dragId: NodeId | null;
  dragName: string;
  /** What is being dragged, which decides the placeholder's shape: a full-width
   *  bar for a row, a card-sized slot among the cards for a clip. */
  dragKind: DragKind;
  target: DropTarget | null;
  /** Where the pointer was when the drag began, for the label's first frame;
   *  after that the label is moved by hand, not by rendering. */
  startAt: Readonly<{ x: number; y: number }>;
}>;

type BoardDragValue = Readonly<{
  state: BoardDragState;
  start: (
    id: NodeId,
    name: string,
    kind: DragKind,
    event: React.PointerEvent<HTMLElement>,
  ) => void;
}>;

const IDLE: BoardDragState = {
  dragId: null,
  dragName: "",
  dragKind: "row",
  target: null,
  startAt: { x: 0, y: 0 },
};

const BoardDragContext = createContext<BoardDragValue>({
  state: IDLE,
  start: () => undefined,
});

export function useBoardDrag(): BoardDragValue {
  return use(BoardDragContext);
}

/** The strip along a bar's top (and a closed bar's bottom) that means "beside"
 *  rather than "into"; the gap above a bar, this deep, means "before". */
const EDGE_BAND_PX = 8;
const GAP_ABOVE_PX = 20;
/** How far the pointer moves before a press on the grip becomes a drag. */
const START_PX = 4;
/** Within this far of the top of the window, or of the film strip, the page scrolls. */
const EDGE_PX = 72;
const MAX_SCROLL_PX_PER_FRAME = 18;

type Candidate = Readonly<{ parentId: NodeId; index: number; kind: "between" | "into" }>;

function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      a.parentId === b.parentId &&
      a.index === b.index &&
      a.kind === b.kind)
  );
}

export function BoardDragProvider({ children }: Readonly<{ children: ReactNode }>) {
  const store = useStore();
  const [state, setState] = useState<BoardDragState>(IDLE);
  // Why the spot under the pointer takes nothing: refused outright, or a
  // collection being read so that it can.
  const [refused, setRefused] = useState<"no" | "refused" | "reading">("no");
  const stateRef = useRef<BoardDragState>(IDLE);
  const labelRef = useRef<HTMLDivElement>(null);

  const publish = (next: BoardDragState) => {
    stateRef.current = next;
    setState(next);
  };

  // THE ROW UNDER THE POINTER, as a candidate spot — before it, after it, or
  // into it — or "keep" when the pointer is in the board but not on a row, or
  // null when it has left the board.
  const candidateAt = (x: number, y: number): Candidate | "keep" | null => {
    const hit = document.elementFromPoint(x, y);
    if (hit === null || hit.closest("[data-board-tree]") === null) return null;
    if (hit.closest("[data-drop-placeholder]") !== null) return "keep";
    const graph = store.getGraph();
    const siblingSpot = (id: NodeId, after: boolean): Candidate | "keep" => {
      const parentId = getParent(graph, id);
      if (parentId === null) return "keep";
      const index = getChildren(graph, parentId).indexOf(id);
      return { parentId, index: index + (after ? 1 : 0), kind: "between" };
    };
    const intoSpot = (id: NodeId): Candidate => ({
      parentId: id,
      index: getChildren(graph, id).length,
      kind: "into",
    });

    // A CARD: before it or after it, by which half the pointer is on.
    const card = hit.closest<HTMLElement>("[data-clip-drop]");
    if (card !== null) {
      const box = card.getBoundingClientRect();
      return siblingSpot(card.dataset.clipDrop as NodeId, x > box.left + box.width / 2);
    }
    const header = hit.closest<HTMLElement>("[data-row-header]");
    if (header !== null) {
      const id = header.dataset.rowHeader as NodeId;
      const isRoot = header.dataset.rowRoot === "true";
      const open = header.dataset.rowOpen === "true";
      const box = header.getBoundingClientRect();
      // The row the board is showing has no visible parent to sit beside.
      if (!isRoot && y < box.top + EDGE_BAND_PX) return siblingSpot(id, false);
      if (!isRoot && !open && y > box.bottom - EDGE_BAND_PX) return siblingSpot(id, true);
      return intoSpot(id);
    }
    const footer = hit.closest<HTMLElement>("[data-row-footer]");
    if (footer !== null) {
      const id = footer.dataset.rowFooter as NodeId;
      // Past the end of the board's own top: the end of what it holds.
      return footer.dataset.rowRoot === "true" ? intoSpot(id) : siblingSpot(id, true);
    }
    // THE GAP ABOVE A BAR is "before that row": the space between two rows is
    // where people aim to put something between them.
    for (const above of document.querySelectorAll<HTMLElement>("[data-row-header]")) {
      if (above.dataset.rowRoot === "true") continue;
      const box = above.getBoundingClientRect();
      if (x >= box.left && x <= box.right && y >= box.top - GAP_ABOVE_PX && y < box.top) {
        return siblingSpot(above.dataset.rowHeader as NodeId, false);
      }
    }
    return "keep";
  };

  // THE ENGINE'S VERDICT on a candidate: a target, "stay" (it would not move),
  // or "refused".
  const judge = (
    dragId: NodeId,
    candidate: Candidate,
  ): DropTarget | "stay" | "refused" | "unread" => {
    if (candidate.kind === "into" && isUnread(store.getGraph(), candidate.parentId)) {
      return "unread";
    }
    const resolved = store.resolveDrop({
      type: "move",
      nodeIds: [dragId],
      toParentId: candidate.parentId,
      toIndexBefore: candidate.index,
    });
    if (resolved.ok) return candidate;
    return resolved.error.code === "empty-command" ? "stay" : "refused";
  };

  const start = (
    id: NodeId,
    name: string,
    kind: DragKind,
    event: React.PointerEvent<HTMLElement>,
  ) => {
    if (!event.isPrimary || event.button !== 0 || stateRef.current.dragId !== null) return;
    // The grip's own gesture: not a swipe of the row, not a text selection.
    event.stopPropagation();
    event.preventDefault();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    let lastX = startX;
    let lastY = startY;
    let frame = 0;
    // ARMED ONLY ONCE THE POINTER HAS BEEN CLEAR OF BOTH EDGES. A row sitting
    // just above the film strip starts its drag inside the bottom edge, and
    // scrolling at once moved the board under a pointer that had not gone
    // anywhere: measured, a drop aimed at "Shots, every take" landed in the
    // row that had scrolled under it instead.
    let scrollArmed = false;
    // Collections this drag has started reading, so a hover reads each once.
    const reading = new Set<NodeId>();

    const place = (x: number, y: number) => {
      const label = labelRef.current;
      if (label !== null) label.style.transform = `translate(${x + 14}px, ${y + 10}px)`;
    };

    const retarget = () => {
      const candidate = candidateAt(lastX, lastY);
      if (candidate === "keep") return;
      let next: DropTarget | null = null;
      let why: "no" | "refused" | "reading" = "no";
      if (candidate !== null) {
        const verdict = judge(id, candidate);
        if (verdict === "refused") why = "refused";
        else if (verdict === "unread") {
          why = "reading";
          if (!reading.has(candidate.parentId)) {
            reading.add(candidate.parentId);
            // Once it lands the spot is judged again, still under the pointer.
            void readCollection(store, candidate.parentId).then(() => {
              if (stateRef.current.dragId === id) retarget();
            });
          }
        } else if (verdict !== "stay") next = verdict;
      }
      setRefused(why);
      document.documentElement.classList.toggle("board-drag-refused", why === "refused");
      if (!sameTarget(next, stateRef.current.target)) {
        publish({ ...stateRef.current, target: next });
      }
    };

    // THE PAGE SCROLLS near the top of the window or the film strip, so a row
    // can be taken further than one screen — once armed (above).
    const scroll = () => {
      frame = requestAnimationFrame(scroll);
      const strip = document.querySelector("[data-board-strip]")?.getBoundingClientRect();
      const bottom = strip === undefined ? window.innerHeight : strip.top;
      const inTop = lastY < EDGE_PX;
      const inBottom = lastY > bottom - EDGE_PX;
      if (!scrollArmed) {
        if (!inTop && !inBottom) scrollArmed = true;
        return;
      }
      let step = 0;
      if (inTop) step = -((EDGE_PX - lastY) / EDGE_PX) * MAX_SCROLL_PX_PER_FRAME;
      else if (inBottom) {
        step = (Math.min(EDGE_PX, lastY - (bottom - EDGE_PX)) / EDGE_PX) * MAX_SCROLL_PX_PER_FRAME;
      }
      if (step !== 0) {
        const before = window.scrollY;
        window.scrollBy(0, step);
        if (window.scrollY !== before) retarget();
      }
    };

    const finish = (commit: boolean) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      cancelAnimationFrame(frame);
      document.documentElement.classList.remove("board-dragging", "board-drag-refused");
      const target = stateRef.current.target;
      if (commit && dragging && target !== null) {
        const resolved = store.resolveDrop({
          type: "move",
          nodeIds: [id],
          toParentId: target.parentId,
          toIndexBefore: target.index,
        });
        if (resolved.ok) store.dispatch(resolved.value);
      }
      setRefused("no");
      publish(IDLE);
    };

    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== pointerId) return;
      lastX = move.clientX;
      lastY = move.clientY;
      if (!dragging) {
        if (Math.hypot(lastX - startX, lastY - startY) < START_PX) return;
        dragging = true;
        document.documentElement.classList.add("board-dragging");
        publish({
          dragId: id,
          dragName: name,
          dragKind: kind,
          target: null,
          startAt: { x: lastX, y: lastY },
        });
        frame = requestAnimationFrame(scroll);
      }
      place(lastX, lastY);
      retarget();
    };
    const onUp = (up: PointerEvent) => {
      if (up.pointerId === pointerId) finish(true);
    };
    const onCancel = (cancel: PointerEvent) => {
      if (cancel.pointerId === pointerId) finish(false);
    };
    // ESCAPE PUTS IT BACK, and is only that: nothing else hears it.
    const onKey = (key: KeyboardEvent) => {
      if (key.key !== "Escape") return;
      key.preventDefault();
      key.stopPropagation();
      finish(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
  };

  return (
    <BoardDragContext value={{ state, start }}>
      {children}
      {state.dragId === null ? null : (
        <div
          ref={labelRef}
          aria-hidden="true"
          data-drag-label
          style={{ transform: `translate(${state.startAt.x + 14}px, ${state.startAt.y + 10}px)` }}
          className="pointer-events-none fixed top-0 left-0 z-50 flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900/95 px-3 py-1.5 text-sm font-semibold text-zinc-100 shadow-xl shadow-black/50"
        >
          <GripVertical className="size-3.5 text-zinc-500" />
          {state.dragName}
          {refused === "refused" ? (
            <span className="ml-1 text-xs font-normal text-red-400">Can’t go here</span>
          ) : refused === "reading" ? (
            <span className="ml-1 text-xs font-normal text-amber-300">Opening…</span>
          ) : null}
        </div>
      )}
    </BoardDragContext>
  );
}

/**
 * THE GAP THE BOARD PARTS AROUND: where the dragged thing will land, at the
 * depth it will land. Drawn by the collection that will receive it, among its
 * children, so everything after it moves along to make room: a full-width bar
 * for a row, a card-sized slot among the cards for a clip.
 */
export function DropPlaceholder({ name, kind }: Readonly<{ name: string; kind: DragKind }>) {
  if (kind === "clip") {
    return (
      <div
        data-drop-placeholder
        className="drop-placeholder-card flex flex-col overflow-hidden rounded-lg border-2 border-dashed border-sky-400/60 bg-sky-400/10 text-sky-300"
      >
        <div className="grid aspect-video place-items-center px-3 text-center text-sm">
          <span className="line-clamp-2">{name}</span>
        </div>
        <div className="px-3 py-2 text-xs text-sky-300/80">lands here</div>
      </div>
    );
  }
  return (
    <div
      data-drop-placeholder
      className="drop-placeholder col-span-full flex h-12 items-center rounded-xl border-2 border-dashed border-sky-400/60 bg-sky-400/10 px-4 text-sm text-sky-300"
    >
      <span className="truncate">{name} lands here</span>
    </div>
  );
}

