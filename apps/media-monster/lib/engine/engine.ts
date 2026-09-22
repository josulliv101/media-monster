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
 * THE CUT'S RUNNING TIME: only what the film strip plays. `seconds` stays the
 * collection's CONTENT (everything on the board, switched off or not); this is
 * the reel.
 *
 * The switch is on the COLLECTIONS, and a fold is exactly the right shape for
 * it: folds run bottom-up, so an inactive collection answers 0 for its whole
 * subtree and every collection above it sums what is left. A clip deep under
 * three rows is counted only when all three are on, with nobody walking up.
 *
 * AN INACTIVE BRANCH IS EXACT, even unread: whatever it holds, it contributes
 * nothing, and that is known without reading it. An ACTIVE unread collection
 * still answers with its stored summary at "estimated", as `seconds` does.
 */
const activeSecondsMonoid = foldMonoid<NodeTypes, CollectionSummary, number>({
  key: "activeSeconds",
  empty: 0,
  leaf(node) {
    return node.kind === "clip" ? node.data.seconds : 0;
  },
  concat(a, b) {
    return a + b;
  },
  placeholder(node) {
    return node.summary === null ? undefined : node.summary.seconds;
  },
});

const switchedOff = (node: Parameters<typeof activeSecondsMonoid.collection>[0]) =>
  node.kind === "collection" && !node.data.active;

const activeSecondsFold: typeof activeSecondsMonoid = {
  ...activeSecondsMonoid,
  collection(node, children) {
    return switchedOff(node)
      ? { value: 0, certainty: "exact" }
      : activeSecondsMonoid.collection(node, children);
  },
  placeholder(node) {
    return switchedOff(node)
      ? { value: 0, certainty: "exact" }
      : activeSecondsMonoid.placeholder(node);
  },
};

export const engine = createEngine({
  types: nodeTypes,
  summary,
  folds: { seconds: secondsFold, activeSeconds: activeSecondsFold },
});
