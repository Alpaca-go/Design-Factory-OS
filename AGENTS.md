# Masterpiece OS development rules

## Document-related release gate

After changing document ingestion, structured analysis, checkpoint, report compiler, or Desktop document-delivery code, run `npm run verify:document-flows` before declaring the work complete.

Do not package or deliver a Desktop executable when this gate fails. The gate must remain offline and must never call a real model API.

Before delivering a new Desktop executable after changing analysis prompts, provider request shapes, schema validation, retries, checkpoints, or report generation, also run one user-authorized real-provider end-to-end smoke test with a representative local document. A launch-only smoke test or mocked response is not sufficient. Record the provider/model, terminal status, model-call count, duration, report path, and composition result without exposing credentials. Do not commit or deliver the executable unless the real run reaches the final report successfully.
