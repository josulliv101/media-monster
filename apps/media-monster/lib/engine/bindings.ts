"use client";

import { createReactBindings } from "@josulliv101/nested-collections/react";

import { engine } from "@/lib/engine/engine";

/**
 * The engine's React bindings, created ONCE at module scope.
 *
 * Bindings are a factory rather than module exports because `createContext`
 * cannot be generic — a module-scope context has nowhere to get the node-type
 * registry from, and every hook would hand back `GraphNode<never[], never>`.
 * Calling the factory here, at module scope, is what closes it over this app's
 * registry so `useNode` and `defineNodeView` are typed per kind with no casting.
 *
 * CALLED ONCE, and the file boundary is the enforcement. A second call would
 * build a second context, and a view registered against one would render inside
 * a provider holding the other — which does not fail loudly, it renders nothing
 * for that kind. One module, one call, and everything imports from here.
 *
 * ITS OWN FILE, separate from `engine.ts`, because this one is a client module
 * and that one must not be. `"use client"` marks EVERY export of a module, not
 * just its components, so merging the two would make the engine itself
 * unreachable from a route handler — and that failure typechecks cleanly and
 * only appears at request time.
 */
export const {
  Provider,
  NodeSlot,
  useChildren,
  useFold,
  useGraph,
  useDispatch,
  useHistory,
  useIsSelected,
  useNode,
  useSelectionActions,
  useSelectionAnchor,
  useStore,
  defineNodeView,
} = createReactBindings(engine);
