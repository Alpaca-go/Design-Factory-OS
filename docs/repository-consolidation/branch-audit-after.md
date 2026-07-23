# Repository branch audit after cleanup

Audit date: 2026-07-23 (Asia/Shanghai).

## Remaining remote branches

| Branch | Status |
| --- | --- |
| `main` | Retrieval-First core baseline |
| `develop` | Long-lived integration branch |
| `feature/reference-led-visual-direction` | Active; PR #7 targets `develop` |
| `feature/retrieval-first-single-pipeline` | Merged by PR #6; retain for 3-7 days |

## Pull requests

- PR #6 was merged into `main` with merge commit
  `5f9ac06d1e25aa4b091461e4b4437f9b7d3f82af`.
- PR #7 is open from `feature/reference-led-visual-direction` to `develop`.
- PRs #2, #3, #4 and #5 were closed without merging after an archive-tag
  explanation was added to each PR.

## Deleted archived remote branches

After explicit user confirmation, the following remote branches were deleted:

- `v5-deep-creative-director`
- `v5-desktop`
- `feature/visual-translation-v1`
- `feature/brand-dna-analysis`
- `feature/brand-dna-report-v2`
- `feature/brand-dna-v3-deep-compact`
- `feature/brand-dna-v3-core-quality-fix`
- `experiment/execution-oriented-directions-v2`
- `experiment/visual-fact-first-pipeline`

All nine annotated `archive/*-20260723` tags remain on the remote and retain
the exact deleted branch tips.
