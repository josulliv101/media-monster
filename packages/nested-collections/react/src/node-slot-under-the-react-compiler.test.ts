// `NodeSlot` under the React Compiler.
//
// media-monster compiles this package from source with the React Compiler on,
// and the compiler got `NodeSlotInner` wrong twice, both measured in its own
// output rather than inferred:
//
//   1. `const Sealed = sealedView; <Sealed …/>` came out as `<sealedView …/>`.
//      A lowercase JSX tag is an HTML element, so the dev server served
//      `jsxDEV("sealedView", …)` and a consumer's sealed view never rendered.
//   2. `nodeViews.get(node.kind)` was cached on `node.kind` alone — the
//      registry is module state the compiler treats as frozen — so a view
//      registered late stayed missing until remount.
//
// `"use no memo"` opts the one component out. This test runs the real compiler
// over the real source, so a refactor that drops the directive, or a compiler
// upgrade that stops honouring it, fails here instead of in a consumer's app.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { transformSync } from "@babel/core";
import { describe, expect, it } from "vitest";

const file = fileURLToPath(new URL("./bindings.tsx", import.meta.url));

function compiled(): string {
  const result = transformSync(readFileSync(file, "utf8"), {
    filename: file,
    babelrc: false,
    configFile: false,
    // Comments off: the directive's own explanation quotes `<sealedView …/>`.
    comments: false,
    // Syntax only: the JSX stays JSX, so a lowercased tag is visible as one.
    parserOpts: { plugins: ["typescript", "jsx"] },
    plugins: [["babel-plugin-react-compiler", {}]],
  });
  if (result?.code == null) throw new Error("the compiler produced no output");
  return result.code;
}

function slotSource(code: string): string {
  const start = code.indexOf("const NodeSlotInner");
  const end = code.indexOf("NodeSlotInner.displayName", start);
  if (start === -1 || end === -1) throw new Error("NodeSlotInner not found in the compiled output");
  return code.slice(start, end);
}

describe("NodeSlot under the React Compiler", () => {
  const code = compiled();

  it("still compiles the rest of the bindings", () => {
    // The directive must opt out ONE component, not the module.
    expect(code).toContain('from "react/compiler-runtime"');
  });

  it("leaves NodeSlotInner uncompiled", () => {
    const slot = slotSource(code);
    expect(slot).not.toMatch(/\b_c\(/);
    expect(slot).toContain("nodeViews.get(node.kind)");
  });

  it("never renders the sealed view as a lowercase HTML tag", () => {
    expect(code).not.toContain("<sealedView");
  });
});
