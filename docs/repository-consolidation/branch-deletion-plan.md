# Remote branch deletion record

Status: **completed on 2026-07-23 after explicit user confirmation**.

## Retained remote branches

- `main`
- `develop`
- `feature/reference-led-visual-direction`
- `feature/retrieval-first-single-pipeline`

The Retrieval-First feature branch is retained for 3-7 days after PR #6 and
requires a separate later deletion confirmation.

## Deleted remote branches

Each branch was reverified against its remote annotated archive tag immediately
before deletion:

- `v5-deep-creative-director`
- `v5-desktop`
- `feature/visual-translation-v1`
- `feature/brand-dna-analysis`
- `feature/brand-dna-report-v2`
- `feature/brand-dna-v3-deep-compact`
- `feature/brand-dna-v3-core-quality-fix`
- `experiment/execution-oriented-directions-v2`
- `experiment/visual-fact-first-pipeline`

## Completion verification

- All nine remote branches are absent.
- All nine annotated archive tags remain on the remote.
- The four retained remote branches remain present.
- Deleted branches can be restored from their corresponding archive tags.
