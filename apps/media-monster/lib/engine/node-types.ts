import {
  defineNodeType,
  type Issue,
  type Result,
} from "@josulliv101/nested-collections";

/**
 * WHAT MEDIA MONSTER HOLDS.
 *
 * Two kinds, which is what the product promises on its own front page: you herd
 * AI-generated clips into collections, nested as deep as you like. A `clip` is a
 * leaf — a piece of footage with a duration. A `collection` is a container, and
 * containers are the only thing that can hold children.
 *
 * DELIBERATELY NOT THE OLD APP'S MODEL. `@storyboard/timeline-model` has a clip
 * type with trims, lanes, start times, posters and provenance, because it backs
 * a timeline that plays. None of that is known yet here, and a field invented
 * now is a field every fixture, every parse and every migration has to carry
 * before anything asks for it. These two start at the smallest thing that can be
 * rendered and rearranged.
 *
 * `parse` RUNS ON WIRE DATA AND ON VALUES YOU INSERT, so whatever normalizing it
 * does happens on both paths. Both kinds trim their text here for that reason:
 * a clip inserted with a trailing space is stored the same as one loaded with
 * one.
 */

/**
 * What a clip shows: a video, or a still held for `seconds`.
 *
 * A URL and nothing else. Frame grabs, posters and sizes are all derived from
 * it (see `lib/media/cloudinary.ts`), so there is one fact to store and nothing
 * that can disagree with it.
 */
export type ClipMedia = Readonly<{ kind: "video" | "image"; src: string }>;

/**
 * A piece of footage. `seconds` is what the folds roll up.
 *
 * `active` says whether the clip is IN THE CUT: an active clip plays in the
 * film strip, an inactive one stays on the board (an alternate take, a plate
 * kept for later) and is left out of the strip and the reel's running time.
 * Absent on the wire means active, so every document written before the flag
 * existed reads as it did.
 */
export type Clip = Readonly<{
  title: string;
  seconds: number;
  media: ClipMedia | null;
  active: boolean;
}>;
export type ClipEdit = Readonly<{ title?: string; seconds?: number; active?: boolean }>;

function parseMedia(raw: unknown): Result<ClipMedia | null, readonly Issue[]> {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  const { kind, src } = raw as Partial<ClipMedia>;
  if (kind !== "video" && kind !== "image") {
    return { ok: false, error: [{ path: "$.media.kind", message: "kind must be video or image" }] };
  }
  if (typeof src !== "string" || !/^https?:\/\//.test(src)) {
    return { ok: false, error: [{ path: "$.media.src", message: "src must be an http(s) URL" }] };
  }
  return { ok: true, value: { kind, src } };
}

export const clip = defineNodeType<Clip, ClipEdit>()({
  kind: "clip",
  container: false,
  // 2 ADDED `media`. Additive, so the migration is the identity — but bumped
  // all the same: an older build now SEALS a clip carrying media instead of
  // reading it, dropping the field and writing it back without it.
  // 3 ADDED `active`, for the same reason and with the same identity
  // migration: an older build would drop `active: false` and put the clip
  // back in the strip.
  schemaVersion: 3,
  migrations: { 2: (raw) => raw, 3: (raw) => raw },
  parse(raw): Result<Clip, readonly Issue[]> {
    if (typeof raw !== "object" || raw === null) {
      return { ok: false, error: [{ path: "$", message: "not an object" }] };
    }
    const { title, seconds } = raw as Partial<Clip>;
    if (typeof title !== "string" || title.trim() === "") {
      return {
        ok: false,
        error: [{ path: "$.title", message: "title required" }],
      };
    }
    // NOT `>= 0` ALONE. `NaN` fails every comparison, so a `seconds` of `NaN`
    // slips past a bare `< 0` check and then poisons the fold — one clip makes
    // every ancestor's total `NaN`, and the certainty still reads "exact"
    // because nothing was unread. `Number.isFinite` is what keeps a rollup
    // arithmetic.
    if (!Number.isFinite(seconds) || (seconds as number) < 0) {
      return {
        ok: false,
        error: [{ path: "$.seconds", message: "seconds must be a number >= 0" }],
      };
    }
    const media = parseMedia((raw as { media?: unknown }).media);
    if (!media.ok) return media;
    const active = (raw as { active?: unknown }).active;
    if (active !== undefined && typeof active !== "boolean") {
      return { ok: false, error: [{ path: "$.active", message: "active must be a boolean" }] };
    }
    return {
      ok: true,
      value: {
        title: title.trim(),
        seconds: seconds as number,
        media: media.value,
        active: active ?? true,
      },
    };
  },
  serialize(data) {
    // `active` is written only when false: absent already means active, and
    // leaving it off keeps every clip in the cut exactly as it was written.
    return {
      title: data.title,
      seconds: data.seconds,
      ...(data.media === null ? {} : { media: { ...data.media } }),
      ...(data.active ? {} : { active: false }),
    };
  },
  applyEdit(data, edit) {
    return {
      ok: true,
      value: {
        title: edit.title ?? data.title,
        seconds: edit.seconds ?? data.seconds,
        media: data.media,
        active: edit.active ?? data.active,
      },
    };
  },
});

/** A folder of clips, or of other collections. */
export type Collection = Readonly<{ name: string }>;
export type CollectionEdit = Readonly<{ name?: string }>;

export const collection = defineNodeType<Collection, CollectionEdit>()({
  kind: "collection",
  container: true,
  schemaVersion: 1,
  parse(raw): Result<Collection, readonly Issue[]> {
    const name = (raw as Partial<Collection>)?.name;
    if (typeof name !== "string" || name.trim() === "") {
      return { ok: false, error: [{ path: "$.name", message: "name required" }] };
    }
    return { ok: true, value: { name: name.trim() } };
  },
  serialize(data) {
    return { name: data.name };
  },
  applyEdit(data, edit) {
    return { ok: true, value: { name: edit.name ?? data.name } };
  },
});

/**
 * The registry, as a tuple.
 *
 * `as const` is load-bearing rather than stylistic: the engine infers its whole
 * per-kind typing from this tuple, and a plain array widens to
 * `NodeType<...>[]`, which takes every view's `data` down to a union and every
 * edit down to `unknown`.
 */
export const nodeTypes = [clip, collection] as const;
export type NodeTypes = typeof nodeTypes;
