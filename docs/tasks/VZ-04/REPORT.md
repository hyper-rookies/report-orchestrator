# VZ-04 Task Report

**Status:** DONE

**Completed At:** 2026-03-11T08:15:25.2803387+09:00

---

## Acceptance Criteria

- [x] `docs/bedrock-agent-setup.md` updated with Auto Chart Selection section
- [x] Bedrock Agent instruction example payload included
- [x] `questionIntent` value list with keyword mapping included
- [x] AWS Console update procedure documented

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `docs/bedrock-agent-setup.md` | Modified | Added Auto Chart Selection section, updated viz parameter docs, added AWS console rollout steps |
| `AGENTS.md` | Created | Added repo-level rule to verify implementation first and update docs in the same change |

---

## Verification

Documentation review completed:

- confirmed `docs/bedrock-agent-setup.md` includes an `Auto Chart Selection in the Viz Action Group` section
- confirmed the example payload includes `"chartType": "auto"`
- confirmed semantic hints and `questionIntent` keyword mapping are documented
- confirmed AWS Console update steps are included

---

## Deviations from Plan

None.

---

## Questions for Reviewer

None.

---

## Post-Review Follow-Up

- re-checked `backend/services/viz-lambda/app.py` as the runtime source of truth before adjusting docs
- corrected `docs/bedrock-agent-setup.md` so `xAxis` and `yAxis` match current viz-lambda requirements for `pie`, `bar`, `line`, and `stackedBar`
- updated the AWS Console checklist to explicitly include `rows`, `xAxis`, and `yAxis` in the action group schema review
- added a repository-level `AGENTS.md` rule requiring code-first verification and same-change documentation updates to prevent future drift
- confirmed `backend/tests/test_bedrock_adapters.py` passes with the current Bedrock-side viz contract, including `selectionReason` and `chartType="auto"`
