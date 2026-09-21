import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LIBRARY_VIEW_DEFAULTS,
  parseLibraryViewContext,
  writeLibraryViewContext,
} from "../src/lib/library-view-context";

test("library return context survives a URL round trip without losing unrelated parameters", () => {
  const selected = {
    status: "watching" as const,
    type: "TV",
    year: "2026",
    sort: "rating" as const,
    view: "grid" as const,
  };
  const params = writeLibraryViewContext(new URLSearchParams("source=home"), selected);
  assert.equal(params.get("source"), "home");
  assert.deepEqual(parseLibraryViewContext(params), selected);
  assert.equal(params.has("view"), false);
});

test("library return context rejects malformed URL state", () => {
  assert.deepEqual(
    parseLibraryViewContext(new URLSearchParams("status=admin&type=unknown&year=2026x&sort=other&view=other")),
    LIBRARY_VIEW_DEFAULTS,
  );
});
