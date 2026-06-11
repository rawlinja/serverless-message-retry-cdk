import * as cdk from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { ExponentialBackoffStack } from '@stacks/exponential-backoff-stack'

describe('ExponentialBackoffStack', () => {
  const app = new cdk.App()
  const stack = new ExponentialBackoffStack(app, 'TestExponentialBackoffStack', {
    handler: 'index.delete',
    tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/Messages',
    tableStreamArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/Messages/stream/2024-01-01',
  })
  const template = Template.fromStack(stack)

  it('creates a Lambda function', () => {
    template.resourceCountIs('AWS::Lambda::Function', 1)
  })

  it('creates a DLQ', () => {
    template.hasResourceProperties('AWS::SQS::Queue', {
      QueueName: 'delete-trigger-dlq',
    })
  })

  it('creates an event source mapping with retries and DLQ', () => {
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      StartingPosition: 'TRIM_HORIZON',
      BatchSize: 5,
      MaximumRetryAttempts: 3,
      DestinationConfig: {
        OnFailure: {
          Destination: {
            'Fn::GetAtt': ['DeleteTriggerDlqFE05C4C8', 'Arn'],
          },
        },
      },
    })
  })
})
