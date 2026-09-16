# Earthquake Intelligence Platform

A production-oriented engineering demonstration that ingests mutable scientific catalog data,
preserves provenance, identifies explainable candidate seismic series, visualizes events, and
answers grounded questions.

This repository contains **Increment 3: Candidate series**. It includes the ingestion and explorer
foundation plus a versioned deterministic classifier, revision-watermarked inputs, persisted edge
evidence and memberships, series APIs, and an explicitly non-authoritative series visualization.
Release boundaries are summarized in `docs/product/version-one.md`; the complete product
specification is maintained as a companion project document.

## Prerequisites

- Node.js 24
- pnpm 11
- Docker with Compose
- AWS credentials only when synthesizing or deploying infrastructure

## Start locally

```bash
cp .env.example .env
pnpm install
pnpm db:up
pnpm dev
```

- API health: <http://localhost:3000/v1/health>
- Catalog freshness: <http://localhost:3000/v1/system/freshness>
- Events: <http://localhost:3000/v1/events?minimumMagnitude=2.5>
- Candidate series: <http://localhost:3000/v1/series>
- Dashboard: <http://localhost:5173>

## Quality checks

```bash
pnpm check
pnpm infra:synth
```

## Workspace layout

```text
apps/api             NestJS/Fastify application API
apps/dashboard       React/Vite dashboard
apps/ingestion       USGS clients, producers, processors, adapters, handlers, and CLIs
packages/contracts   Boundary schemas and API contracts
packages/classification Deterministic candidate-series algorithm
packages/domain      Domain value objects and validation
packages/observability Structured logging foundation
infrastructure       AWS CDK application
database             Local database initialization
docs/adr              Architecture decision records
docs/product          Version-one product boundaries
docs/architecture     Runtime and failure-flow documentation
```

## Current boundaries

The first product release targets USGS catalog ingestion, PostGIS queries, explainable seismic
series, an animated dashboard, and a typed-tool chatbot. Waveform processing, Common Crawl,
multi-catalog reconciliation, and advanced scientific classification are intentionally deferred.

## Useful commands

| Command                                                       | Purpose                                                    |
| ------------------------------------------------------------- | ---------------------------------------------------------- |
| `pnpm dev`                                                    | Run the API and dashboard in watch mode.                   |
| `pnpm check`                                                  | Run formatting, linting, type checking, tests, and builds. |
| `pnpm db:up`                                                  | Start local PostgreSQL/PostGIS.                            |
| `pnpm db:down`                                                | Stop local services.                                       |
| `pnpm db:migrate`                                             | Apply pending PostGIS schema migrations.                   |
| `pnpm ingest:poll`                                            | Fetch and process the configured USGS feed locally.        |
| `pnpm ingest:backfill -- --start=2026-09-01 --end=2026-09-02` | Run a bounded historical import.                           |
| `pnpm series:classify`                                        | Classify the configured recent analysis interval.          |
| `pnpm infra:synth`                                            | Synthesize the CDK stack.                                  |

## Run the ingestion path locally

```bash
cp .env.example .env
pnpm db:up
pnpm db:migrate
pnpm ingest:poll
pnpm ingest:backfill -- --start=2026-09-01 --end=2026-09-02 --minimum-magnitude=2.5
pnpm series:classify
```

Raw objects are written beneath `.local/raw` and normalized revisions are written transactionally
to PostgreSQL. Re-running the same import is safe and records unchanged processing outcomes.
Classification reads a revision snapshot at a recorded watermark and appends a new run with its
parameters, evidence, candidate series, and membership explanations.

## Engineering principles

- Treat source records as mutable and preserve every observed revision.
- Assume queues deliver at least once and make consumers idempotent.
- Store raw data before acknowledging successful ingestion.
- Version analytical runs and retain their parameters and evidence.
- Use deterministic database tools for factual chat answers.
- Make inferred scientific relationships and system limitations explicit.
