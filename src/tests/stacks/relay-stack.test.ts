import * as cdk from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { RelayStack } from '@stacks/relay-stack'

describe('RelayStack', () => {
  const app = new cdk.App()
  const stack = new RelayStack(app, 'TestRelayStack', {
    handler: 'index.relay',
    tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/Messages',
    tableStreamArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/Messages/stream/2024-01-01',
  })
  const template = Template.fromStack(stack)

  it('creates a Lambda function', () => {
    template.resourceCountIs('AWS::Lambda::Function', 1)
  })

  it('creates an event source mapping for the DynamoDB stream', () => {
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      StartingPosition: 'TRIM_HORIZON',
      BatchSize: 5,
    })
  })
})
