import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

export class PlatformFoundationStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const deadLetterQueue = new Queue(this, 'IngestionDeadLetterQueue', {
      encryption: QueueEncryption.SQS_MANAGED,
      retentionPeriod: Duration.days(14),
    });

    new Queue(this, 'IngestionQueue', {
      deadLetterQueue: { queue: deadLetterQueue, maxReceiveCount: 5 },
      encryption: QueueEncryption.SQS_MANAGED,
      visibilityTimeout: Duration.seconds(60),
    });

    new Bucket(this, 'RawCatalogBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      versioned: true,
    });
  }
}
