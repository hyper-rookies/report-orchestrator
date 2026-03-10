import assert from "node:assert/strict";
import {
  SHARE_EXPIRY_FALLBACK_LABEL,
  SHARE_EXPIRY_TIME_ZONE_LABEL,
  formatShareExpiry,
  isShareLinkReusable,
} from "./shareExpiry";

assert.equal(isShareLinkReusable("2026-03-10T00:00:00.000Z", Date.UTC(2026, 2, 10, 0, 0, 1)), false);
assert.equal(isShareLinkReusable("2026-03-10T00:00:00.000Z", Date.UTC(2026, 2, 9, 23, 59, 59)), true);
assert.equal(isShareLinkReusable(undefined, Date.UTC(2026, 2, 9, 23, 59, 59)), false);
assert.equal(isShareLinkReusable("not-a-date", Date.UTC(2026, 2, 9, 23, 59, 59)), false);
assert.equal(
  formatShareExpiry("2026-03-10T00:00:00.000Z"),
  `2026-03-10 09:00:00 ${SHARE_EXPIRY_TIME_ZONE_LABEL}`
);
assert.equal(formatShareExpiry("not-a-date"), SHARE_EXPIRY_FALLBACK_LABEL);
assert.equal(formatShareExpiry(undefined), SHARE_EXPIRY_FALLBACK_LABEL);
