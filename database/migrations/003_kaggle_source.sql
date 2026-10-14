ALTER TABLE ingestion_runs
DROP CONSTRAINT ingestion_runs_source_check;

ALTER TABLE ingestion_runs
  ADD CONSTRAINT ingestion_runs_source_check
    CHECK (source IN ('usgs', 'kaggle'));

ALTER TABLE source_events
DROP CONSTRAINT source_events_source_check;

ALTER TABLE source_events
  ADD CONSTRAINT source_events_source_check
    CHECK (source IN ('usgs', 'kaggle'));
