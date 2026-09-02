# Earthquake Intelligence Platform

A production-oriented engineering demonstration that ingests mutable scientific catalog data,
preserves provenance, identifies explainable candidate seismic series, visualizes events, and
answers grounded questions.

This repository currently contains **Increment 0: Foundation**. The release boundaries are
summarized in `docs/product/version-one.md`; the complete product specification is maintained as a
companion project document.

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
packages/contracts   Boundary schemas and API contracts
packages/domain      Domain value objects and validation
packages/observability Structured logging foundation
infrastructure       AWS CDK application
database             Local database initialization
docs/adr              Architecture decision records
docs/product          Version-one product boundaries
```

## Current boundaries

The first product release targets USGS catalog ingestion, PostGIS queries, explainable seismic
series, an animated dashboard, and a typed-tool chatbot. Waveform processing, Common Crawl,
multi-catalog reconciliation, and advanced scientific classification are intentionally deferred.

## Useful commands

| Command            | Purpose                                                    |
| ------------------ | ---------------------------------------------------------- |
| `pnpm dev`         | Run the API and dashboard in watch mode.                   |
| `pnpm check`       | Run formatting, linting, type checking, tests, and builds. |
| `pnpm db:up`       | Start local PostgreSQL/PostGIS.                            |
| `pnpm db:down`     | Stop local services.                                       |
| `pnpm infra:synth` | Synthesize the CDK stack.                                  |

## Engineering principles

- Treat source records as mutable and preserve every observed revision.
- Assume queues deliver at least once and make consumers idempotent.
- Store raw data before acknowledging successful ingestion.
- Version analytical runs and retain their parameters and evidence.
- Use deterministic database tools for factual chat answers.
- Make inferred scientific relationships and system limitations explicit.
