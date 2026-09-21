// Eighth review round — the id ceiling, at the replay door.
//
// Review 7 held the MINTING door to `maxNodeIdLength`. The replay door —
// `applyPatchChecked`, and the undo/redo verification behind it — still took a
// patch built by another engine whose ceiling was looser, installed its
// over-long id, and let `serializeChecked` write a document `deserialize` then
// refused with `node-id-too-long`. The same shape as the node and depth
// ceilings before their replay twins existed: a rule enforced at one door.
import { describe, expect, it } from "vitest";

import { parseNodeId } from "../index";
import { createEngine } from "../engine";
import { countSummary, folderType, rootDocument } from "./_review8-fixture";

const make = (maxNodeIdLength: number | null, mintId?: () => string) =>
  createEngine({
    types: [folderType] as const,
    summary: countSummary,
    folds: {},
    maxNodeIdLength,
    ...(mintId === undefined ? {} : { mintId }),
  });

function insertPatch(mintedId: string) {
  const source = make(null, () => mintedId);
  const loaded = source.deserialize(rootDocument);
  if (!loaded.ok) throw new Error(loaded.error.message);
  const command = source.applyCommand(loaded.value.graph, {
    type: "insert-nodes",
    toParentId: parseNodeId("root"),
    toIndex: 0,
    seeds: [{ kind: "folder", data: { name: "n" } }],
  });
  if (!command.ok) throw new Error(command.error.message);
  return command.value.patch;
}

describe("the replay gate enforces the id ceiling", () => {
  it("refuses an insert whose id is over the receiving engine's ceiling", () => {
    const target = make(4);
    const loaded = target.deserialize(rootDocument);
    if (!loaded.ok) throw new Error(loaded.error.message);

    const replay = target.applyPatchChecked(loaded.value.graph, insertPatch("abcdefghij"));
    expect(replay.ok).toBe(false);
    if (!replay.ok) {
      expect(replay.error.code).toBe("would-exceed-max-node-id-length");
    }
  });

  it("accepts the same patch when the id fits", () => {
    const target = make(4);
    const loaded = target.deserialize(rootDocument);
    if (!loaded.ok) throw new Error(loaded.error.message);
    expect(target.applyPatchChecked(loaded.value.graph, insertPatch("ok")).ok).toBe(true);
  });
});
