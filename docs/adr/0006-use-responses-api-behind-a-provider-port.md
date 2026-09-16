# ADR 0006: Use the Responses API behind a provider port

- **Status:** Accepted
- **Date:** 2026-09-16

## Context

The conversational increment needs tool selection and streamed answers without coupling catalog
logic, tests, or the dashboard to one model SDK.

## Decision

Use the OpenAI Responses API through a small server-side `ModelProvider` interface. Keep tool
definitions, argument validation, execution, citations, rate limits, and redacted telemetry in the
application. Tests inject a fake provider and never require credentials or network access.

## Consequences

- API credentials remain server-side and are never sent to the browser or model tools.
- Model-provider changes do not alter database or UI contracts.
- Production operation requires `OPENAI_API_KEY` and an available configured model.
- Provider streaming and function-call event shapes are isolated in one adapter.
