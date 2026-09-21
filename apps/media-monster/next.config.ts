import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * NO GENERATED AGENT FILES.
   *
   * Next 16 writes `AGENTS.md` and `CLAUDE.md` into this directory on every
   * `next dev`. This repo has an instruction hierarchy that takes precedence
   * CLOSEST to the files being edited, so a generated app-level file silently
   * outranks the root `CLAUDE.md` and `AGENTS.md` for everything under
   * `apps/media-monster/` — with Next's boilerplate rather than this team's,
   * and its own text asks to be committed.
   *
   * Carried over from `apps/timeline-gstudio001`, where it was found the hard
   * way. `create-next-app --no-agents-md` only skips the one written at scaffold
   * time; this is the one written on every dev run.
   */
  agentRules: false,
  /**
   * NO DEV INDICATOR, because it lands on top of the rail.
   *
   * Next draws its dev-tools badge in the BOTTOM LEFT, which is exactly where
   * the rail pins its own controls — the same corner an IDE puts them in, and
   * the reason the collapse toggle is there. Measured rather than guessed:
   * `elementFromPoint` at the toggle's centre returned `NEXTJS-PORTAL`, not the
   * button, so a real click on the rail's only control never reached it.
   *
   * It is dev-only, so this costs nothing in production and is invisible in a
   * build — which is what makes it the kind of thing that survives unnoticed
   * until someone tries to press the control underneath it.
   *
   * `apps/timeline-gstudio001` carries the same line. It should have come over
   * with the shell, like the `distDir` split below.
   */
  devIndicators: false,
  /**
   * THE ENGINE IS COMPILED FROM SOURCE, NOT CONSUMED AS A BUILT PACKAGE.
   *
   * `@josulliv101/nested-collections` is the one package here built to be
   * published: it has an `exports` map pointing at `dist`, `files: ["dist"]` and
   * a `publishConfig`. Resolving through that map would make this app a consumer
   * of a build artifact, and the artifact is gitignored — so a fresh clone has
   * no `dist` at all, and a stale one is worse than none. Measured on this
   * machine before wiring it up: `dist` was three weeks behind its source, seven
   * commits including the fix for a cyclic seed hanging the depth precheck.
   *
   * The app therefore maps the package to its TypeScript entry points in
   * `tsconfig.json` and lists it here so Next compiles them. That is what every
   * other workspace package in this repo already does — the `@storyboard/*` ones
   * point `main` at `index.ts` and appear in `timeline-gstudio001`'s own list.
   *
   * WHAT THIS GIVES UP, so nobody has to rediscover it: the app no longer
   * exercises the published artifact, so a packaging break — a wrong `exports`
   * path, a missing `"use client"`, a file left out of `files` — cannot show up
   * here. That belongs in a build-and-import check on the package itself, not in
   * making every developer build before the app will start.
   */
  //
  // `@storyboard/ui` is here for the film strip, and ONLY the film strip: the
  // app maps just `@storyboard/ui/film-strip` in `tsconfig.json`, so nothing
  // else in that package is reachable from here by accident.
  transpilePackages: ["@josulliv101/nested-collections", "@storyboard/ui"],
  reactStrictMode: true,
  /**
   * DEV AND BUILD GET SEPARATE DIRECTORIES.
   *
   * They shared `.next` until now, which is the default and is wrong for a
   * checkout anyone runs both in: `next build` writes over the artifacts the
   * running dev server is serving from, and the dev server does not notice —
   * it keeps serving a directory that is being rewritten underneath it. The
   * symptom is "the dev server stopped working" with nothing in its log,
   * because from its side nothing failed.
   *
   * MEASURED HERE rather than assumed: after one `next dev` and one
   * `npm run build` against the same `.next`, that directory held BOTH a
   * `dev/` and a `build/` subtree plus a `BUILD_ID` from the production run.
   *
   * `apps/timeline-gstudio001` has carried this split for exactly this reason
   * and it should have come over with the shell. `NEXT_DIST_DIR` overrides it
   * so a SECOND dev server can run beside the usual one — needed to compare
   * two branches on one checkout without stopping the server you are working
   * in, which is the other way two Next processes end up sharing a directory.
   */
  distDir:
    process.env.NEXT_DIST_DIR ??
    (process.env.NODE_ENV === "development" ? ".next-dev" : ".next"),
};

export default nextConfig;
