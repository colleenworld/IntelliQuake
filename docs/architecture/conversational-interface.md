# Conversational interface

The chat endpoint accepts a bounded message plus at most twelve prior turns. The API—not the
model—owns validation, rate limiting, database access, result limits, citations, and response
formatting. The OpenAI Responses API is behind a provider port so orchestration tests run without
network access and a future provider can be substituted without changing catalog tools.

## Grounding flow

1. Validate the request and enforce a per-client fixed-window rate limit.
2. Refuse prediction requests before sending content to a model.
3. Ask the model to select from six typed read-only tools.
4. Validate tool arguments with Zod and execute parameterized catalog queries.
5. Emit navigable event or series citations directly from tool results.
6. Stream the final answer after providing the bounded tool output to the model.

The model never receives database credentials or arbitrary SQL capability. Catalog-specific claims
must come from `search_events`, `get_event`, `get_nearby_events`, `get_largest_events`,
`get_series`, or `compare_series`. Candidate-series answers must call the grouping inferred and
non-predictive.

Structured logs record request identifiers, provider and tool latency, selected tool, token usage,
result count, and citation count. They intentionally omit prompts, model output, credentials, and
raw tool payloads.
