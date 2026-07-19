# Masterpiece OS Quality System Standards

This directory is the repository entry point for the MQS V1 quality system.
Phase 1 intentionally records only the stable contracts needed by code; it does
not duplicate visual analysis, implement the complete anti-pattern catalogue, or
introduce a repair loop.

The normative source set is:

1. Masterpiece Quality Standard (MQS) V1
2. Masterpiece OS Anti-pattern Library V1
3. MQS x Anti-pattern Library Integration Notes V1

The Phase 1 implementation fixes the following shared rules:

- Validation status is one of `pass`, `repair`, or `reject`.
- Execution order is schema validation, hard-fail detection, anti-pattern
  detection, MQS scoring, and status resolution.
- A schema failure, a hard fail, an active S4 anti-pattern, or failure of a core
  dimension produces `reject`.
- An active S2/S3 anti-pattern or a score below the module minimum produces
  `repair` when no reject condition exists.
- S1 findings are advisory and do not block `pass`.
- Anti-pattern definitions are registered outside the orchestration core.

The machine-readable contracts live in `../schemas`; the runtime extension
points live in `../validators`.

## Phase 2 shadow detection

Phase 2 adds Critical Hard Fail and selected high-frequency anti-pattern rules
without connecting them to Visual Translation or report generation. Rules are
classified as `deterministic`, `semantic`, or `hybrid`. Semantic evaluation is
an injected adapter; when none is supplied, semantic-only checks are explicitly
reported as not evaluated and never fall back to keyword guessing.

Numeric penalties use the V1 bands (S1: 1-3, S2: 4-8, S3: 9-15). S4 is a Hard
Fail with no numeric penalty. Repeated occurrences use 1x, 1.25x, then 1.5x for
each third-or-later occurrence. The total numeric penalty for one module is
capped at 40. Shadow mode clones its input, emits an independent validation
result, skips MQS aesthetic scoring, and cannot block or rerun the source flow.

## Phase 3 context and review infrastructure

Phase 3 keeps the same non-blocking boundary while adding read-only adapters for
Visual Direction, Report, and Brand Context. Adapters emit a versioned Quality
Context, preserve missing information as `unknown` or `unavailable`, and contain
no rule logic. The JSON shadow store persists only the validation record and its
provenance; source output and report content are never written into that store.
Human reviews are maintained separately inside the record and can classify each
rule as true positive, false positive, false negative, or uncertain.
