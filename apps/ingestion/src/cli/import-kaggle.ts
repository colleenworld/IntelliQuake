import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import path from 'node:path';

import { NormalizedEventSchema } from '@earthquake/domain';
import { parse } from 'csv-parse';
import { Pool } from 'pg';

import { LocalRawObjectStore } from '../adapters/local-raw-object-store';
import {
  PostgresEventRevisionRepository,
  PostgresIngestionRunRepository,
} from '../adapters/postgres-repositories';

const datasetUrl =
  'https://www.kaggle.com/datasets/alessandrolobello/the-ultimate-earthquake-dataset-from-1990-2023';

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function requiredArgument(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`--${name}=... is required`);
  return value;
}

function timestamp(value: string): number {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new Error(`Invalid date: ${value}`);
  return result;
}

function numeric(row: Record<string, string>, name: string): number {
  const value = row[name]?.trim();
  if (!value) throw new Error(`${name} is missing`);
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} is not numeric`);
  return result;
}

function checksum(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function fileChecksum(filename: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function main(): Promise<void> {
  const filename = path.resolve(requiredArgument('file'));
  const start = timestamp(requiredArgument('start'));
  const end = timestamp(requiredArgument('end'));
  const snapshotAt = new Date(timestamp(requiredArgument('snapshot-at'))).toISOString();
  const minimumMagnitude = Number(argument('minimum-magnitude') ?? '2.5');
  const limit = Number(argument('limit') ?? '5000');
  const dryRun = process.argv.includes('--dry-run');

  if (start >= end) throw new Error('--start must precede --end');
  if (!Number.isFinite(minimumMagnitude)) {
    throw new Error('--minimum-magnitude must be numeric');
  }
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error('--limit must be a positive integer');
  }

  const fileHash = await fileChecksum(filename);
  const runId = randomUUID();
  const capturedAt = new Date().toISOString();

  const pool = dryRun
    ? undefined
    : new Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 5000,
      });

  if (!dryRun && !process.env.DATABASE_URL) {
    await pool?.end();
    throw new Error('DATABASE_URL is required');
  }

  const runs = pool ? new PostgresIngestionRunRepository(pool) : undefined;
  const revisions = pool ? new PostgresEventRevisionRepository(pool) : undefined;
  const rawStore = new LocalRawObjectStore(
    process.env.RAW_OBJECT_DIRECTORY ?? '/workspace/.local/raw',
  );

  const counts = {
    scanned: 0,
    selected: 0,
    rejected: 0,
    created: 0,
    revised: 0,
    unchanged: 0,
  };

  let runStarted = false;
  let completed = false;
  let truncated = false;

  try {
    if (runs) {
      await runs.start({
        id: runId,
        source: 'kaggle',
        mode: 'backfill',
        requestedStart: new Date(start).toISOString(),
        requestedEnd: new Date(end).toISOString(),
        startedAt: capturedAt,
      });
      runStarted = true;

      const manifest = JSON.stringify({
        datasetUrl,
        filename: path.basename(filename),
        fileChecksum: fileHash,
        snapshotAt,
        capturedAt,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        minimumMagnitude,
        limit,
        sourceTimestampBasis: 'user-declared dataset snapshot time',
      });

      await rawStore.put({
        key: `kaggle/manifests/${runId}.json`,
        body: manifest,
        checksum: checksum(manifest),
        capturedAt,
      });
    }

    const parser = createReadStream(filename).pipe(
      parse({
        columns: true,
        bom: true,
        skip_empty_lines: true,
        trim: true,
      }),
    );

    for await (const input of parser) {
      const row = input as Record<string, string>;
      counts.scanned += 1;

      let event;
      let body: string;

      try {
        const time = numeric(row, 'time');
        const magnitude = numeric(row, 'magnitudo');

        if (time < start || time >= end || magnitude < minimumMagnitude) continue;

        if (counts.selected >= limit) {
          truncated = true;
          break;
        }

        const longitude = numeric(row, 'longitude');
        const latitude = numeric(row, 'latitude');
        const depthKm = numeric(row, 'depth');
        const tsunami = numeric(row, 'tsunami');

        if (tsunami !== 0 && tsunami !== 1) {
          throw new Error('tsunami must be 0 or 1');
        }

        const orderedRow = Object.fromEntries(
          Object.entries(row).sort(([left], [right]) => left.localeCompare(right)),
        );
        const sourceEventId = `row-${checksum(JSON.stringify(orderedRow))}`;

        event = NormalizedEventSchema.parse({
          source: 'kaggle',
          sourceEventId,
          sourceUpdatedAt: snapshotAt,
          sourceUrl: datasetUrl,
          originTime: new Date(time).toISOString(),
          coordinates: { longitude, latitude, depthKm },
          magnitude,
          magnitudeType: null,
          place: row.place || null,
          eventType: row.data_type,
          status: row.status,
          significance: numeric(row, 'significance'),
          feltReports: null,
          tsunami: tsunami === 1,
        });

        body = JSON.stringify({
          type: 'Feature',
          id: sourceEventId,
          geometry: {
            type: 'Point',
            coordinates: [longitude, latitude, depthKm],
          },
          properties: {
            originalRow: orderedRow,
            datasetUrl,
            snapshotAt,
            sourceTimestampBasis: 'dataset snapshot time; original revision time unknown',
          },
        });
      } catch (error) {
        counts.rejected += 1;
        if (counts.rejected <= 20) {
          console.error(
            JSON.stringify({
              record: counts.scanned,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        }
        continue;
      }

      counts.selected += 1;

      if (revisions) {
        const payloadChecksum = checksum(body);
        const rawObject = await rawStore.put({
          key: `kaggle/events/${event.sourceEventId}/${payloadChecksum}.geojson`,
          body,
          checksum: payloadChecksum,
          capturedAt,
        });

        const outcome = await revisions.recordRevision({
          event,
          rawObject,
          payloadChecksum,
          normalizerVersion: 'kaggle-csv-v1',
          ingestionRunId: runId,
          observedAt: capturedAt,
        });

        counts[outcome] += 1;
      }

      if (counts.selected % 1000 === 0) {
        console.info(JSON.stringify({ progress: counts }));
      }
    }

    if (runs) {
      await runs.complete({
        id: runId,
        status: counts.rejected > 0 ? 'partially_failed' : 'succeeded',
        counts: {
          fetched: counts.selected + counts.rejected,
          queued: counts.selected,
          failed: counts.rejected,
        },
        completedAt: new Date().toISOString(),
        errorSummary: counts.rejected > 0 ? `${counts.rejected} rows rejected` : undefined,
      });
    }
    completed = true;

    console.info(JSON.stringify({ runId, dryRun, fileHash, snapshotAt, truncated, counts }));
  } catch (error) {
    if (runs && runStarted && !completed) {
      await runs.complete({
        id: runId,
        status: 'failed',
        counts: {
          fetched: counts.selected + counts.rejected,
          queued: counts.created + counts.revised + counts.unchanged,
          failed: counts.rejected + 1,
        },
        completedAt: new Date().toISOString(),
        errorSummary: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  } finally {
    await pool?.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
