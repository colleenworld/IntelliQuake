import { createLocalProducer } from './local-runtime';

async function poll(): Promise<void> {
  const { producer, pool } = createLocalProducer();
  try {
    const result = await producer.poll();
    console.info(JSON.stringify(result));
  } finally {
    await pool.end();
  }
}

void poll();
