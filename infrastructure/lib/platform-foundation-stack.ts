import path from 'node:path';

import { CustomResource, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { InstanceClass, InstanceSize, InstanceType, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Architecture, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import {
  Credentials,
  DatabaseInstance,
  DatabaseInstanceEngine,
  PostgresEngineVersion,
} from 'aws-cdk-lib/aws-rds';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import type { Construct } from 'constructs';

export class PlatformFoundationStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const projectRoot = path.resolve(process.cwd(), '..');
    const ingestionEntry = (filename: string) =>
      path.join(projectRoot, 'apps', 'ingestion', 'src', 'handlers', filename);
    const commonFunctionProps = {
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      tracing: Tracing.ACTIVE,
      timeout: Duration.seconds(60),
      memorySize: 512,
      projectRoot,
      depsLockFilePath: path.join(projectRoot, 'pnpm-lock.yaml'),
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: [],
      },
    };
    const createLogGroup = (id: string) =>
      new LogGroup(this, id, {
        retention: RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.DESTROY,
      });

    const vpc = new Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: 'public', subnetType: SubnetType.PUBLIC },
        { name: 'application', subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      ],
    });

    const database = new DatabaseInstance(this, 'CatalogDatabase', {
      vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      engine: DatabaseInstanceEngine.postgres({ version: PostgresEngineVersion.VER_16_4 }),
      credentials: Credentials.fromGeneratedSecret('earthquake_admin'),
      databaseName: 'earthquake',
      instanceType: InstanceType.of(InstanceClass.BURSTABLE4_GRAVITON, InstanceSize.MICRO),
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      multiAz: false,
      publiclyAccessible: false,
      backupRetention: Duration.days(7),
      deletionProtection: false,
      removalPolicy: RemovalPolicy.SNAPSHOT,
      storageEncrypted: true,
    });
    if (!database.secret) throw new Error('RDS database secret was not created');

    const deadLetterQueue = new Queue(this, 'IngestionDeadLetterQueue', {
      encryption: QueueEncryption.SQS_MANAGED,
      retentionPeriod: Duration.days(14),
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const ingestionQueue = new Queue(this, 'IngestionQueue', {
      deadLetterQueue: { queue: deadLetterQueue, maxReceiveCount: 5 },
      encryption: QueueEncryption.SQS_MANAGED,
      visibilityTimeout: Duration.seconds(60),
    });

    const rawCatalogBucket = new Bucket(this, 'RawCatalogBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      versioned: true,
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(90) }],
    });

    const functionEnvironment = {
      DATABASE_SECRET_ARN: database.secret.secretArn,
      DATABASE_SSL: 'true',
      RAW_BUCKET: rawCatalogBucket.bucketName,
      INGESTION_QUEUE_URL: ingestionQueue.queueUrl,
    };

    const migrationFunction = new NodejsFunction(this, 'DatabaseMigrationFunction', {
      ...commonFunctionProps,
      entry: ingestionEntry('migrate.ts'),
      handler: 'handler',
      logGroup: createLogGroup('DatabaseMigrationLogGroup'),
      vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      environment: functionEnvironment,
      timeout: Duration.minutes(2),
      bundling: {
        ...commonFunctionProps.bundling,
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (_inputDirectory, outputDirectory) => [
            `cp "${path.join(projectRoot, 'database', 'migrations', '001_ingestion_schema.sql')}" "${outputDirectory}/001_ingestion_schema.sql"`,
            `cp "${path.join(projectRoot, 'database', 'migrations', '002_candidate_series.sql')}" "${outputDirectory}/002_candidate_series.sql"`,
          ],
        },
      },
    });
    database.secret.grantRead(migrationFunction);
    database.connections.allowDefaultPortFrom(migrationFunction);
    const migrationProvider = new Provider(this, 'DatabaseMigrationProvider', {
      onEventHandler: migrationFunction,
      logGroup: createLogGroup('DatabaseMigrationProviderLogGroup'),
    });
    const migration = new CustomResource(this, 'DatabaseMigration', {
      serviceToken: migrationProvider.serviceToken,
      properties: { schemaVersion: '002' },
    });
    migration.node.addDependency(database);

    const pollFunction = new NodejsFunction(this, 'UsgsPollFunction', {
      ...commonFunctionProps,
      entry: ingestionEntry('poll.ts'),
      handler: 'handler',
      logGroup: createLogGroup('UsgsPollLogGroup'),
      vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      environment: functionEnvironment,
    });
    rawCatalogBucket.grantPut(pollFunction);
    ingestionQueue.grantSendMessages(pollFunction);
    database.secret.grantRead(pollFunction);
    database.connections.allowDefaultPortFrom(pollFunction);

    const processorFunction = new NodejsFunction(this, 'EventProcessorFunction', {
      ...commonFunctionProps,
      entry: ingestionEntry('process.ts'),
      handler: 'handler',
      logGroup: createLogGroup('EventProcessorLogGroup'),
      vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      environment: functionEnvironment,
    });
    rawCatalogBucket.grantRead(processorFunction);
    database.secret.grantRead(processorFunction);
    database.connections.allowDefaultPortFrom(processorFunction);
    processorFunction.addEventSource(
      new SqsEventSource(ingestionQueue, {
        batchSize: 5,
        maxBatchingWindow: Duration.seconds(5),
        reportBatchItemFailures: true,
      }),
    );

    const classifyFunction = new NodejsFunction(this, 'CandidateSeriesFunction', {
      ...commonFunctionProps,
      entry: ingestionEntry('classify.ts'),
      handler: 'handler',
      logGroup: createLogGroup('CandidateSeriesLogGroup'),
      vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      environment: {
        ...functionEnvironment,
        CLASSIFICATION_ANALYSIS_HOURS: '168',
        SERIES_BASE_TIME_WINDOW_HOURS: '24',
        SERIES_BASE_DISTANCE_KM: '60',
        SERIES_MAGNITUDE_REFERENCE: '4',
        SERIES_MAGNITUDE_WINDOW_SCALE: '0.5',
        SERIES_TIME_WEIGHT: '0.4',
        SERIES_DISTANCE_WEIGHT: '0.4',
        SERIES_MAGNITUDE_WEIGHT: '0.2',
        SERIES_MINIMUM_EDGE_SCORE: '0.45',
        SERIES_MINIMUM_SIZE: '2',
      },
      timeout: Duration.minutes(5),
      memorySize: 1_024,
    });
    database.secret.grantRead(classifyFunction);
    database.connections.allowDefaultPortFrom(classifyFunction);

    const pollSchedule = new Rule(this, 'UsgsPollSchedule', {
      schedule: Schedule.rate(Duration.minutes(5)),
      targets: [new LambdaFunction(pollFunction, { retryAttempts: 2 })],
    });
    pollSchedule.node.addDependency(migration);

    const classificationSchedule = new Rule(this, 'CandidateSeriesSchedule', {
      schedule: Schedule.rate(Duration.minutes(15)),
      targets: [new LambdaFunction(classifyFunction, { retryAttempts: 1 })],
    });
    classificationSchedule.node.addDependency(migration);
  }
}
