import {
  HOVER_PLAY_COOKIE,
  HOVER_PLAY_COOKIE_MAX_AGE_SECONDS,
  hoverPlayFromCookies,
  type HoverPlay,
} from "@/components/settings/hover-play-preference";

/**
 * Hover-play as a live store, read with `useSyncExternalStore`: the same shape
 * as the layout and strip-size stores. The choice is also held in memory so a
 * browser that refuses cookies still gets it for the session.
 */
const HOVER_PLAY_EVENT = "mm:hover-play-changed";

let chosenThisSession: HoverPlay | null = null;

export function readHoverPlay(): HoverPlay {
  return chosenThisSession ?? hoverPlayFromCookies(document.cookie);
}

/** What the server renders with: the default. Nothing on the page depends on it. */
export function readHoverPlayOnServer(): HoverPlay {
  return "on";
}

export function subscribeHoverPlay(onChange: () => void): () => void {
  window.addEventListener(HOVER_PLAY_EVENT, onChange);
  return () => window.removeEventListener(HOVER_PLAY_EVENT, onChange);
}

export function commitHoverPlay(next: HoverPlay): void {
  chosenThisSession = next;
  try {
    document.cookie =
      `${HOVER_PLAY_COOKIE}=${next}; path=/;` +
      ` max-age=${HOVER_PLAY_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
  } catch {
    // Cookies blocked: `chosenThisSession` carries it until reload.
  }
  window.dispatchEvent(new Event(HOVER_PLAY_EVENT));
}
