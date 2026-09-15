import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { RawObjectStore, StoredRawObject } from '../ports';

export class LocalRawObjectStore implements RawObjectStore {
  private readonly absoluteRoot: string;

  constructor(root: string) {
    this.absoluteRoot = path.resolve(root);
  }

  async put(input: {
    key: string;
    body: string;
    checksum: string;
    capturedAt: string;
  }): Promise<StoredRawObject> {
    const filename = this.resolveKey(input.key);
    await mkdir(path.dirname(filename), { recursive: true });
    try {
      await writeFile(filename, input.body, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existing = await readFile(filename, 'utf8');
      if (existing !== input.body) {
        throw new Error(`Attempted to overwrite immutable raw object ${input.key}`);
      }
    }
    return {
      key: input.key,
      checksum: input.checksum,
      byteLength: Buffer.byteLength(input.body, 'utf8'),
      contentType: 'application/geo+json',
      capturedAt: input.capturedAt,
    };
  }

  async get(key: string): Promise<string> {
    return readFile(this.resolveKey(key), 'utf8');
  }

  private resolveKey(key: string): string {
    const filename = path.resolve(this.absoluteRoot, key);
    if (!filename.startsWith(`${this.absoluteRoot}${path.sep}`)) {
      throw new Error('Raw object key escapes the configured storage root');
    }
    return filename;
  }
}
