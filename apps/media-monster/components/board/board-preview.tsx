"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getNode, type NodeId } from "@josulliv101/nested-collections";
import { X } from "lucide-react";

import { useGraph } from "@/lib/engine/bindings";
import { imageUrl } from "@/lib/media/cloudinary";
import { cn } from "@/lib/utils";
import { cardStill } from "./clip-still";

/**
 * THE PREVIEW: one clip, large, centred in the space the tree was using.
 *
 * IT GROWS OUT OF THE CARD. Opening measures the card's picture and the stage
 * (the board's column, from the top of the tree down to the film strip); the
 * preview is laid out at its final place and a FLIP animation starts it on top
 * of the card, so what you see is the card you clicked getting bigger. Closing
 * runs the same thing backwards, into wherever that clip's card is now. The
 * film strip opens it the same way (`BoardBody.openFromStrip`), out of the
 * frame that was tapped, and it closes back into the strip. The
 * tree behind fades while it is open (`BoardBody`), and stays mounted, so the
 * rows you had open are still open when you come back.
 *
 * STARTS ON THE CARD'S OWN STILL, the same URL at the same size (see
 * `clip-still.ts`), so the zoom never begins on an empty box. Once it lands,
 * the real thing — the video with controls, or the full-size image — goes on
 * top of it.
 *
 * THE PAGE DOES NOT SCROLL WHILE IT IS OPEN (see `board-preview-open` in
 * globals.css). Both rects are viewport positions; letting the tree scroll
 * under a preview measured against it would leave the preview hanging over the
 * wrong place, and the card it closes into somewhere else.
 */

export type Rect = Readonly<{ left: number; top: number; width: number; height: number }>;

const OPEN_MS = 380;
const CLOSE_MS = 300;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const FULL = { width: 1920, height: 1080 } as const;

export function rectOf(element: Element): Rect {
  const r = element.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/** The picture on `id`'s card, if its card is on the page. Matched by
 *  comparing the attribute rather than building a selector, so an id with
 *  quotes or brackets in it cannot break the query. */
export function cardPicture(id: NodeId): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>("[data-clip-picture]")) {
    if (element.dataset.clipPicture === id) return element;
  }
  return null;
}

/**
 * The frame of `id`'s box in the film strip to grow out of or shrink back
 * into: the one under the playhead, else the first one on screen.
 */
export function stripFrame(id: NodeId): HTMLElement | null {
  const box = Array.from(document.querySelectorAll<HTMLElement>("[data-seam-segment]")).find(
    (candidate) => candidate.dataset.seamSegment === id,
  );
  if (box === undefined) return null;
  const frames = Array.from(box.querySelectorAll<HTMLElement>("[data-seam-thumbnail]"));
  const playhead = document.querySelector("[data-seam-playhead]")?.getBoundingClientRect();
  const viewport = document.querySelector("[data-seam-viewport]")?.getBoundingClientRect();
  const under =
    playhead === undefined
      ? undefined
      : frames.find((frame) => {
          const r = frame.getBoundingClientRect();
          return playhead.left >= r.left && playhead.left <= r.right;
        });
  const shown =
    viewport === undefined
      ? undefined
      : frames.find((frame) => {
          const r = frame.getBoundingClientRect();
          return r.right > viewport.left && r.left < viewport.right;
        });
  return under ?? shown ?? frames[0] ?? null;
}

/**
 * A strip frame as a 16:9 rect: its height, centred on it. The frames are not
 * 16:9 (a box's width is its duration, cut into frames), and growing a
 * non-16:9 rect into the preview would stretch the picture on the way.
 */
export function stripFrameRect(frame: Element): Rect {
  const r = rectOf(frame);
  const width = (r.height * 16) / 9;
  return { left: r.left + (r.width - width) / 2, top: r.top, width, height: r.height };
}

/** The largest 16:9 box that fits in `stage`, centred in it. The card's
 *  picture is 16:9 too, so growing one into the other is a plain scale. */
