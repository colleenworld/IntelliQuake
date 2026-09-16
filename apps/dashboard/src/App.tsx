import { reaction } from 'mobx';
import { observer } from 'mobx-react-lite';
import { useEffect } from 'react';

import { EventMap } from './EventMap';
import { explorerStore } from './store';

const formatTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );

const magnitude = (event: { magnitude: number | null }) =>
  event.magnitude === null ? 'Unrated' : `M ${event.magnitude.toFixed(1)}`;

const roleLabel = (role: string) => role.replaceAll('_', ' ');

const duration = (seconds: number) => {
  if (seconds < 3_600) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3_600).toFixed(1)} hr`;
};

export const App = observer(function App() {
  useEffect(() => {
    explorerStore.applyUrl(window.location.search);
    void explorerStore.loadSeries();

    const dispose = reaction(
      () => explorerStore.urlSearch,
      (search) => window.history.replaceState(null, '', `${window.location.pathname}${search}`),
    );
    const handlePopState = () => {
      explorerStore.applyUrl(window.location.search);
      void explorerStore.loadEvents();
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      dispose();
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    void explorerStore.loadSelectedSeries();
    void explorerStore.loadEvents();
  }, [explorerStore.selectedSeriesId]);

  useEffect(() => {
    if (explorerStore.selectedEventId) void explorerStore.loadSelectedEvent();
  }, [explorerStore.selectedEventId]);

  useEffect(() => {
    if (!explorerStore.isPlaying) return;
    const timer = window.setInterval(() => explorerStore.advancePlayback(), 900);
    return () => window.clearInterval(timer);
  }, [explorerStore.isPlaying]);

  const selectedDetail = explorerStore.selectedEventDetail;
  const selected = selectedDetail ?? explorerStore.selectedEvent;
  const selectedSeriesDetail = explorerStore.selectedSeriesDetail;
  const seriesMemberIds = explorerStore.selectedSeriesMemberIds;
  const mapEvents: Array<{
    id: string;
    coordinates: { latitude: number; longitude: number };
    magnitude: number | null;
    place: string | null;
  }> = explorerStore.events.map((event) => event);
  for (const membership of selectedSeriesDetail?.memberships ?? []) {
    if (!mapEvents.some((event) => event.id === membership.event.id)) {
      mapEvents.push(membership.event);
    }
  }
  const timelineEvents = selectedSeriesDetail
    ? selectedSeriesDetail.memberships.map((membership) => membership.event)
    : explorerStore.events;
  const roleByEventId = new Map<string, string>(
    selectedSeriesDetail?.memberships.map((membership) => [membership.event.id, membership.role]) ??
      [],
  );

  return (
    <main>
      <header className="masthead">
        <div>
          <p className="eyebrow">Event Explorer · Live catalog</p>
          <h1>Earthquake Intelligence</h1>
          <p className="lede">
            Explore normalized USGS events with their provenance intact. Map size represents
            magnitude; the timeline remains a keyboard-accessible equivalent.
          </p>
        </div>
        <div className={`catalog-state catalog-state--${explorerStore.status}`} role="status">
          <span>{explorerStore.status === 'loading' ? 'Refreshing' : explorerStore.status}</span>
          <strong>{explorerStore.events.length} events</strong>
        </div>
      </header>

      {(explorerStore.errorMessage || explorerStore.mapMessage) && (
        <section className="notice" aria-live="polite">
          {explorerStore.errorMessage ?? explorerStore.mapMessage}
        </section>
      )}

      <section className="series-panel" aria-labelledby="series-title">
        <div className="series-heading">
          <div>
            <p className="panel-label">Inferred relationships · not a scientific determination</p>
            <h2 id="series-title">Candidate seismic series</h2>
          </div>
          {explorerStore.classificationRun && (
            <span className="run-chip">
              Algorithm {explorerStore.classificationRun.algorithmVersion} · watermark{' '}
              {formatTime(explorerStore.classificationRun.catalogWatermark)}
            </span>
          )}
        </div>
        {explorerStore.seriesErrorMessage ? (
          <p className="series-message">{explorerStore.seriesErrorMessage}</p>
        ) : explorerStore.seriesStatus === 'loading' ? (
          <p className="series-message">Loading candidate series…</p>
        ) : explorerStore.series.length === 0 ? (
          <p className="series-message">
            No candidate series are available from the latest classification run.
          </p>
        ) : (
          <div className="series-list">
            <button
              type="button"
              className={explorerStore.selectedSeriesId === null ? 'series-card--selected' : ''}
              onClick={() => explorerStore.selectSeries(null)}
            >
              <strong>All events</strong>
              <small>Clear series highlight</small>
            </button>
            {explorerStore.series.map((series) => (
              <button
                type="button"
                key={series.id}
                className={
                  series.id === explorerStore.selectedSeriesId ? 'series-card--selected' : ''
                }
                onClick={() => explorerStore.selectSeries(series.id)}
              >
                <strong>{series.displayName}</strong>
                <small>
                  {series.eventCount} events ·{' '}
                  {series.maximumMagnitude === null
                    ? 'Unrated'
                    : `M ${series.maximumMagnitude.toFixed(1)}`}
                </small>
              </button>
            ))}
          </div>
        )}
      </section>

      <form
        className="filters"
        onSubmit={(event) => {
          event.preventDefault();
          explorerStore.pausePlayback();
          void explorerStore.loadEvents();
        }}
      >
        <label>
          <span>Minimum magnitude</span>
          <input
            type="number"
            min="-2"
            max="10"
            step="0.1"
            value={explorerStore.minimumMagnitude}
            onChange={(event) => explorerStore.setMinimumMagnitude(Number(event.target.value))}
          />
        </label>
        <label>
          <span>Maximum magnitude</span>
          <input
            type="number"
            min="-2"
            max="10"
            step="0.1"
            placeholder="Any"
            value={explorerStore.maximumMagnitude ?? ''}
            onChange={(event) =>
              explorerStore.setMaximumMagnitude(
                event.target.value ? Number(event.target.value) : null,
              )
            }
          />
        </label>
        <label>
          <span>From</span>
          <input
            type="datetime-local"
            value={explorerStore.startTime}
            onChange={(event) => explorerStore.setStartTime(event.target.value)}
          />
        </label>
        <label>
          <span>Until</span>
          <input
            type="datetime-local"
            value={explorerStore.endTime}
            onChange={(event) => explorerStore.setEndTime(event.target.value)}
          />
        </label>
        <button type="submit" disabled={explorerStore.status === 'loading'}>
          {explorerStore.status === 'loading' ? 'Loading…' : 'Apply filters'}
        </button>
      </form>

      <section className="workspace" aria-label="Earthquake event explorer">
        <div className="map-panel">
          <EventMap
            events={mapEvents}
            selectedEventId={explorerStore.selectedEventId}
            seriesMemberIds={seriesMemberIds}
            mainshockCandidateEventId={selectedSeriesDetail?.mainshockCandidateEventId ?? null}
            onSelect={(id) => explorerStore.selectEvent(id)}
            onDegraded={(message) => explorerStore.setMapDegraded(message)}
          />
          <div className="map-legend" aria-hidden="true">
            <span className="legend-dot legend-dot--small" /> M2.5
            <span className="legend-dot legend-dot--large" /> M7+
            {selectedSeriesDetail && (
              <>
                <span className="legend-dot legend-dot--member" /> inferred member
                <span className="legend-dot legend-dot--mainshock" /> mainshock candidate
              </>
            )}
          </div>
        </div>

        <aside className="facts-panel" aria-live="polite">
          <p className="panel-label">Selected event</p>
          {selected ? (
            <>
              <div className="magnitude-badge">{magnitude(selected)}</div>
              <h2>{selected.place ?? 'Unnamed earthquake event'}</h2>
              <dl>
                <div>
                  <dt>Origin</dt>
                  <dd>{formatTime(selected.originTime)}</dd>
                </div>
                <div>
                  <dt>Depth</dt>
                  <dd>{selected.coordinates.depthKm.toFixed(1)} km</dd>
                </div>
                <div>
                  <dt>Position</dt>
                  <dd>
                    {selected.coordinates.latitude.toFixed(3)},{' '}
                    {selected.coordinates.longitude.toFixed(3)}
                  </dd>
                </div>
                {selectedDetail && (
                  <div>
                    <dt>Significance</dt>
                    <dd>{selectedDetail.significance}</dd>
                  </div>
                )}
                {selectedDetail && (
                  <div>
                    <dt>Felt reports</dt>
                    <dd>{selectedDetail.feltReports ?? 'None'}</dd>
                  </div>
                )}
                {selectedDetail && (
                  <div>
                    <dt>Revisions</dt>
                    <dd>{selectedDetail.revisionCount}</dd>
                  </div>
                )}
              </dl>
              <p className="source-line">
                {selected.source.toUpperCase()} · {selected.sourceEventId}
              </p>
              {selectedDetail?.sourceUrl && (
                <a
                  className="source-link"
                  href={selectedDetail.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open source record
                </a>
              )}
            </>
          ) : (
            <div className="empty-detail">
              <h2>Select an event</h2>
              <p>Choose a point on the map or an event in the timeline to inspect its facts.</p>
            </div>
          )}
        </aside>
      </section>

      {selectedSeriesDetail && (
        <section className="series-evidence" aria-labelledby="evidence-title">
          <div className="series-heading">
            <div>
              <p className="panel-label">Classification evidence</p>
              <h2 id="evidence-title">{selectedSeriesDetail.displayName}</h2>
            </div>
            <span className="candidate-label">Candidate / inferred</span>
          </div>
          <p className="series-disclaimer">
            This grouping is a reproducible engineering heuristic. It is not an authoritative
            seismological classification and does not predict future earthquakes.
          </p>
          <dl className="run-facts">
            <div>
              <dt>Algorithm</dt>
              <dd>
                {selectedSeriesDetail.classificationRun.algorithm} v
                {selectedSeriesDetail.classificationRun.algorithmVersion}
              </dd>
            </div>
            <div>
              <dt>Input snapshot</dt>
              <dd>{formatTime(selectedSeriesDetail.classificationRun.catalogWatermark)}</dd>
            </div>
            <div>
              <dt>Base windows</dt>
              <dd>
                {selectedSeriesDetail.classificationRun.parameters.baseTimeWindowHours} hr ·{' '}
                {selectedSeriesDetail.classificationRun.parameters.baseDistanceKm} km
              </dd>
            </div>
            <div>
              <dt>Edge threshold</dt>
              <dd>{selectedSeriesDetail.classificationRun.parameters.minimumEdgeScore}</dd>
            </div>
          </dl>
          <ol className="membership-list">
            {selectedSeriesDetail.memberships.map((membership) => (
              <li key={membership.event.id}>
                <button
                  type="button"
                  onClick={() => explorerStore.selectEvent(membership.event.id)}
                >
                  <span className={`role-badge role-badge--${membership.role}`}>
                    {roleLabel(membership.role)}
                  </span>
                  <strong>{membership.event.place ?? 'Unnamed event'}</strong>
                  <small>
                    Confidence {(membership.confidence * 100).toFixed(0)}% ·{' '}
                    {membership.explanation.distanceKm.toFixed(1)} km ·{' '}
                    {duration(membership.explanation.timeDeltaSeconds)} from linked event
                  </small>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="timeline-panel" aria-labelledby="timeline-title">
        <div className="timeline-heading">
          <div>
            <p className="panel-label">Chronological catalog</p>
            <h2 id="timeline-title">Event timeline</h2>
          </div>
          <button
            type="button"
            className="playback-button"
            onClick={() => explorerStore.togglePlayback()}
            disabled={timelineEvents.length === 0}
          >
            {explorerStore.isPlaying ? 'Pause animation' : 'Play animation'}
          </button>
        </div>

        {explorerStore.status === 'error' ? (
          <div className="empty-state">
            <strong>Catalog unavailable</strong>
            <span>Check that the API and PostgreSQL are running.</span>
          </div>
        ) : timelineEvents.length === 0 && explorerStore.status !== 'loading' ? (
          <div className="empty-state">
            <strong>No matching events</strong>
            <span>Try widening the selected time or magnitude range.</span>
          </div>
        ) : (
          <ol className="timeline">
            {timelineEvents.map((event) => (
              <li key={event.id}>
                <button
                  type="button"
                  className={
                    event.id === explorerStore.selectedEventId
                      ? 'event-row event-row--selected'
                      : 'event-row'
                  }
                  onClick={() => explorerStore.selectEvent(event.id)}
                >
                  <span className="event-magnitude">{magnitude(event)}</span>
                  <span>
                    <strong>{event.place ?? 'Unnamed event'}</strong>
                    <small>{formatTime(event.originTime)}</small>
                    {roleByEventId.has(event.id) && (
                      <small className="timeline-role">
                        {roleLabel(roleByEventId.get(event.id)!)}
                      </small>
                    )}
                  </span>
                  <span className="event-depth">{event.coordinates.depthKm.toFixed(1)} km</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
});
