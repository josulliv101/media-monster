// What `npm publish` would actually ship, asserted against the BUILT output.
//
// Every other guard in this package reads source. None of them can see the two
// ways the build silently produces a broken package, because both happen during
// the bundle:
//
//   1. `"use client"` GOES MISSING, or arrives TWICE. Lose it and the React
//      entry becomes a SERVER module: it typechecks, it imports, and it fails at
//      request time — the same failure the boundary guard prevents in the other
//      direction, and just as invisible.
//
//      The first version of this file asserted only that the directive was
//      PRESENT, and the build re-attached it with a banner in the belief that
//      esbuild strips it. Both were wrong: esbuild hoists the entry's directive
//      itself, so the banner emitted a second copy and the assertion could not
//      fail — deleting the banner changed nothing the test could see. Counting
//      is what gives it teeth.
//
//   2. THE CORE GETS INLINED INTO THE REACT BUNDLE. `engine/defaults.ts` keeps a
//      module-level `mintCounter`, documented as "process-wide, not per-engine,
//      and that is the point" — it is what makes an intra-process id collision
//      impossible regardless of what `Math.random` does. Two copies of the core
//      in one process is two counters, and that guarantee quietly degrades to
//      the random suffix alone.
//
// IT BUILDS RATHER THAN READING `dist/`. A test that asserted on a checked-in
// or previously-built `dist/` would skip when absent and pass forever — the
// fail-open shape this package has already been bitten by twice. Building into a
// temp directory costs about a second and cannot go quiet.
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const { buildTo } = (await import(
  new URL("../../../../scripts/build-nested-collections.mjs", import.meta.url).href
)) as { buildTo: (outDir: string) => Promise<Record<string, string>> };

const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));

let outDir = "";
let built: Record<string, string> = {};
const read = (file: string): string => readFileSync(file, "utf8");

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

/** `from "./x"`, `export * from "./x"` and `import("./x")` — all three appear in
 *  emitted declarations, and a rewrite that missed one would pass a test that
 *  only looked for the first. */
function relativeSpecifiers(text: string): string[] {
  return [
    ...text.matchAll(/from\s*["'](\.[^"']*)["']/g),
    ...text.matchAll(/import\(\s*["'](\.[^"']*)["']\s*\)/g),
  ].flatMap((m) => (m[1] === undefined ? [] : [m[1]]));
}

const CONSUMER = `import { parseNodeId, type NodeId } from "@josulliv101/nested-collections";
import { createReactBindings } from "@josulliv101/nested-collections/react";

const id: NodeId = parseNodeId("root");
// @ts-expect-error -- a NodeId is a branded string; accepted only if it became \`any\`
const wrong: number = parseNodeId("root");
// @ts-expect-error -- the bindings factory is a function; accepted only if it became \`any\`
const alsoWrong: number = createReactBindings;

export { id, wrong, alsoWrong };
`;

/**
 * Install the build into a throwaway `"type": "module"` project and compile a
 * consumer of both entries under NodeNext. Returns the diagnostics as text.
 *
 * THE PROJECT LIVES INSIDE THE PACKAGE, not in the OS temp dir, so that `react`
 * and `@types/react` — which the React entry's declarations import — resolve by
 * walking up to the workspace's `node_modules`, exactly as they would for a
 * consumer that has React installed. The package itself resolves from the
 * project's own `node_modules`, which is found first.
 */
