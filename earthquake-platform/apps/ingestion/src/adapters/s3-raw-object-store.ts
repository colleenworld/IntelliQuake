import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import type { RawObjectStore, StoredRawObject } from '../ports';

export class S3RawObjectStore implements RawObjectStore {
  constructor(
    private readonly bucket: string,
    private readonly client = new S3Client({}),
  ) {}

  async put(input: {
    key: string;
    body: string;
    checksum: string;
    capturedAt: string;
  }): Promise<StoredRawObject> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: 'application/geo+json',
          ChecksumSHA256: Buffer.from(input.checksum, 'hex').toString('base64'),
          IfNoneMatch: '*',
          Metadata: {
            capturedAt: input.capturedAt,
            sha256: input.checksum,
          },
        }),
      );
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      if (status !== 412) {
        throw error;
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
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!response.Body) {
      throw new Error(`S3 object has no body: ${key}`);
    }
    return response.Body.transformToString('utf8');
  }
}
