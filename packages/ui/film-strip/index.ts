/**
 * `@storyboard/ui/film-strip` — the reference design's film strip.
 *
 * The ruler with its section lanes, the strip of shots, the playhead and the
 * minimap. It runs itself (clock, play state, selection) when those are not
 * passed, and is controlled when they are. See `film-strip.tsx`.
 *
 * Moved here from `apps/timeline-gstudio001/components/graph-view/playbar/`,
 * which still has its own copy and still uses it. Media Monster consumes this
 * one.
 *
 * The helpers are renamed from `playbar-*` to `film-strip-*` here: the playbar
 * was the reference design both the strip and the app's clip deck came from,
 * and only the strip lives in this package.
 */
export {
  FilmStrip,
  type FilmStripProps,
  type FilmStripOpenOrigin,
  type FilmStripSize,
  type FilmStripSkimPreview,
} from "./film-strip";
export {
  placeSections,
  placeShots,
  type FilmStripShot,
  type PlacedSection,
  type PlacedShot,
} from "./film-strip-data";
export { LOOKS } from "./film-strip-model";
