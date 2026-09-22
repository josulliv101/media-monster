"use client";

import { useSyncExternalStore, type RefObject } from "react";
import { X } from "lucide-react";
import type { FilmStripSize } from "@storyboard/ui/film-strip";

import {
  commitFilmStripSize,
  readFilmStripSize,
  subscribeFilmStripSize,
} from "@/components/settings/film-strip-size-store";
import { cn } from "@/lib/utils";

const SIZES: readonly { value: FilmStripSize; label: string; description: string }[] = [
  { value: "default", label: "Default", description: "Tall frames." },
  { value: "compact", label: "Compact", description: "Short frames. More room for the board." },
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

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-zinc-300">Film strip size</legend>
        <div className="grid gap-2">
          {SIZES.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                size === option.value
                  ? "border-sky-500/60 bg-sky-500/10"
                  : "border-zinc-800 hover:border-zinc-700",
              )}
            >
              <input
                type="radio"
                name="film-strip-size"
                value={option.value}
                checked={size === option.value}
                onChange={() => commitFilmStripSize(option.value)}
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
    </div>
  );
}
