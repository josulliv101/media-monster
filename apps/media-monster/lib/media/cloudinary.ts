/**
 * Stills from a Cloudinary delivery URL, by transformation rather than storage.
 *
 * Cloudinary renders a frame of a video at any second on request: `so_<t>`
 * picks the moment, `f_jpg` makes it a picture, and `w_`/`h_`/`c_fill` size it.
 * So a clip stores ONE url and every poster and filmstrip frame is derived from
 * it — the same seam `timeline-gstudio001/lib/video-frame-url.ts` uses.
 *
 * A url this does not recognise returns `null`, and callers fall back to a
 * placeholder rather than guessing at a path.
 */

const VIDEO = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(?:v\d+\/)?(.+)\.(?:mp4|webm|mov)$/;
const IMAGE = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(?:v\d+\/)?(.+)\.(?:png|jpe?g|webp)$/;

type Size = Readonly<{ width: number; height: number }>;

/** A still of `src` at `seconds` into the video. Quantised to a tenth of a
 *  second so a strip redrawn at a new zoom asks for the same, cached frames. */
export function videoFrameUrl(src: string, seconds: number, size: Size): string | null {
  const match = VIDEO.exec(src);
  if (match === null) return null;
  const at = Math.max(0, Math.round(seconds * 10) / 10);
  return `${match[1]}so_${at},w_${size.width},h_${size.height},c_fill,q_auto,f_jpg/${match[2]}.jpg`;
}

/** `src` resized, for an image clip. */
export function imageUrl(src: string, size: Size): string | null {
  const match = IMAGE.exec(src);
  if (match === null) return null;
  return `${match[1]}w_${size.width},h_${size.height},c_fill,q_auto,f_auto/${match[2]}`;
}
