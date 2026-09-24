import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';

import { PlatformFoundationStack } from '../lib/platform-foundation-stack';

describe('PlatformFoundationStack', () => {
  it('creates durable raw storage and ingestion queues', () => {
    const app = new cdk.App();
    const stack = new PlatformFoundationStack(app, 'TestStack');
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::S3::Bucket', 2);
    template.resourceCountIs('AWS::CloudFront::Distribution', 1);
    template.resourceCountIs('AWS::ECS::Service', 1);
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);

    template.resourceCountIs('AWS::SQS::Queue', 2);
    template.resourceCountIs('AWS::RDS::DBInstance', 1);
    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'rate(5 minutes)',
      State: 'ENABLED',
    });
    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'rate(15 minutes)',
      State: 'ENABLED',
    });
    template.hasResourceProperties('AWS::CloudFormation::CustomResource', {
      schemaVersion: '002',
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs24.x',
    });
    expect(template.toJSON()).toBeDefined();
  }, 30_000);
});
