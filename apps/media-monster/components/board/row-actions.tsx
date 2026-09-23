"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * WHAT CAN BE DONE TO A ROW, as data: ONE list, drawn two ways.
 *
 * On a wide screen the actions live in the row's ⋮ menu (`row-menu.tsx`); on a
 * phone they are hidden, and a left swipe on the row shows them in a tray
 * behind it (`swipe-row.tsx`). Both read the same list, so an action added
 * here turns up in both, and the two cannot drift into offering different
 * things (see issue #679).
 *
 * `checked` makes it a switch (drawn with `SwitchTrack`, announced as one);
 * without it, it is a plain button. Choosing a switch leaves the menu or tray
 * open so the switch is seen to move; choosing a plain action is expected to
 * go somewhere, and the caller closes whatever it was in.
 */
export type RowAction = Readonly<{
  id: string;
  label: string;
  /** A second, quieter line: the state, or why it is disabled. */
  hint?: string;
  icon?: ReactNode;
  checked?: boolean;
  disabled?: boolean;
  /** A tooltip, for the reason something is disabled. */
  title?: string;
  onSelect: () => void;
}>;

/**
 * An on/off switch: a track, and a knob that slides right when on. Drawn only;
 * the menu item or button around it owns the semantics.
 */
export function SwitchTrack({ on }: Readonly<{ on: boolean }>) {
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

/** The actions as items of the ⋮ menu. */
export function RowMenuItems({ actions }: Readonly<{ actions: readonly RowAction[] }>) {
  return actions.map((action) => (
    <button
      key={action.id}
      type="button"
      role={action.checked === undefined ? "menuitem" : "menuitemcheckbox"}
      aria-checked={action.checked}
      disabled={action.disabled}
      title={action.title}
      data-row-action={action.id}
      onClick={action.onSelect}
      className="flex w-full items-center justify-between gap-6 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-zinc-800 focus-visible:bg-zinc-800 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        {action.icon === undefined ? null : (
          <span aria-hidden="true" className="text-zinc-400">
            {action.icon}
          </span>
        )}
        <span className="flex min-w-0 flex-col">
          <span className="text-sm text-zinc-100">{action.label}</span>
          {action.hint === undefined ? null : (
            <span className="text-xs text-zinc-500">{action.hint}</span>
          )}
        </span>
      </span>
      {action.checked === undefined ? null : <SwitchTrack on={action.checked} />}
    </button>
  ));
}
