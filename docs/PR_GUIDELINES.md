# PR Guidelines

These rules apply to all pull requests on the `main` branch.
CI enforces the validation rules. Human reviewers enforce the rest.

---

## 1. PR Size Limit

**Maximum 3 source files changed per PR.**

A *source file* is any file under `src/`, `services/`, `config/`, or `scripts/`.

The following are **not counted** toward the 3-file limit and may be included freely:

- Test files (1–2 paired tests per PR expected)
- Contract or architecture documentation (`CONTRACTS.md`, `SYSTEM_ARCHITECTURE.md`)
- `requirements.txt`, `package.json`, `pyproject.toml` (dependency-only changes)
- `infra.md`, `PR_GUIDELINES.md`, or other top-level docs

If a task requires touching more than 3 source files, split it into multiple PRs, each with a clear scope.

---

## 2. Mandatory Test Rule

Every PR that modifies a file under `src/` or `services/` must include or update at least one test.

- New function → new unit test.
- Changed function behavior → updated unit test.
- New Action Group Lambda → at least one integration or contract test.
- Refactor with no behavior change → existing tests must still pass; no new test required, but this must be stated in the PR description.

PRs without tests for `src/`/`services/` changes will not be merged.

---

## 3. Branch Naming

```
<type>/<scope>
```

| Type | Use for |
|---|---|
| `feat` | New functionality |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `chore` | Dependency update, config, tooling |
| `refactor` | Code restructure with no behavior change |
| `test` | Test-only changes |

Examples:
- `feat/query-lambda-build-sql`
- `fix/athena-timeout-handling`
- `docs/contracts-v1-viz`
- `chore/bump-boto3`

Branch names must be lowercase with hyphens. No spaces, no uppercase.

---

## 4. Required Validation Commands

These commands must pass locally before opening a PR. CI runs the same commands and blocks merge on failure.

**Python (any PR touching `.py` files):**

```bash
pytest tests/
```

**TypeScript (any PR touching `.ts` files under `services/`):**

```bash
tsc --noEmit
```

**Python syntax check (lightweight, fast):**

```bash
python -m py_compile $(git diff --name-only HEAD~1 | grep '\.py$')
```

**Contract schema validation (any PR touching `CONTRACTS.md`):**

```bash
# Placeholder — replace with actual validator when implemented
echo "CONTRACTS.md updated: manual review required against reportig_policy.json"
```

All four commands must exit with code `0`. Do not open a PR with a known failing command.

---

## 5. CI Gate

No PR may be merged until all CI checks are green.

CI runs on every push and on every PR against `main`:

| Check | Trigger |
|---|---|
| `pytest tests/` | Any `.py` file changed |
| `tsc --noEmit` | Any `.ts` file changed |
| Python compile check | Any `.py` file changed |
| Linter (if configured) | All changes |

**Merge is blocked if any CI check fails.** There are no exceptions, including time-sensitive fixes. Fix the failure, then merge.

---

## 6. Merge Strategy

- **Squash merge only** into `main`.
- Delete the feature branch after merge.
- The squash commit message must follow: `<type>(<scope>): <description>` — e.g., `feat(query-lambda): implement buildSQL with policy enforcement`.

---

## 7. PR Description Template

```markdown
## What
<!-- One sentence: what does this PR do? -->

## Why
<!-- Why is this change needed? Link to issue/task if applicable. -->

## Files changed (source)
<!-- List the ≤3 source files modified. -->

## Test coverage
<!-- Which tests cover this change? New tests added? -->

## Validation
<!-- Paste the output of: pytest / tsc --noEmit / py_compile -->
- [ ] `pytest tests/` passes
- [ ] `tsc --noEmit` passes (if TS changed)
- [ ] No contract schema violations
```

---

## Summary Table

| Rule | Value |
|---|---|
| Max source files per PR | 3 |
| Tests required | Yes, for any `src/` or `services/` change |
| Branch format | `<type>/<scope>` (lowercase, hyphens) |
| Merge strategy | Squash merge only |
| CI gate | All checks green before merge, no exceptions |
| Paired tests counted against limit | No |
| Docs/contracts counted against limit | No |
