import type { ClipMedia } from "@/lib/engine/node-types";
import { imageUrl, videoFrameUrl } from "@/lib/media/cloudinary";

/** The size a clip card's picture is asked for at. */
export const CARD_THUMB = { width: 480, height: 270 } as const;

/**
 * The still a clip card shows: the image itself for an image clip, a frame
 * from early in the shot for a video.
 *
 * ONE FUNCTION FOR THE CARD AND THE PREVIEW, because the preview grows out of
 * the card: it starts on exactly the picture the card was showing, which is
 * already in the browser's cache, so the zoom never begins on a blank box.
 */
export function cardStill(media: ClipMedia | null, seconds: number): string | null {
  if (media === null) return null;
  if (media.kind === "image") return imageUrl(media.src, CARD_THUMB) ?? media.src;
  return videoFrameUrl(media.src, Math.min(0.35, seconds / 2), CARD_THUMB);
}
