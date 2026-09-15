# ADR 0004: Use at-least-once ingestion with idempotent consumers

- **Status:** Accepted
- **Date:** 2026-09-14

## Context

USGS records may be delivered repeatedly and revised after first publication. SQS also provides
at-least-once delivery, so duplicate messages are expected during ordinary operation and retries.

## Decision

Save each source response and deterministic per-event payload before publishing its queue message.
Identify a revision by source event, source update timestamp, and payload checksum. Serialize writes
for one source identity with a PostgreSQL transaction-scoped advisory lock. Retain new out-of-order
revisions without allowing an older source update to replace the current event projection.

## Consequences

- Replaying identical messages is safe.
- Revised and out-of-order records remain auditable.
- Consumers can use partial SQS batch failure reporting.
- The database is the final authority on idempotency; queue-level deduplication is unnecessary.
- The ingestion run can finish publishing before all queued records have been processed, so publish
  and processing counts are reported separately.
