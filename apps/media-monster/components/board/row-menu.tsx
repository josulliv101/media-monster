"use client";

import { useEffect, useId, useRef, useState } from "react";
import { EllipsisVertical } from "lucide-react";

import { cn } from "@/lib/utils";
import { RowMenuItems, type RowAction } from "./row-actions";

/**
 * A ROW'S ⋮ MENU: a button at the far right of a collection's row that opens a
 * small menu of what can be done to that row: the row's `RowAction` list (see
 * `row-actions.tsx`), which the phone's swipe tray draws too.
 *
 * NOT SHOWN ON A PHONE: there the same actions are behind a left swipe on the
 * row (`swipe-row.tsx`). The button is only visually hidden, so a keyboard or
 * a screen reader still reaches the menu, and it shows itself when focused.
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
export function RowMenu({
  label,
  actions,
}: Readonly<{ label: string; actions: readonly RowAction[] }>) {
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

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

  const items = () =>
    Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)') ?? [],
    );

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
        data-row-menu-button
        className={cn(
          "flex shrink-0 items-center self-stretch rounded-lg px-1.5 max-md:sr-only max-md:focus-visible:not-sr-only text-zinc-500 transition-colors hover:bg-zinc-700/60 hover:text-zinc-100 focus-visible:bg-zinc-700/60 focus-visible:text-zinc-100 focus-visible:outline-2 focus-visible:outline-sky-500",
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
        data-row-menu
        onBeforeToggle={(event) => {
          const menu = event.currentTarget;
          const button = buttonRef.current;
          if (event.newState !== "open" || button === null) return;
          const at = button.getBoundingClientRect();
          // RIGHT EDGES ALIGNED by its left edge on the button's right and a
          // -100% shift: exact whatever the menu's width, which is not known
          // yet, and with no viewport width in the sum (a `right` offset came
          // out a scrollbar's width off).
          menu.style.left = `${at.right}px`;
          menu.style.top = `${at.bottom + 4}px`;
        }}
        onToggle={(event) => {
          const opened = event.newState === "open";
          setOpen(opened);
          if (!opened) return;
          const menu = event.currentTarget;
          const button = buttonRef.current;
          const box = menu.getBoundingClientRect();
          if (button !== null && box.bottom > document.documentElement.clientHeight - 8) {
            menu.style.top = `${button.getBoundingClientRect().top - box.height - 4}px`;
          }
          (items()[0] ?? menu).focus();
        }}
        onKeyDown={(event) => {
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
        <RowMenuItems actions={actions} />
      </div>
    </>
  );
}
