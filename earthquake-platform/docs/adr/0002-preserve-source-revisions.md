# ADR 0002: Preserve raw source records and revisions

- **Status:** Accepted
- **Date:** 2026-08-30

## Context

Earthquake catalog records change as agencies refine origin, magnitude, depth, and status. Updating
one database row in place would hide provenance and make ingestion behavior difficult to audit.

## Decision

Persist an immutable raw payload before normalization. Model source identity separately from the
canonical event, retain every meaningful observed revision, and expose a current projection for
normal application queries.

## Consequences

- Duplicate and revised delivery can be demonstrated and tested clearly.
- Historical reconstruction and normalizer replay remain possible.
- Storage and retention require deliberate management.
- Canonical identity and reconciliation rules must be versioned as new catalogs are added.