function fit(stage: Rect): Rect {
  const width = Math.max(0, Math.min(stage.width, (stage.height * 16) / 9));
  const height = (width * 9) / 16;
  return {
    left: stage.left + (stage.width - width) / 2,
    top: stage.top + (stage.height - height) / 2,
    width,
    height,
  };
}

/** The transform that makes a box laid out at `to` cover `from` instead. */
function covering(from: Rect, to: Rect): string {
  if (to.width === 0 || to.height === 0) return "none";
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  return `translate(${dx}px, ${dy}px) scale(${from.width / to.width}, ${from.height / to.height})`;
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Runs an animation and calls `done` when it ends.
 *
 * A BACKSTOP TIMER finishes it if the browser never does: a tab that is not
 * painting (a background tab, a headless pane) never advances an animation, and
 * a preview that could not finish closing would sit over the board for good.
 */
function play(
  element: HTMLElement,
  keyframes: Keyframe[],
  duration: number,
  done: () => void,
): () => void {
  const animation = element.animate(keyframes, { duration, easing: EASE, fill: "forwards" });
  const backstop = window.setTimeout(() => animation.finish(), duration + 150);
  animation.onfinish = () => {
    window.clearTimeout(backstop);
    done();
  };
  return () => {
    window.clearTimeout(backstop);
    animation.onfinish = null;
    animation.cancel();
  };
}

export function BoardPreview({
  clipId,
  from,
  start,
  returnTo,
  initialStage,
  measureStage,
  closing,
  onClose,
  onClosed,
}: Readonly<{
  /** The clip shown. Follows the selection, so picking a shot in the film
   *  strip while this is open shows that shot. */
  clipId: NodeId;
  /** Where the card's picture was when it was clicked; `null` if it was not on
   *  the page (it then simply appears). */
  from: Rect | null;
  /**
   * How the open looked and where to play from, when it was opened from the
   * film strip: the strip frame's own background (so the zoom starts on the
   * very picture it came from) and the moment in the shot to start at. Only
   * for `start.clipId`; a clip picked afterwards starts from its card still
   * and its first frame. `key` is new for every open, so opening the same
   * shot again seeks again.
   */
  start: Readonly<{ clipId: NodeId; background: string | null; seconds: number; key: number }> | null;
  /** Where to shrink back to on close, for the clip then shown, or `null` to
   *  fade out where it is. */
  returnTo: (id: NodeId) => Rect | null;
  /** The stage when it opened, measured in the same click. */
  initialStage: Rect;
  /** Measures the stage again, for when the window changes size. */
  measureStage: () => Rect;
  /** Set when a close was asked for: the preview shrinks back, then calls `onClosed`. */
  closing: boolean;
  onClose: () => void;
  onClosed: () => void;
}>) {
  const graph = useGraph();
  const node = getNode(graph, clipId);
  const clip = node !== undefined && !node.sealed && node.kind === "clip" ? node.data : null;

  const [stage, setStage] = useState(initialStage);
  const [landed, setLanded] = useState(() => from === null || reducedMotion());
  const boxRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const box = fit(stage);

  useEffect(() => {
    const onResize = () => setStage(measureStage());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measureStage]);

  // OPEN: laid out at its final place, and started over the card before the
  // first paint, so it is never seen anywhere but growing out of the card.
  useLayoutEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const element = boxRef.current;
    if (element === null || from === null || reducedMotion()) return;
    return play(element, [{ transform: covering(from, fit(initialStage)) }, { transform: "none" }], OPEN_MS, () =>
      setLanded(true),
    );
    // Once, on open: a resize mid-zoom lands at the new size without restarting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CLOSE: into wherever this clip's card is now. It may be a different card
  // from the one that opened it (another shot picked in the strip), and it may
  // not be on the page at all (inside a collapsed row), in which case the
  // preview fades where it is.
  useLayoutEffect(() => {
    if (!closing) return;
    const element = boxRef.current;
    if (element === null || reducedMotion()) {
      onClosed();
      return;
    }
    const to = returnTo(clipId);
    const keyframes: Keyframe[] =
      to === null
        ? [
            { opacity: 1, transform: "none" },
            // Shrinks about its centre; the box's own origin is its corner.
            {
              opacity: 0,
              transform: `translate(${fit(stage).width * 0.03}px, ${fit(stage).height * 0.03}px) scale(0.94)`,
            },
          ]
        : [{ transform: "none" }, { transform: covering(to, fit(stage)) }];
    return play(element, keyframes, CLOSE_MS, onClosed);
    // The close is started once; later renders must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  useEffect(() => {
    if (closing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closing, onClose]);

  const still = clip === null ? null : cardStill(clip.media, clip.seconds);
  const startHere = start !== null && start.clipId === clipId ? start : null;
  // BLACK BEHIND THE VIDEO ONLY ONCE IT HAS A FRAME. Before that the still
  // underneath has to show through, or opening would flash to black while the
  // video loads; after, the letterbox of a clip that is not 16:9 must be black
  // rather than the edges of a still cropped to 16:9.
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const videoKey = `${clipId}:${startHere?.key ?? 0}`;
  // The real media only once the zoom has landed, and not while it shrinks
  // back: the card shows the still, so the still is what goes back into it.
  const showFull = landed && !closing && clip !== null && clip.media !== null;

  return (
    <>
      {/* The stage behind the preview: a click on it, beside the picture, closes. */}
      <div
        aria-hidden="true"
        data-board-preview-stage
        onClick={closing ? undefined : onClose}
        className="fixed z-30"
        style={{ left: stage.left, top: stage.top, width: stage.width, height: stage.height }}
      />
      <div
        ref={boxRef}
        role="dialog"
        aria-label={clip === null ? "Preview" : `Preview: ${clip.title}`}
        data-board-preview
        data-landed={landed}
        data-closing={closing}
        className="fixed z-30 overflow-hidden rounded-xl bg-zinc-900 shadow-2xl shadow-black/60 ring-1 ring-zinc-800"
        style={{
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          transformOrigin: "0 0",
        }}
      >
        {startHere?.background ? (
          <div className="absolute inset-0" style={{ background: startHere.background }} />
        ) : still === null ? (
          <div className="grid size-full place-items-center text-sm text-zinc-600">No media</div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- the card's own cached still
          <img src={still} alt="" className="absolute inset-0 size-full object-cover" />
        )}
        {showFull && clip.media !== null ? (
          clip.media.kind === "video" ? (
            <video
              key={videoKey}
              src={clip.media.src}
              controls
              autoPlay
              playsInline
              onLoadedMetadata={(event) => {
                const at = startHere?.seconds ?? 0;
                const video = event.currentTarget;
                if (at > 0.05) video.currentTime = Math.min(at, Math.max(0, video.duration - 0.05));
              }}
              onLoadedData={() => setReadyFor(videoKey)}
              className={cn(
                "absolute inset-0 size-full object-contain",
                readyFor === videoKey && "bg-black",
              )}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- a Cloudinary transform is already the optimised image
            <img
              key={clipId}
              src={imageUrl(clip.media.src, FULL) ?? clip.media.src}
              alt={clip.title}
              className="absolute inset-0 size-full object-cover"
            />
          )
        ) : null}
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent pt-3 pr-14 pb-8 pl-4 transition-opacity duration-200",
            landed && !closing ? "opacity-100" : "opacity-0",
          )}
        >
          <span className="block truncate text-sm font-medium text-zinc-50">{clip?.title}</span>
        </div>
        <button
          ref={closeRef}
          type="button"
          aria-label="Close preview"
          data-board-preview-close
          onClick={onClose}
          className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-black/60 text-zinc-200 transition-colors hover:bg-black/80 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-500"
        >
          <X className="size-4" />
        </button>
      </div>
    </>
  );
}
