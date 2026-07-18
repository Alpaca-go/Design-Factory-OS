# Masterpiece OS development rules

## Document-related release gate

After changing document ingestion, structured analysis, checkpoint, report compiler, or Desktop document-delivery code, run `npm run verify:document-flows` before declaring the work complete.

Do not package or deliver a Desktop executable when this gate fails. The gate must remain offline and must never call a real model API.
