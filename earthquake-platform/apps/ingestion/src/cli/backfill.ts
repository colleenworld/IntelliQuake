import { createLocalProducer } from './local-runtime';

function readArgument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function readDate(name: string): Date {
  const value = readArgument(name);
  if (!value) {
    throw new Error(`--${name} is required`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`--${name} must be an ISO 8601 date or timestamp`);
  }
  return date;
}

async function backfill(): Promise<void> {
  const startTime = readDate('start');
  const endTime = readDate('end');
  const minimumMagnitude = Number(readArgument('minimum-magnitude') ?? '2.5');
  if (!Number.isFinite(minimumMagnitude)) {
    throw new Error('minimum-magnitude must be numeric');
  }

  const { producer, pool } = createLocalProducer();
  try {
    const result = await producer.backfill({
      startTime,
      endTime,
      minimumMagnitude,
      partitionDays: Number(readArgument('partition-days') ?? '1'),
    });
    console.info(JSON.stringify(result));
  } finally {
    await pool.end();
  }
}

void backfill();
