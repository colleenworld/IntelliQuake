#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';

import { PlatformFoundationStack } from '../lib/platform-foundation-stack';

const app = new cdk.App();

new PlatformFoundationStack(app, 'EarthquakePlatformFoundation', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-west-2',
  },
});
