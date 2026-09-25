import type { AnchorHTMLAttributes, ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import { Rail } from "./rail";

// `next/link` needs Next's router; the rail only needs an anchor.
vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Tells React this is a test, so the `act` calls below flush each interaction's
// updates and effects before the assertions after it run.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mountRail(): Promise<void> {
  host = document.createElement("div");
  document.body.append(host);
  const created = createRoot(host);
  root = created;
  await act(async () => created.render(<Rail />));
}

const rail = () => {
  const found = document.getElementById("rail");
  if (found === null) throw new Error("the rail did not render");
  return found;
};
const menuButton = () => {
  const found = document.querySelector<HTMLButtonElement>("[data-rail-menu]");
  if (found === null) throw new Error("no menu button");
  return found;
};
const focusIsInRail = () => rail().contains(document.activeElement);

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

/**
 * THE CLOSED MOBILE DRAWER IS OUT OF REACH.
 *
 * It was only parked off-screen by a transform, which leaves every control in
 * it focusable: Shift+Tab from "Open menu" landed on Settings at x = -240..-1,
 * at 390px wide, a focus ring nobody could see in a drawer that looked closed.
 */
describe("the rail as a drawer (narrow screen)", () => {
  beforeEach(async () => {
    await page.viewport(390, 844);
    await mountRail();
  });

  it("is inert while closed, so Shift+Tab from the menu button does not enter it", async () => {
    expect(rail().inert).toBe(true);
    menuButton().focus();
    await act(() => userEvent.tab({ shift: true }));
    expect(focusIsInRail()).toBe(false);
  });

  it("takes focus when it opens, and its controls can be reached", async () => {
    await act(() => userEvent.click(menuButton()));
    expect(rail().inert).toBe(false);
    expect(focusIsInRail()).toBe(true);
    const settings = rail().querySelector<HTMLButtonElement>("[data-rail-settings]");
    settings?.focus();
    expect(document.activeElement).toBe(settings);
  });

  /**
   * TAB STAYS IN THE OPEN DRAWER. It walked off the last control onto whatever
   * followed in the page — here the top bar, in the app the board under the
   * backdrop — so focus landed on things nobody could see or press.
   */
  it("keeps Tab inside the open drawer, wrapping at both ends", async () => {
    await act(() => userEvent.click(menuButton()));
    const stops = Array.from(
      rail().querySelectorAll<HTMLElement>("a[href], button:not([disabled])"),
    ).filter((element) => element.getClientRects().length > 0);
    const first = stops[0];
    const last = stops.at(-1);
    expect(stops.length).toBeGreaterThan(1);
    expect(document.activeElement).toBe(first);

    await act(() => userEvent.tab({ shift: true }));
    expect(document.activeElement).toBe(last);
    await act(() => userEvent.tab());
    expect(document.activeElement).toBe(first);

    // Round the whole drawer twice: never out of it.
    for (let press = 0; press < stops.length * 2; press += 1) {
      await act(() => userEvent.tab());
      expect(focusIsInRail()).toBe(true);
    }
    for (let press = 0; press < stops.length * 2; press += 1) {
      await act(() => userEvent.tab({ shift: true }));
      expect(focusIsInRail()).toBe(true);
    }
  });

  it("brings focus found outside the open drawer back in on the next Tab", async () => {
    await act(() => userEvent.click(menuButton()));
    menuButton().focus();
    expect(focusIsInRail()).toBe(false);
    await act(() => userEvent.tab());
    expect(focusIsInRail()).toBe(true);
  });

  // Settings opens from inside the drawer as a native modal `<dialog>`, which
  // makes the drawer inert behind it. A trap that still claimed Tab there would
  // cancel every press and pin focus to one control of the dialog.
  it("leaves Tab alone inside Settings opened from the drawer", async () => {
    await act(() => userEvent.click(menuButton()));
    const settings = rail().querySelector<HTMLButtonElement>("[data-rail-settings]");
    if (settings === null) throw new Error("no settings button");
    await act(() => userEvent.click(settings));
    const dialog = document.querySelector<HTMLDialogElement>("dialog[open]");
    if (dialog === null) throw new Error("settings did not open");
    const inDialog = () => dialog.contains(document.activeElement);
    expect(inDialog()).toBe(true);
    const visited = new Set<Element | null>([document.activeElement]);
    for (let press = 0; press < 3; press += 1) {
      await act(() => userEvent.tab());
      expect(inDialog()).toBe(true);
      visited.add(document.activeElement);
    }
    expect(visited.size).toBeGreaterThan(1);
    await act(async () => dialog.close());
  });

  it("is a modal dialog while open, and a plain aside while closed", async () => {
    expect(rail().getAttribute("role")).toBeNull();
    expect(rail().getAttribute("aria-modal")).toBeNull();
    await act(() => userEvent.click(menuButton()));
    expect(rail().getAttribute("role")).toBe("dialog");
    expect(rail().getAttribute("aria-modal")).toBe("true");
    expect(rail().getAttribute("aria-label")).toBe("Menu");
    await act(() => userEvent.keyboard("{Escape}"));
    expect(rail().getAttribute("role")).toBeNull();
  });

  it("gives focus back to the menu button when Escape closes it", async () => {
    await act(() => userEvent.click(menuButton()));
    expect(focusIsInRail()).toBe(true);
    await act(() => userEvent.keyboard("{Escape}"));
    expect(rail().inert).toBe(true);
    expect(document.activeElement).toBe(menuButton());
  });

  it("gives focus back to the menu button when the backdrop closes it", async () => {
    await act(() => userEvent.click(menuButton()));
    const backdrop = document.querySelector<HTMLElement>("[data-rail-backdrop]");
    if (backdrop === null) throw new Error("no backdrop");
    await act(async () => backdrop.click());
    expect(rail().inert).toBe(true);
    expect(document.activeElement).toBe(menuButton());
  });
});

describe("the rail as a column (wide screen)", () => {
  beforeEach(async () => {
    await page.viewport(1280, 800);
    await mountRail();
  });

  it("is never inert, never a dialog: the column is always on screen", async () => {
    expect(rail().inert).toBe(false);
    expect(rail().getAttribute("role")).toBeNull();
    const settings = rail().querySelector<HTMLButtonElement>("[data-rail-settings]");
    settings?.focus();
    expect(document.activeElement).toBe(settings);
  });
});
