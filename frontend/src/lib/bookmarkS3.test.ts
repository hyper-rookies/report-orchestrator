import assert from "node:assert/strict";

// @ts-expect-error Node strip-types test imports the TypeScript source directly.
import { bookmarkIndexKey, bookmarkItemKey } from "./bookmarkS3.ts";

assert.equal(bookmarkIndexKey("user-1"), "bookmarks/user-1/index.json");
assert.equal(bookmarkItemKey("user-1", "bk-abc"), "bookmarks/user-1/bk-abc.json");

console.log("bookmarkS3 key tests passed");
