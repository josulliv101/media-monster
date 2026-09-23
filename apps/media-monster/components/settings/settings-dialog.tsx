"use client";

import { useSyncExternalStore, type RefObject } from "react";
import { X } from "lucide-react";
import type { FilmStripSize } from "@storyboard/ui/film-strip";

import {
  commitFilmStripSize,
  readFilmStripSize,
  subscribeFilmStripSize,
} from "@/components/settings/film-strip-size-store";
import {
  commitBoardLayout,
  readBoardLayout,
  subscribeBoardLayout,
} from "@/components/settings/board-layout-store";
import type { BoardLayout } from "@/components/settings/board-layout-preference";
import {
  commitHoverPlay,
  readHoverPlay,
  subscribeHoverPlay,
} from "@/components/settings/hover-play-store";
import type { HoverPlay } from "@/components/settings/hover-play-preference";
import { cn } from "@/lib/utils";

/** One setting's options: a value, what to call it, and what it does. */
type Choice<T extends string> = Readonly<{ value: T; label: string; description: string }>;

const SIZES: readonly Choice<FilmStripSize>[] = [
  { value: "default", label: "Default", description: "Tall frames." },
  { value: "compact", label: "Compact", description: "Short frames. More room for the board." },
];

const LAYOUTS: readonly Choice<BoardLayout>[] = [
  {
    value: "grid",
    label: "Grid",
    description: "Clips wrap onto as many rows as they need. Everything on screen at once.",
  },
  {
    value: "row",
    label: "Row",
    description: "One row per collection, running off the right edge. Scroll it sideways, like the film strip.",
  },
];

const HOVER_PLAY: readonly Choice<HoverPlay>[] = [
  {
    value: "on",
    label: "On",
    description: "A clip plays when the pointer comes to rest on it, not as it passes over.",
  },
  { value: "off", label: "Off", description: "Clips show their still until you open them." },
];

/**
 * The app's settings, in a modal.
 *
 * A NATIVE `<dialog>` opened with `showModal()`, because that is the whole
 * modal contract with nothing to maintain: the page behind goes inert, focus
 * moves in and is kept there, Escape closes it, and `::backdrop` is the
 * overlay. The app has no dialog library, and this does not need one.
 *
 * The dialog element is always in the DOM (the opener holds a ref to it), but
 * its CONTENTS render only while it is open. That keeps the settings, which
 * read client-only stores, out of the server render and out of hydration.
 */
export function SettingsDialog({
  dialogRef,
  open,
  onClose,
}: Readonly<{
  dialogRef: RefObject<HTMLDialogElement | null>;
  open: boolean;
  onClose: () => void;
}>) {
  // EVERY WAY OUT CLOSES AND REPORTS, rather than waiting for the dialog's
  // `close` event. That event is queued as a task, not fired in the call, and
  // the in-app browser pane was measured never delivering it — the button's
  // `aria-expanded` stayed true after the dialog shut. Escape is caught as a
  // keydown, handled below; the X and the backdrop call this directly.
  // `onClose` stays wired too, for any path this list does not name (a form
  // with method="dialog", a browser's own close); reporting twice is harmless.
  const close = () => {
    dialogRef.current?.close();
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="settings-title"
      // ESCAPE IS HANDLED AS A KEY, not left to the browser's `cancel`. The
      // in-app pane delivered the keydown to the dialog and then, measured
      // twice, sometimes fired `cancel` and never closed, sometimes fired
      // nothing. `preventDefault` here stops a real browser from ALSO running
      // its own cancel, so Escape closes exactly once everywhere.
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        close();
      }}
      // Any other cancel request (a platform back gesture): same path.
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={onClose}
      // A click on the dialog element itself, not its panel, is a click on the
      // backdrop: the panel fills the dialog, so only the overlay is left.
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-zinc-800 bg-zinc-950 p-0 text-zinc-100 shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      {open ? <SettingsPanel onDone={close} /> : null}
    </dialog>
  );
}

function SettingsPanel({ onDone }: Readonly<{ onDone: () => void }>) {
  const size = useSyncExternalStore(subscribeFilmStripSize, readFilmStripSize, readFilmStripSize);
  const layout = useSyncExternalStore(subscribeBoardLayout, readBoardLayout, readBoardLayout);
  const hoverPlay = useSyncExternalStore(subscribeHoverPlay, readHoverPlay, readHoverPlay);

  return (
    <div data-settings-panel className="p-5">
      <header className="mb-4 flex items-center justify-between">
        <h2 id="settings-title" className="text-base font-semibold">
          Settings
        </h2>
        <button
          type="button"
          aria-label="Close settings"
          onClick={onDone}
          className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="grid gap-5">
        <ChoiceGroup
          legend="Board items"
          name="board-layout"
          options={LAYOUTS}
          chosen={layout}
          onChoose={commitBoardLayout}
        />
        <ChoiceGroup
          legend="Play clips on hover"
          name="hover-play"
          options={HOVER_PLAY}
          chosen={hoverPlay}
          onChoose={commitHoverPlay}
        />
        <ChoiceGroup
          legend="Film strip size"
          name="film-strip-size"
          options={SIZES}
          chosen={size}
          onChoose={commitFilmStripSize}
        />
      </div>
    </div>
  );
}

/**
 * One setting as a radio group, because two of them written out were the same
 * twenty lines twice — and a third would have been a third copy.
 *
 * RADIOS, not a switch or a select: the options are named states the reader
 * should be able to compare before picking, and each carries a line saying what
 * it does. Generic in the value so a group cannot be handed options of one
 * setting and the setter of another.
 */
function ChoiceGroup<T extends string>({
  legend,
  name,
  options,
  chosen,
  onChoose,
}: Readonly<{
  legend: string;
  name: string;
  options: readonly Choice<T>[];
  chosen: T;
  onChoose: (value: T) => void;
}>) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-zinc-300">{legend}</legend>
      <div className="grid gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
              chosen === option.value
                ? "border-sky-500/60 bg-sky-500/10"
                : "border-zinc-800 hover:border-zinc-700",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={chosen === option.value}
              onChange={() => onChoose(option.value)}
              className="mt-0.5 accent-sky-500"
            />
            <span>
              <span className="block text-sm text-zinc-100">{option.label}</span>
              <span className="block text-xs text-zinc-500">{option.description}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
