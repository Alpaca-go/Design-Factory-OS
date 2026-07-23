## Summary

- Adds the Reference Translation Profile command and contracts.
- Extracts transferable visual mechanisms from reference material without
  copying signature assets.
- Rebuilds project-specific visual semantics while preserving locked assets.
- Synchronizes the feature with the Retrieval-First core on `develop`.

## Validation

- `npm test`: 417 passed, 0 failed.
- `npm run verify:document-flows`: passed offline without external API calls.
- `npm --prefix apps/desktop test`: 32 passed, 0 failed.
- `npm --prefix apps/desktop run typecheck`: passed.

## Merge target

Merge into `develop` after review. Keep the feature branch until the PR is
merged and the result is verified.
