"use client";

import {
  createContext,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";
import { SwitchTrack, type RowAction } from "./row-actions";

/**
 * A ROW THAT SWIPES LEFT, ON A PHONE, TO SHOW WHAT CAN BE DONE TO IT.
 *
 * Below `md` the row's actions are hidden (the ⋮ and "go to" leave the bar)
 * and sit in a tray BEHIND the row, against its right edge. Dragging the row
 * left slides it off the tray; let go past halfway and it snaps open, short of
 * that and it slides back. The tray draws the same `RowAction` list the ⋮ menu
 * does, so the two always offer the same things (see `row-actions.tsx`).
 *
 * ONE ROW OPEN AT A TIME, across the board (`SwipeGroup`): opening one closes
 * any other, and so does a tap anywhere outside the open row. A tap on the open
 * row itself closes it, and is not also taken as a tap on the row's bar.
 *
 * THE PAGE STILL SCROLLS. `touch-action: pan-y` leaves vertical movement to the
 * browser, and a drag only becomes a swipe once it has gone further sideways
 * than down; one that goes down first is left alone for the rest of the
 * gesture. So a thumb scrolling the board does not catch rows on the way.
 *
 * THE BAR STILL TAPS. A press that never travels is not a swipe: its click goes
 * through to the bar and opens or closes the row as it always did. A press that
 * swiped has its click swallowed, so letting go of a swipe does not also fold
 * the row.
 *
 * WIDE SCREENS DO NONE OF THIS: the tray is `md:hidden`, and a press is only
 * considered for a swipe while the narrow media query matches. The same DOM is
 * rendered at every width, so the server's render and the phone's agree.
 */

const NARROW = "(max-width: 767px)";
/** How far a press moves before it is decided to be a swipe or a scroll. */
const DECIDE_PX = 8;
const SNAP_MS = 220;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

type SwipeGroupValue = Readonly<{
  openId: string | null;
  setOpenId: (id: string | null) => void;
}>;

const SwipeGroupContext = createContext<SwipeGroupValue>({
  openId: null,
  setOpenId: () => undefined,
});

/** Holds which row, if any, is swiped open. One per board. */
export function SwipeGroup({ children }: Readonly<{ children: ReactNode }>) {
  const [openId, setOpenId] = useState<string | null>(null);
  return <SwipeGroupContext value={{ openId, setOpenId }}>{children}</SwipeGroupContext>;
}

type Drag = {
  pointerId: number;
  startX: number;
  startY: number;
  /** Where the row sat when the press began: 0, or minus the tray's width. */
  from: number;
  mode: "undecided" | "swipe" | "scroll";
  offset: number;
};

export function SwipeRow({
  id,
  actions,
  className,
  children,
}: Readonly<{
  /** Unique across the board; the group's "which row is open". */
  id: string;
  actions: readonly RowAction[];
  /** For the row's own margins; the swipe wrapper replaces the header's box. */
  className?: string;
  children: ReactNode;
}>) {
  const { openId, setOpenId } = use(SwipeGroupContext);
  const open = openId === id;
  const wrapRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const swallowClickRef = useRef(false);

  const trayWidth = () => trayRef.current?.offsetWidth ?? 0;
  // The row is moved by hand rather than through React state: a swipe moves it
  // on every pointer event, and nothing else on the page depends on where it is.
  const place = (offset: number, animate: boolean) => {
    const row = rowRef.current;
    if (row === null) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.style.transition = animate && !still ? `transform ${SNAP_MS}ms ${EASE}` : "none";
    row.style.transform = offset === 0 ? "" : `translateX(${offset}px)`;
  };

  // FOLLOWS THE GROUP: another row opening, or a tap elsewhere, closes this one.
  useLayoutEffect(() => {
    if (dragRef.current?.mode === "swipe") return;
    place(open ? -trayWidth() : 0, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const wrap = wrapRef.current;
      if (wrap !== null && !wrap.contains(event.target as Node)) setOpenId(null);
    };
    // Widened past the phone breakpoint, the tray is gone; so is "open".
    const onResize = () => {
      if (!window.matchMedia(NARROW).matches) setOpenId(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, setOpenId]);

  const swallowNextClick = () => {
    swallowClickRef.current = true;
    // The click, if one comes, is dispatched straight after the pointerup that
    // set this; a swipe on a touch screen sends none, and the flag must not
    // outlive it to eat the next real tap.
    window.setTimeout(() => {
      swallowClickRef.current = false;
    }, 0);
  };

  return (
    <div
      ref={wrapRef}
      data-swipe-row
      data-swipe-open={open}
      className={cn("relative max-md:overflow-hidden max-md:rounded-lg", className)}
    >
      {/* THE TRAY, behind the row. Inert while covered, so its buttons are
          neither tabbed to nor read out while nobody can see them; the ⋮ and
          "go to" stay reachable to a keyboard and a screen reader instead. */}
      <div
        ref={trayRef}
        inert={!open}
        data-swipe-tray
        className="absolute inset-y-0 right-0 flex items-stretch overflow-hidden rounded-r-lg bg-zinc-900 md:hidden"
      >
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            role={action.checked === undefined ? undefined : "switch"}
            aria-checked={action.checked}
            disabled={action.disabled}
            title={action.title}
            data-swipe-action={action.id}
            onClick={() => {
              action.onSelect();
              // A switch stays in view so it is seen to move; anything else
              // goes somewhere, and the tray closes behind it.
              if (action.checked === undefined) setOpenId(null);
            }}
            className="flex w-20 flex-col items-center justify-center gap-1.5 border-l border-zinc-800 px-1 text-xs text-zinc-300 transition-colors active:bg-zinc-800 disabled:opacity-40"
          >
            <span aria-hidden="true" className="flex h-5 items-center">
              {action.checked === undefined ? action.icon : <SwitchTrack on={action.checked} />}
            </span>
            <span className="max-w-full truncate">{action.label}</span>
          </button>
        ))}
      </div>
      <div
        ref={rowRef}
        data-swipe-front
        style={{ touchAction: "pan-y" }}
        className="relative bg-zinc-950"
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          if (!window.matchMedia(NARROW).matches) return;
          const from = open ? -trayWidth() : 0;
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            from,
            mode: "undecided",
            offset: from,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (drag === null || event.pointerId !== drag.pointerId || drag.mode === "scroll") return;
          const dx = event.clientX - drag.startX;
          const dy = event.clientY - drag.startY;
          if (drag.mode === "undecided") {
            if (Math.abs(dy) > DECIDE_PX && Math.abs(dy) >= Math.abs(dx)) {
              drag.mode = "scroll";
              return;
            }
            if (Math.abs(dx) <= DECIDE_PX) return;
            drag.mode = "swipe";
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // No capture (a synthesised pointer); the moves still arrive here.
            }
            if (openId !== null && openId !== id) setOpenId(null);
          }
          const width = trayWidth();
          let offset = drag.from + dx;
          // RUBBER-BANDED past either end: it gives, but a quarter as much.
          if (offset > 0) offset /= 4;
          else if (offset < -width) offset = -width + (offset + width) / 4;
          drag.offset = offset;
          place(offset, false);
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          if (drag === null || event.pointerId !== drag.pointerId) return;
          dragRef.current = null;
          if (drag.mode === "swipe") {
            swallowNextClick();
            const width = trayWidth();
            const opening = drag.offset < -width / 2;
            place(opening ? -width : 0, true);
            if (opening) setOpenId(id);
            else if (open) setOpenId(null);
          } else if (drag.mode === "undecided" && open) {
            // A tap on an open row closes it, and is only that.
            swallowNextClick();
            setOpenId(null);
          }
        }}
        onPointerCancel={() => {
          const drag = dragRef.current;
          dragRef.current = null;
          if (drag?.mode === "swipe") place(open ? -trayWidth() : 0, true);
        }}
        onClickCapture={(event) => {
          if (!swallowClickRef.current) return;
          swallowClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {children}
      </div>
    </div>
  );
}
