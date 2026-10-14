import { useEffect, useRef, useState } from 'react';
import type { EventDetail, SeriesDetail } from '@earthquake/domain';

import { fetchEventDetail, fetchSeriesDetail, fetchSeriesPage } from './api';

interface EventDialogProps {
  eventId: string;
  onClose: () => void;
  onSelectSeries: (id: string) => void;
}

const formatTime = (value: string) => new Date(value).toLocaleString();

export function EventDialog({ eventId, onClose, onSelectSeries }: EventDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [series, setSeries] = useState<SeriesDetail[]>([]);
  const [eventError, setEventError] = useState<string | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const [seriesLoading, setSeriesLoading] = useState(true);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();

    return () => {
      element?.close();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    setEvent(null);
    setSeries([]);
    setEventError(null);
    setSeriesError(null);
    setSeriesLoading(true);

    void fetchEventDetail(eventId)
      .then((response) => {
        if (!cancelled) setEvent(response.event);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setEventError(error instanceof Error ? error.message : 'Unable to load event details');
        }
      });

    const loadMemberships = async () => {
      const details: SeriesDetail[] = [];
      let cursor: string | undefined;
      let classificationRunId: string | undefined;
      const seenCursors = new Set<string>();

      do {
        const page = await fetchSeriesPage({
          eventId,
          classificationRunId,
          cursor,
          limit: 100,
        });

        if (cancelled) return;

        classificationRunId = page.classificationRun?.id;

        const responses = await Promise.all(page.series.map((item) => fetchSeriesDetail(item.id)));

        if (cancelled) return;

        details.push(...responses.map((response) => response.series));
        cursor = page.nextCursor ?? undefined;

        if (cursor) {
          if (seenCursors.has(cursor)) {
            throw new Error('The series API returned a repeated pagination cursor');
          }
          seenCursors.add(cursor);
        }
      } while (cursor);

      setSeries(details);
    };

    void loadMemberships()
      .catch((error: unknown) => {
        if (!cancelled) {
          setSeriesError(
            error instanceof Error ? error.message : 'Unable to load series information',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setSeriesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  return (
    <dialog
      ref={dialog}
      className="event-dialog"
      aria-labelledby="event-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="event-dialog-header">
        <h2 id="event-dialog-title">Event details</h2>
        <button type="button" onClick={onClose} aria-label="Close event details">
          Close
        </button>
      </header>

      {eventError ? (
        <p role="alert">{eventError}</p>
      ) : !event ? (
        <p role="status">Loading event details…</p>
      ) : (
        <>
          <h3>{event.place ?? 'Unnamed earthquake event'}</h3>
          <dl className="event-dialog-facts">
            <dt>Magnitude</dt>
            <dd>
              {event.magnitude === null ? 'Unknown' : event.magnitude.toFixed(1)}
              {event.magnitudeType ? ` ${event.magnitudeType}` : ''}
            </dd>

            <dt>Origin</dt>
            <dd>{formatTime(event.originTime)}</dd>

            <dt>Depth</dt>
            <dd>{event.coordinates.depthKm.toFixed(1)} km</dd>

            <dt>Position</dt>
            <dd>
              {event.coordinates.latitude.toFixed(3)}, {event.coordinates.longitude.toFixed(3)}
            </dd>

            <dt>Status</dt>
            <dd>{event.status}</dd>

            <dt>Significance</dt>
            <dd>{event.significance}</dd>

            <dt>Felt reports</dt>
            <dd>{event.feltReports ?? 'Unknown'}</dd>

            <dt>Source</dt>
            <dd>{event.source.toUpperCase()}</dd>

            <dt>Source ID</dt>
            <dd>{event.sourceEventId}</dd>
          </dl>

          <a href={event.sourceUrl} target="_blank" rel="noreferrer">
            Open source record
          </a>
        </>
      )}

      <section aria-labelledby="event-dialog-series-title">
        <h3 id="event-dialog-series-title">Candidate series</h3>

        {seriesLoading ? (
          <p role="status">Loading series information…</p>
        ) : seriesError ? (
          <p role="alert">{seriesError}</p>
        ) : series.length === 0 ? (
          <p>No membership was found in the latest successful classification run.</p>
        ) : (
          series.map((item) => {
            const membership = item.memberships.find((member) => member.event.id === eventId);

            return (
              <article key={item.id} className="event-dialog-series">
                <h4>{item.displayName}</h4>
                <p>
                  {item.eventCount} events · maximum magnitude{' '}
                  {item.maximumMagnitude?.toFixed(1) ?? 'unknown'}
                </p>
                <p>
                  {formatTime(item.startTime)} – {formatTime(item.endTime)}
                </p>

                {membership && (
                  <p>
                    Role: {membership.role.replaceAll('_', ' ')} · confidence{' '}
                    {(membership.confidence * 100).toFixed(0)}%
                  </p>
                )}

                <p>
                  Algorithm: {item.classificationRun.algorithm} v
                  {item.classificationRun.algorithmVersion}
                </p>

                <button type="button" onClick={() => onSelectSeries(item.id)}>
                  Show series on map
                </button>
              </article>
            );
          })
        )}

        <p>Series are inferred candidate groupings, not confirmed seismic sequences.</p>
      </section>
    </dialog>
  );
}
