# Version-one product boundary

## Goal

Demonstrate production engineering through a system that ingests an evolving scientific catalog,
preserves provenance, produces explainable analytical results, coordinates a rich geospatial UI,
and grounds conversational answers in deterministic data tools.

## In scope

- Poll and backfill the USGS earthquake catalog.
- Preserve immutable raw records and every meaningful observed revision.
- Normalize source records into a PostGIS-backed canonical catalog.
- Group events into reproducible, explainable candidate seismic series.
- Explore events through a map, timeline, filters, facts, revisions, and series views.
- Answer a bounded set of catalog questions through typed read-only chatbot tools.
- Deploy with infrastructure as code, CI/CD, tests, metrics, logs, traces, and alerts.

## Deferred

- Waveform and continuous SeedLink ingestion.
- Common Crawl and document retrieval.
- Multiple earthquake catalogs and cross-catalog reconciliation.
- ETAS, Reasenberg, or machine-learning classification.
- Custom model training and earthquake prediction.

## Delivery increments

1. Foundation
2. Catalog ingestion
3. Event explorer
4. Candidate series
5. Conversational interface
6. Production polish
