"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { EllipsisVertical } from "lucide-react";

import { cn } from "@/lib/utils";
import { RowMenuItems, type RowAction } from "./row-actions";

/**
 * A ⋮ MENU: a button that opens a small menu of what can be done to a thing —
 * a row (at the far right of its bar) or a clip (on its card) — drawn from its
 * `RowAction` list (see `row-actions.tsx`).
 *
 * A ROW'S IS NOT SHOWN ON A PHONE: there its actions are behind a left swipe on
 * the row (`swipe-row.tsx`). The button is only visually hidden, so a keyboard
 * or a screen reader still reaches the menu, and it shows itself when focused.
 * That is the default look; `buttonClassName` replaces it for a button that
 * sits somewhere else (a clip card's, which has no swipe and always shows).
 *
 * THE BROWSER'S OWN POPOVER, not a positioned div. `popover="auto"` puts the
 * menu in the top layer, so no row's rounded, clipped box can cut it off and no
 * z-index has to win against the sticky film strip. It also brings light
 * dismiss (a click anywhere else, or Escape) and hands focus back to the ⋮
 * button when it closes, for free.
 *
 * PLACED BY HAND, because anchor positioning is not everywhere yet: under the
 * button, right edges aligned, set in `beforetoggle` so the first frame it is
 * shown in is already the right place. Flipped above the button if it would
 * run off the bottom of the window. It closes when the page scrolls, rather
 * than being left hanging where the button used to be.
 */
export function ActionMenu({
  label,
  actions,
  buttonClassName,
}: Readonly<{
  label: string;
  actions: readonly RowAction[];
  /** Replaces the ⋮ button's row look (size, place, phone hiding); its
   *  colours and states stay. */
  buttonClassName?: string;
}>) {
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // The item to focus when the menu next opens, instead of the first: set when
  // the menu is reopened after a move (below).
  const refocusRef = useRef<string | null>(null);
  // An item chosen with the menu meant to stay open, waiting for the render
  // that follows it.
  const reopenRef = useRef<string | null>(null);
  // Set by Escape inside the menu, so its close hands focus back to the ⋮.
  const escapedRef = useRef(false);

  // The menu's items that can be chosen now, in order.
  const items = () =>
    Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)') ?? [],
    );

  // UNDER THE BUTTON, right edges aligned: the menu's left edge on the
  // button's right and a -100% shift (see `style`), exact whatever the menu's
  // width and with no viewport width in the sum (a `right` offset came out a
  // scrollbar's width off). Above the button instead if it would run off the
  // bottom of the window — only measurable once the menu is showing.
  const place = (menu: HTMLElement) => {
    const button = buttonRef.current;
    if (button === null) return;
    const at = button.getBoundingClientRect();
    menu.style.left = `${at.right}px`;
    menu.style.top = `${at.bottom + 4}px`;
    if (!menu.matches(":popover-open")) return;
    const box = menu.getBoundingClientRect();
    if (box.bottom > document.documentElement.clientHeight - 8) {
      menu.style.top = `${at.top - box.height - 4}px`;
    }
  };

  // AFTER THE RENDER THAT MOVED THE ROW, the menu is put back under its button.
  // Two things go wrong otherwise, both measured: React may move the ROWS
  // AROUND this one rather than this one, so the menu stays open where the
  // button used to be (82px off, then 160 after a second move); or it moves
  // this one, the browser closes a popover taken out of the document, and it
  // has to be reopened. A frame after the click is too early for either: the
  // move lands in a React render. A layout effect runs once the row is where it
  // now is.
  useLayoutEffect(() => {
    const want = reopenRef.current;
    if (want === null) return;
    reopenRef.current = null;
    const menu = menuRef.current;
    if (menu === null) return;
    if (!menu.matches(":popover-open")) {
      refocusRef.current = want;
      menu.showPopover();
      return;
    }
    place(menu);
    // Still open: keep focus where it was, unless that item cannot be chosen
    // now (moved to the top, "Move up" is disabled), then the first that can.
    const again = items().find((item) => item.dataset.rowAction === want);
    (again ?? items()[0] ?? menu).focus();
  });

  // AFTER AN ITEM IS CHOSEN. A plain action goes somewhere, so the menu goes.
  // A switch, or an action marked `keepOpen`, stays — and a MOVE takes some
  // doing: moving the row moves its DOM, and a popover taken out of the
  // document is closed by the browser. So the menu is reopened on the moved
  // row, under its button's new place, with the same item focused, and Enter
  // can move it again.
  const afterChosen = (action: RowAction) => {
    const menu = menuRef.current;
    if (menu === null) return;
    if (action.checked === undefined && action.keepOpen !== true) {
      menu.hidePopover();
      return;
    }
    reopenRef.current = action.id;
  };

  useEffect(() => {
    if (!open) return;
    const close = () => menuRef.current?.hidePopover();
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        popoverTarget={menuId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More for ${label}`}
        title="More"
        data-menu-button
        className={cn(
          buttonClassName ??
            // Square, 40px, centred in the row, like "go to" and the grip.
            "flex size-10 shrink-0 items-center justify-center self-center rounded-lg max-md:sr-only max-md:focus-visible:not-sr-only",
          "text-zinc-500 transition-colors hover:bg-zinc-700/60 hover:text-zinc-100 focus-visible:bg-zinc-700/60 focus-visible:text-zinc-100 focus-visible:outline-2 focus-visible:outline-sky-500",
          open && "bg-zinc-700/60 text-zinc-100",
        )}
      >
        <EllipsisVertical className="size-4" aria-hidden="true" />
      </button>
      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        role="menu"
        aria-label={label}
        data-action-menu
        onBeforeToggle={(event) => {
          // Placed before it is first drawn, so it never shows anywhere else.
          if (event.newState === "open") place(event.currentTarget);
        }}
        onToggle={(event) => {
          const opened = event.newState === "open";
          setOpen(opened);
          if (!opened) {
            // ESCAPE PUTS FOCUS BACK ON THE ⋮. The browser does this itself
            // for a menu its button opened, but not after a move has reopened
            // it by hand: measured, focus was left on nothing.
            if (escapedRef.current) buttonRef.current?.focus({ preventScroll: true });
            escapedRef.current = false;
            return;
          }
          const menu = event.currentTarget;
          // Again now that it is showing and has a height: flip above if needed.
          place(menu);
          const want = refocusRef.current;
          refocusRef.current = null;
          // The same item again after a move, unless it cannot be chosen now
          // (moved to the top, "Move up" is disabled): then the first that can.
          const again = items().find((item) => item.dataset.rowAction === want);
          (again ?? items()[0] ?? menu).focus();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            escapedRef.current = true;
            return;
          }
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          const all = items();
          if (all.length === 0) return;
          const at = all.indexOf(document.activeElement as HTMLElement);
          const step = event.key === "ArrowDown" ? 1 : -1;
          all[(at + step + all.length) % all.length]?.focus();
        }}
        tabIndex={-1}
        // The UA sheet centres a popover (`inset: 0; margin: auto`); this one
        // is placed against its button instead.
        style={{ position: "fixed", inset: "auto", margin: 0, translate: "-100% 0" }}
        className="min-w-56 rounded-xl border border-zinc-800 bg-zinc-900 p-1 text-zinc-200 shadow-2xl shadow-black/60"
      >
        <RowMenuItems actions={actions} onChosen={afterChosen} />
      </div>
    </>
  );
}
