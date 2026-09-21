// Shared by the review8 tests: one container kind and a counting summary, both
// strict, so a value that should have been refused cannot slip through a
// tolerant parse.
import {
  type ConsumerDefinedSummaryType,
  type Issue,
  type Result,
  defineNodeType,
} from "../index";

export type Folder = Readonly<{ name: string }>;
export type FolderEdit = Readonly<{ name: string }>;

export const folderType = defineNodeType<Folder, FolderEdit>()({
  kind: "folder",
  container: true,
  schemaVersion: 1,
  parse(raw): Result<Folder, readonly Issue[]> {
    const name =
      typeof raw === "object" && raw !== null
        ? ({ ...raw } as Record<string, unknown>)["name"]
        : undefined;
    return typeof name === "string"
      ? { ok: true, value: { name } }
      : { ok: false, error: [{ path: "$.name", message: "name required" }] };
  },
  serialize: (data) => ({ name: data.name }),
  applyEdit: (_data, edit) => ({ ok: true, value: { name: edit.name } }),
});

export type Count = Readonly<{ count: number }>;

export const countSummary: ConsumerDefinedSummaryType<Count> = {
  parse(raw): Result<Count, readonly Issue[]> {
    const count =
      typeof raw === "object" && raw !== null
        ? ({ ...raw } as Record<string, unknown>)["count"]
        : undefined;
    return typeof count === "number" && count >= 0
      ? { ok: true, value: { count } }
      : { ok: false, error: [{ path: "$.count", message: "count must be a nonnegative number" }] };
  },
  serialize: (data) => ({ count: data.count }),
};

export const rootDocument = {
  formatVersion: 1,
  schemaVersions: { folder: 1 },
  rootIds: ["root"],
  nodes: [{ id: "root", kind: "folder", data: { name: "root" }, children: [] }],
};
