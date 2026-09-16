CREATE TABLE IF NOT EXISTS classification_runs (
  id uuid PRIMARY KEY,
  algorithm text NOT NULL,
  algorithm_version text NOT NULL,
  parameters jsonb NOT NULL,
  catalog_watermark timestamptz NOT NULL,
  analysis_start timestamptz NOT NULL,
  analysis_end timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  input_count integer NOT NULL DEFAULT 0 CHECK (input_count >= 0),
  series_count integer NOT NULL DEFAULT 0 CHECK (series_count >= 0),
  membership_count integer NOT NULL DEFAULT 0 CHECK (membership_count >= 0),
  failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (analysis_start < analysis_end),
  CHECK (completed_at IS NULL OR started_at <= completed_at)
);

CREATE TABLE IF NOT EXISTS seismic_series (
  id uuid PRIMARY KEY,
  classification_run_id uuid NOT NULL REFERENCES classification_runs(id) ON DELETE RESTRICT,
  deterministic_key text NOT NULL,
  mainshock_candidate_event_id uuid NOT NULL REFERENCES canonical_events(id) ON DELETE RESTRICT,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  event_count integer NOT NULL CHECK (event_count >= 2),
  maximum_magnitude numeric,
  centroid geography(Point, 4326) NOT NULL,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (classification_run_id, deterministic_key),
  CHECK (start_time <= end_time)
);

CREATE TABLE IF NOT EXISTS series_memberships (
  series_id uuid NOT NULL REFERENCES seismic_series(id) ON DELETE RESTRICT,
  canonical_event_id uuid NOT NULL REFERENCES canonical_events(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('earlier_event', 'mainshock_candidate', 'later_event')),
  confidence numeric NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  explanation jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (series_id, canonical_event_id)
);

CREATE TABLE IF NOT EXISTS series_edges (
  classification_run_id uuid NOT NULL REFERENCES classification_runs(id) ON DELETE RESTRICT,
  source_event_id uuid NOT NULL REFERENCES canonical_events(id) ON DELETE RESTRICT,
  target_event_id uuid NOT NULL REFERENCES canonical_events(id) ON DELETE RESTRICT,
  time_delta_seconds bigint NOT NULL CHECK (time_delta_seconds >= 0),
  distance_km numeric NOT NULL CHECK (distance_km >= 0),
  magnitude_delta numeric,
  score numeric NOT NULL CHECK (score BETWEEN 0 AND 1),
  rule text NOT NULL,
  accepted boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (classification_run_id, source_event_id, target_event_id),
  CHECK (source_event_id <> target_event_id)
);

CREATE INDEX IF NOT EXISTS classification_runs_completed_idx
  ON classification_runs (completed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS seismic_series_run_idx
  ON seismic_series (classification_run_id, start_time, id);
CREATE INDEX IF NOT EXISTS series_memberships_event_idx
  ON series_memberships (canonical_event_id, series_id);
CREATE INDEX IF NOT EXISTS series_edges_accepted_idx
  ON series_edges (classification_run_id, accepted) WHERE accepted;
