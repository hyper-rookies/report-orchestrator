# Repository Instructions

## Source Of Truth

- For runtime behavior, request validation, and response shape, verify the implementation first before relying on task docs or setup docs. In this repo, the current source of truth is the service code under `backend/services/`.

## Documentation Sync

- When a change modifies behavior, contracts, required parameters, configuration steps, or operator workflow, update the relevant documentation in the same change.
- If you discover that an existing doc is stale while making a fix, correct that doc as part of the task instead of leaving the mismatch behind.
- At minimum, review and update the closest affected docs such as `docs/CONTRACTS.md`, setup guides in `docs/`, task reports in `docs/tasks/`, and any prompt or operator guidance that references the changed behavior.