function typecheckAsNodeNextConsumer(buildDir: string): string[] {
  const project = mkdtempSync(join(PACKAGE_ROOT, ".nodenext-consumer-"));
  try {
    const installed = join(project, "node_modules", "@josulliv101", "nested-collections");
    mkdirSync(installed, { recursive: true });
    cpSync(join(PACKAGE_ROOT, "package.json"), join(installed, "package.json"));
    cpSync(buildDir, join(installed, "dist"), { recursive: true });
    writeFileSync(join(project, "package.json"), '{ "type": "module" }\n');
    const entry = join(project, "consumer.ts");
    writeFileSync(entry, CONSUMER);

    const program = ts.createProgram([entry], {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      target: ts.ScriptTarget.ES2022,
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      // No ambient @types scan: only what the consumer imports is loaded.
      types: [],
    });
    return ts
      .getPreEmitDiagnostics(program)
      .map((d) => `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
}

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "nc-build-"));
  built = await buildTo(outDir);
}, 120_000);

afterAll(() => {
  if (outDir !== "") rmSync(outDir, { recursive: true, force: true });
});

describe("the build output is publishable", () => {
  it("emits both entries and both declaration trees", () => {
    // The vacuity check: everything below reads these files, so if the build
    // silently produced nothing, every other assertion would be about "".
    for (const [label, file] of Object.entries(built)) {
      expect(existsSync(file), label).toBe(true);
      expect(read(file).length, label).toBeGreaterThan(100);
    }
  });

  it('keeps "use client" on the react entry, first and exactly once', () => {
    const text = read(built["react"] ?? "");
    // POSITION, asserted with `startsWith` rather than by splitting lines: a
    // directive that is not the first thing in the file is just a string
    // expression, and every bundler ignores it.
    expect(text.startsWith('"use client";')).toBe(true);
    // COUNT: the assertion with teeth. Presence alone passed while the build
    // emitted the directive TWICE — once hoisted by esbuild, once from a banner
    // added on a wrong belief about what esbuild does — so deleting that banner
    // changed nothing this test could see.
    expect([...text.matchAll(/["']use client["']/g)]).toHaveLength(1);
  });

  it("does NOT put the directive on the core entry", () => {
    // The other direction. A core that announces itself as a client module is
    // exactly as broken, and would make `createEngine` unusable from a route
    // handler — the thing the whole two-entry layout exists to protect.
    expect(read(built["core"] ?? "")).not.toContain("use client");
  });

  it("leaves the core out of the react bundle rather than inlining it", () => {
    const react = read(built["react"] ?? "");
    const core = read(built["core"] ?? "");
    // It IMPORTS the core...
    expect(react).toMatch(/from\s*["']\.\.\/core\/index\.js["']/);
    // ...and does not carry a copy of it. `mintCounter` is the specific thing
    // that must exist once per process; asserting on size alone would pass a
    // build that inlined half of it.
    expect(core).toContain("mintCounter");
    expect(react).not.toContain("mintCounter");
    expect(react.length).toBeLessThan(core.length / 4);
  });

  it("keeps react external, since it is an optional peer dependency", () => {
    const react = read(built["react"] ?? "");
    expect(react).toMatch(/from\s*["']react["']/);
    // A consumer who never touches the React entry must not be made to install
    // it, which only holds while the core has no idea React exists.
    expect(read(built["core"] ?? "")).not.toMatch(/from\s*["']react["']/);
  });

  it("emits runnable ESM, not extensionless imports Node cannot resolve", () => {
    // The reason the build bundles at all: the source imports `../types`, which
    // `moduleResolution: "bundler"` permits and Node's resolver rejects. A
    // relative specifier surviving into the output would import nothing.
    for (const label of ["core", "react"]) {
      const text = read(built[label] ?? "");
      const relative = [...text.matchAll(/from\s*["'](\.[^"']*)["']/g)].map((m) => m[1]);
      const extensionless = relative.filter((spec) => spec !== undefined && !spec.endsWith(".js"));
      expect(extensionless, label).toEqual([]);
    }
  });

  it("emits declarations whose relative imports name real .js paths", () => {
    // THE DECLARATIONS HAD THE SAME HOLE THE JS WAS BUNDLED TO CLOSE. `tsc`
    // copies the source's extensionless specifiers (`from "./types"`, where
    // `./types` is a FOLDER) into every `.d.ts`. Under `"type": "module"` a
    // NodeNext consumer gets TS2834 on each one — and every export collapses to
    // `any`, so with `skipLibCheck` the failure is silent. The build now writes
    // the file each specifier actually resolves to.
    const declarations = listFiles(join(outDir, "types")).filter((f) => f.endsWith(".d.ts"));
    expect(declarations.length).toBeGreaterThan(10);
    const unresolved: string[] = [];
    for (const file of declarations) {
      for (const spec of relativeSpecifiers(read(file))) {
        const target = join(dirname(file), spec.replace(/\.js$/, ".d.ts"));
        if (!spec.endsWith(".js") || !existsSync(target)) unresolved.push(`${file}: ${spec}`);
      }
    }
    expect(unresolved).toEqual([]);
  });

  it("typechecks for a NodeNext consumer, with the types intact", () => {
    // A REAL CONSUMER, not a reading of the files: the built package installed
    // into a `"type": "module"` project and compiled with `moduleResolution:
    // "nodenext"` and `skipLibCheck: false`. This repo's own apps all resolve
    // with `bundler`, which accepts the broken form — so nothing here saw it.
    //
    // THE `@ts-expect-error` LINES ARE THE TEETH. Unresolved declarations do not
    // only report TS2834; they turn every export into `any`, and then a wrong
    // assignment is accepted. If that happens here the directive has nothing to
    // suppress and reports itself as unused, so "no diagnostics" means both
    // that everything resolved AND that the types are still the real ones.
    const diagnostics = typecheckAsNodeNextConsumer(outDir);
    expect(diagnostics).toEqual([]);
  }, 60_000);

  it("the manifest points at what the build actually writes", () => {
    // The two halves of publishing that can drift apart: what is emitted, and
    // what `exports` claims is emitted. Neither one checks the other.
    const manifest = JSON.parse(
      read(join(PACKAGE_ROOT, "package.json")),
    ) as Readonly<{
      type?: string;
      files?: readonly string[];
      exports?: Record<string, { types?: string; default?: string }>;
      main?: string;
      types?: string;
    }>;

    // `type: module` is not cosmetic — without it Node guesses, warns, and
    // reparses every import of this package.
    expect(manifest.type).toBe("module");
    expect(manifest.files).toEqual(["dist"]);

    const entries = manifest.exports ?? {};
    expect(Object.keys(entries).sort()).toEqual([".", "./react"]);

    // Every path the manifest names must exist in a fresh build, resolved
    // against the temp output rather than a stale `dist/`.
    const named = [
      entries["."]?.default,
      entries["."]?.types,
      entries["./react"]?.default,
      entries["./react"]?.types,
      manifest.main,
      manifest.types,
    ];
    for (const rel of named) {
      expect(rel, "manifest path").toBeDefined();
      const inBuild = join(outDir, (rel ?? "").replace(/^\.\/dist\//, "").replace(/^\.\//, ""));
      expect(existsSync(inBuild), rel).toBe(true);
    }
  });

  it("ships no TypeScript source, only declarations", () => {
    // `files: ["dist"]` covers this, but `main`/`types` pointing at a `.ts` file
    // would drag it into the tarball anyway — npm includes whatever they name,
    // whatever `files` says. That is how the first version of this manifest
    // leaked `core/index.ts` into the pack.
    const manifest = JSON.parse(read(join(PACKAGE_ROOT, "package.json"))) as Readonly<{
      main?: string;
      types?: string;
      exports?: Record<string, { types?: string; default?: string }>;
    }>;
    const paths = [
      manifest.main,
      manifest.types,
      ...Object.values(manifest.exports ?? {}).flatMap((e) => [e.types, e.default]),
    ].filter((p): p is string => p !== undefined);

    for (const p of paths) {
      expect(p.endsWith(".ts") && !p.endsWith(".d.ts"), p).toBe(false);
      expect(p.startsWith("./dist/"), p).toBe(true);
    }
  });

  it("carries a README and a LICENSE, which `files` does not name", () => {
    // BOTH SHIP ANYWAY, and that is the fact worth pinning rather than
    // assuming. `files: ["dist"]` is asserted verbatim two tests up, so the
    // obvious reading is that nothing outside `dist/` reaches the tarball —
    // and adding them to `files` to "fix" that would break that assertion for
    // no reason. npm always includes `package.json`, `README*` and `LICENSE*`
    // whatever `files` says. VERIFIED with `npm pack --dry-run`:
    //
    //   npm notice  1.1kB  LICENSE
    //   npm notice 14.9kB  README.md
    //
    // Asserted here because a package with `publishConfig.access: "public"`
    // and no README is a blank page on npm, and one with no LICENSE is
    // all-rights-reserved by default — neither of which fails a build, a
    // typecheck or a lint. This file is where "what would `npm publish`
    // actually ship" lives.
    expect(existsSync(join(PACKAGE_ROOT, "README.md"))).toBe(true);
    expect(existsSync(join(PACKAGE_ROOT, "LICENSE"))).toBe(true);
  });

  it("declares the license it ships, and the two agree", () => {
    // A LICENSE file with no `license` field is a package npm reports as
    // UNLICENSED, and a `license` field naming something the file does not say
    // is worse than either alone.
    const manifest = JSON.parse(read(join(PACKAGE_ROOT, "package.json"))) as Readonly<{
      license?: string;
      description?: string;
    }>;
    expect(manifest.license).toBe("MIT");
    expect(read(join(PACKAGE_ROOT, "LICENSE"))).toContain("MIT License");
    // The one-line pitch npm shows beside the name in search results. Empty is
    // the default and reads as abandoned.
    expect((manifest.description ?? "").length).toBeGreaterThan(20);
  });
});
