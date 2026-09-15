CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id uuid PRIMARY KEY,
  source text NOT NULL CHECK (source IN ('usgs')),
  mode text NOT NULL CHECK (mode IN ('poll', 'backfill', 'replay')),
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'partially_failed', 'failed')),
  requested_start timestamptz,
  requested_end timestamptz,
  source_watermark timestamptz,
  fetched_count integer NOT NULL DEFAULT 0 CHECK (fetched_count >= 0),
  queued_count integer NOT NULL DEFAULT 0 CHECK (queued_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  processed_count integer NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
  created_count integer NOT NULL DEFAULT 0 CHECK (created_count >= 0),
  revised_count integer NOT NULL DEFAULT 0 CHECK (revised_count >= 0),
  unchanged_count integer NOT NULL DEFAULT 0 CHECK (unchanged_count >= 0),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requested_start IS NULL OR requested_end IS NULL OR requested_start < requested_end)
);

CREATE TABLE IF NOT EXISTS raw_objects (
  id uuid PRIMARY KEY,
  storage_key text NOT NULL UNIQUE,
  checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
  content_type text NOT NULL,
  byte_length bigint NOT NULL CHECK (byte_length >= 0),
  captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS canonical_events (
  id uuid PRIMARY KEY,
  origin_time timestamptz NOT NULL,
  location geography(Point, 4326) NOT NULL,
  depth_km numeric NOT NULL CHECK (depth_km BETWEEN -100 AND 1000),
  preferred_magnitude numeric,
  preferred_magnitude_type text,
  place text,
  event_type text NOT NULL,
  status text NOT NULL,
  significance integer NOT NULL CHECK (significance >= 0),
  felt_reports integer CHECK (felt_reports >= 0),
  tsunami boolean NOT NULL DEFAULT false,
  current_source_revision_id uuid,
  first_observed_at timestamptz NOT NULL,
  last_observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (first_observed_at <= last_observed_at)
);

CREATE TABLE IF NOT EXISTS source_events (
  id uuid PRIMARY KEY,
  source text NOT NULL CHECK (source IN ('usgs')),
  source_event_id text NOT NULL,
  canonical_event_id uuid NOT NULL REFERENCES canonical_events(id) ON DELETE RESTRICT,
  source_url text NOT NULL,
  first_observed_at timestamptz NOT NULL,
  last_observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_event_id),
  CHECK (first_observed_at <= last_observed_at)
);

CREATE TABLE IF NOT EXISTS event_revisions (
  id uuid PRIMARY KEY,
  source_event_id uuid NOT NULL REFERENCES source_events(id) ON DELETE RESTRICT,
  ingestion_run_id uuid NOT NULL REFERENCES ingestion_runs(id) ON DELETE RESTRICT,
  raw_object_id uuid NOT NULL REFERENCES raw_objects(id) ON DELETE RESTRICT,
  source_updated_at timestamptz NOT NULL,
  observed_at timestamptz NOT NULL,
  payload_checksum text NOT NULL CHECK (payload_checksum ~ '^[a-f0-9]{64}$'),
  normalizer_version text NOT NULL,
  origin_time timestamptz NOT NULL,
  location geography(Point, 4326) NOT NULL,
  depth_km numeric NOT NULL CHECK (depth_km BETWEEN -100 AND 1000),
  magnitude numeric,
  magnitude_type text,
  place text,
  event_type text NOT NULL,
  status text NOT NULL,
  significance integer NOT NULL CHECK (significance >= 0),
  felt_reports integer CHECK (felt_reports >= 0),
  tsunami boolean NOT NULL,
  source_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_event_id, source_updated_at, payload_checksum)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'canonical_events_current_revision_fk'
  ) THEN
    ALTER TABLE canonical_events
      ADD CONSTRAINT canonical_events_current_revision_fk
      FOREIGN KEY (current_source_revision_id) REFERENCES event_revisions(id) ON DELETE RESTRICT;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS canonical_events_origin_time_idx
  ON canonical_events (origin_time DESC, id);
CREATE INDEX IF NOT EXISTS canonical_events_location_gix
  ON canonical_events USING gist (location);
CREATE INDEX IF NOT EXISTS canonical_events_magnitude_idx
  ON canonical_events (preferred_magnitude DESC) WHERE preferred_magnitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS event_revisions_source_time_idx
  ON event_revisions (source_event_id, source_updated_at DESC);
CREATE INDEX IF NOT EXISTS ingestion_runs_started_at_idx
  ON ingestion_runs (started_at DESC);
