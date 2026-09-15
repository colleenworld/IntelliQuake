# ADR 0001: Use a TypeScript monorepo

- **Status:** Accepted
- **Date:** 2026-08-30

## Context

The platform includes a browser application, an API, infrastructure code, shared domain concepts,
and boundary contracts. Version 1 should remain easy for one engineer to change and demonstrate.

## Decision

Use a pnpm workspace containing independently buildable applications and packages. Use TypeScript
for the dashboard, API, shared packages, and AWS CDK infrastructure. Introduce Python only when a
scientific workload benefits materially from ObsPy or the Python scientific ecosystem.

## Consequences

- Types and validation schemas can be shared without copying code.
- One CI workflow can validate the whole system.
- Package boundaries must remain intentional; the monorepo is not permission to couple layers.
- A future Python service will use an explicit API or message contract rather than workspace imports.
