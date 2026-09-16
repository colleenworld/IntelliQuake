# ADR 0005: Use explainable, versioned candidate-series classification

- **Status:** Accepted
- **Date:** 2026-09-15

## Context

Earthquake catalogs do not provide one universally authoritative definition of a seismic series.
The engineering demonstration needs useful groupings without presenting a heuristic as scientific
ground truth. Classification must also remain reproducible after source events are revised.

## Decision

Use a deterministic space-time graph algorithm. Evaluate event pairs inside configurable,
magnitude-adjusted temporal and geographic windows; score them from normalized time, distance, and
magnitude components; and form connected components from accepted edges. Choose the
largest-magnitude event as the mainshock candidate, with origin time and event ID as stable
tie-breakers.

Each run reads revision history at a recorded catalog watermark and persists its algorithm version,
parameters, evaluated edges, series, memberships, roles, confidence scores, and explanations.
Results are append-only. Product language consistently describes them as candidate or inferred
relationships.

## Consequences

- Identical revision snapshots, parameters, and code versions produce identical memberships.
- Later catalog revisions can produce a different run without erasing earlier results.
- An explanation can identify the linked event, rule, time separation, distance, and score.
- The initial pair evaluation is quadratic inside the bounded analysis interval; spatial indexing or
  partitioning will be required before substantially increasing that interval.
- The output is useful for exploration and engineering review, not earthquake prediction or an
  authoritative seismological classification.
