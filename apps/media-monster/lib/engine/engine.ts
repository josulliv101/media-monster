import {
  createEngine,
  foldMonoid,
  type ConsumerDefinedSummaryType,
  type Issue,
  type Result,
} from "@josulliv101/nested-collections";

import { nodeTypes, type NodeTypes } from "@/lib/engine/node-types";

/**
 * THE APP'S ENGINE, built once.
 *
 * PURE, AND THAT IS ENFORCED RATHER THAN INTENDED. `createEngine` pulls from the
 * package's core entry, which has no React, no DOM and no `"use client"`
 * anywhere below it — so this module is callable from a route handler, and will
 * be when documents start coming from storage. The React bindings are a separate
 * module (`bindings.ts`) for exactly that reason: importing them here would make
 * every consumer of the engine a client module, and the failure would not show
 * up until request time.
 *
 * Built from SOURCE rather than the package's `dist` — see the note on
 * `transpilePackages` in `next.config.ts` for what that buys and what it gives
 * up.
 */

/**
 * What an unread collection carries so it can still answer for itself.
 *
 * A collection whose children have not been loaded still has to be able to say
 * how long it is, or every parent above it reports a number that is quietly
 * wrong. The summary is that stored answer, and the fold below is careful to
 * report it at a certainty that says where it came from.
 *
 * ONE FIELD, because the fold has one key. Adding a field here without a fold
 * that reads it stores a number nothing can surface.
 */
export type CollectionSummary = Readonly<{ seconds: number }>;

const summary: ConsumerDefinedSummaryType<CollectionSummary> = {
  parse(raw): Result<CollectionSummary, readonly Issue[]> {
    const seconds = (raw as Partial<CollectionSummary>)?.seconds;
    if (!Number.isFinite(seconds)) {
      return {
        ok: false,
        error: [{ path: "$.seconds", message: "seconds must be a number" }],
      };
    }
    return { ok: true, value: { seconds: seconds as number } };
  },
  serialize(value) {
    return { seconds: value.seconds };
  },
};

/**
 * How long a subtree runs.
 *
 * THE CERTAINTY IS THE POINT, not the number. A fold over a subtree with an
 * unread branch comes back `"estimated"` or `"partial"` rather than a total that
 * looks measured — which is what lets a view say "about 4m" instead of showing a
 * confident wrong number. A subtree whose only gaps are confirmed-missing folds
 * to `"exact"`, because confirmed-gone is knowledge rather than absence of it.
 */
const secondsFold = foldMonoid<NodeTypes, CollectionSummary, number>({
  key: "seconds",
  empty: 0,
  leaf(node) {
    // The collection is heterogeneous, so the fold says what each kind
    // contributes. A collection contributes nothing of its own — its children
    // are what it is worth — and saying so here is what keeps the sum from
    // double-counting when nested summaries arrive.
    return node.kind === "clip" ? node.data.seconds : 0;
  },
  concat(a, b) {
    return a + b;
  },
  placeholder(node) {
    // An unread collection reports its STORED number at certainty "estimated".
    // `undefined` means nothing was stored, which becomes `empty` at "partial".
    // Neither pretends to be a measurement.
    return node.summary === null ? undefined : node.summary.seconds;
  },
});

/**
 * THE CUT'S RUNNING TIME: only clips flagged active, which is exactly what the
 * film strip plays. `seconds` stays the collection's CONTENT (everything on the
 * board, alternates included); this is the reel.
 *
 * An unread collection's stored summary does not say which of its clips are
 * active, so its placeholder is the whole summary. The fold reports that at
 * certainty "estimated" already, which is the honest reading: the running time
 * is not known until the collection is read.
 */
const activeSecondsFold = foldMonoid<NodeTypes, CollectionSummary, number>({
  key: "activeSeconds",
  empty: 0,
  leaf(node) {
    return node.kind === "clip" && node.data.active ? node.data.seconds : 0;
  },
  concat(a, b) {
    return a + b;
  },
  placeholder(node) {
    return node.summary === null ? undefined : node.summary.seconds;
  },
});

export const engine = createEngine({
  types: nodeTypes,
  summary,
  folds: { seconds: secondsFold, activeSeconds: activeSecondsFold },
});
