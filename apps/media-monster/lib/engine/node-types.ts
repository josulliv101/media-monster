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
 * WHETHER IT IS IN THE CUT IS NOT ITS OWN FIELD. That lives on the collections
 * above it (see `Collection.active`): a clip plays in the film strip when every
 * collection over it is active. It had its own `active` for a while (schema 3);
 * the switch moved to the rows, where one flip covers a whole branch.
 */
export type Clip = Readonly<{ title: string; seconds: number; media: ClipMedia | null }>;
export type ClipEdit = Readonly<{ title?: string; seconds?: number }>;

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
  // 3 ADDED `active`; 4 REMOVES it again, now that the rows carry it. The
  // migration drops the field rather than leaving it to be ignored, so a v3
  // document's `active: false` cannot survive a save as data nothing reads.
  schemaVersion: 4,
  migrations: {
    2: (raw) => raw,
    3: (raw) => raw,
    4: (raw) => {
      if (typeof raw !== "object" || raw === null) return raw;
      const rest: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
      delete rest.active;
      return rest;
    },
  },
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
    return {
      ok: true,
      value: { title: title.trim(), seconds: seconds as number, media: media.value },
    };
  },
  serialize(data) {
    return data.media === null
      ? { title: data.title, seconds: data.seconds }
      : { title: data.title, seconds: data.seconds, media: { ...data.media } };
  },
  applyEdit(data, edit) {
    return {
      ok: true,
      value: {
        title: edit.title ?? data.title,
        seconds: edit.seconds ?? data.seconds,
        media: data.media,
      },
    };
  },
});

/**
 * A folder of clips, or of other collections.
 *
 * `active` says whether this branch is IN THE CUT. A clip plays in the film
 * strip only when every collection above it is active, so switching one off
 * takes its whole subtree out of the strip and the reel's running time.
 *
 * A child's own `active` is KEPT while an ancestor is off, not overwritten: it
 * is what the child goes back to when the ancestor comes back on. Absent on the
 * wire means active, so every document written before the field reads as it did.
 */
export type Collection = Readonly<{ name: string; active: boolean }>;
export type CollectionEdit = Readonly<{ name?: string; active?: boolean }>;

export const collection = defineNodeType<Collection, CollectionEdit>()({
  kind: "collection",
  container: true,
  // 2 ADDED `active`. Additive, so the migration is the identity — bumped so an
  // older build SEALS a collection carrying it rather than dropping
  // `active: false` and putting the branch back in the strip.
  schemaVersion: 2,
  migrations: { 2: (raw) => raw },
  parse(raw): Result<Collection, readonly Issue[]> {
    const name = (raw as Partial<Collection>)?.name;
    if (typeof name !== "string" || name.trim() === "") {
      return { ok: false, error: [{ path: "$.name", message: "name required" }] };
    }
    const active = (raw as { active?: unknown }).active;
    if (active !== undefined && typeof active !== "boolean") {
      return { ok: false, error: [{ path: "$.active", message: "active must be a boolean" }] };
    }
    return { ok: true, value: { name: name.trim(), active: active ?? true } };
  },
  serialize(data) {
    // Written only when false: absent already means active.
    return data.active ? { name: data.name } : { name: data.name, active: false };
  },
  applyEdit(data, edit) {
    return {
      ok: true,
      value: { name: edit.name ?? data.name, active: edit.active ?? data.active },
    };
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
