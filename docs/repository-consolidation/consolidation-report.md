# Repository consolidation report

Current status: repository consolidation completed on 2026-07-23. The nine
explicitly confirmed historical remote branches were deleted after their
archive tags were reverified.

## Core consolidation

- Retrieval-First PR: https://github.com/Alpaca-go/Masterpiece-OS/pull/6
- PR result: merged into `main` with a merge commit.
- Merge commit: `5f9ac06d1e25aa4b091461e4b4437f9b7d3f82af`.
- Baseline tag: `retrieval-first-core-beta-0.5`.
- `develop` was created from the merged `main` baseline.

## Validation before PR #6

- `npm test`: 410 passed, 0 failed.
- `npm run verify:document-flows`: passed offline without external API calls.
- `npm --prefix apps/desktop test`: 32 passed, 0 failed.
- `npm --prefix apps/desktop run typecheck`: passed.
- `npm run desktop:build`: passed.
- Retrieval-First targeted regression suite: 34 passed, 0 failed.

## Pull-request cleanup

- PRs #2, #3, #4 and #5 were documented and closed without merging.
- PR #7 remains open from the Reference-led feature branch to `develop`.

## Active Reference-led work

- Branch: `feature/reference-led-visual-direction`.
- The branch merged `origin/develop` without conflicts.
- Validation after synchronization:
  - `npm test`: 417 passed, 0 failed.
  - `npm run verify:document-flows`: passed offline.
  - `npm --prefix apps/desktop test`: 32 passed, 0 failed.
  - `npm --prefix apps/desktop run typecheck`: passed.
- PR: https://github.com/Alpaca-go/Masterpiece-OS/pull/7
- Target: `develop`; status: open for review.

## Historical branch cleanup

- Nine confirmed historical remote branches were deleted.
- Their nine annotated `archive/*-20260723` tags remain available.
- The remaining remote branches are `main`, `develop`,
  and `feature/reference-led-visual-direction`.
- The merged `feature/retrieval-first-single-pipeline` branch was later
  deleted locally and remotely after separate user confirmation.

## Rollback and retention policy

- Restore an archived line from its `archive/*-20260723` annotated tag.
- Do not rewrite `main`; use a revert PR if PR #6 must be reversed.
- Retrieval-First remains recoverable through PR #6, the `main` merge commit,
  and `retrieval-first-core-beta-0.5`.
