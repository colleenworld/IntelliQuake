# ADR 0003: Use typed read-only tools for catalog questions

- **Status:** Accepted
- **Date:** 2026-08-30

## Context

The chatbot must answer numerical and event-specific questions accurately. Embedding retrieval is
not a reliable substitute for deterministic catalog queries, and arbitrary model-generated SQL
would create security and reliability problems.

## Decision

Expose a bounded set of typed, read-only application tools to the model. Validate all arguments,
apply authorization and result limits in the API, and return record identifiers that the UI can
render as citations. Reserve retrieval-augmented generation for explanatory documents.

## Consequences

- Supported factual questions are testable and auditable.
- The model never receives database credentials.
- Adding a new question type may require a new or expanded tool contract.
- Tool traces and evaluation fixtures become part of the product quality strategy.
