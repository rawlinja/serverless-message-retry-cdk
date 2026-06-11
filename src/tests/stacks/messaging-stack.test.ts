import * as cdk from 'aws-cdk-lib'
import { Template, Match } from 'aws-cdk-lib/assertions'
import { MessagingStack } from '@stacks/messaging-stack'

describe('MessagingStack', () => {
  const app = new cdk.App()
  const stack = new MessagingStack(app, 'TestMessagingStack', {
    handler: 'index.store',
    tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/Messages',
  })
  const template = Template.fromStack(stack)

  it('creates an SQS queue', () => {
    template.resourceCountIs('AWS::SQS::Queue', 1)
  })

  it('creates an SSM parameter for the queue URL', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/prod/messages/queue-url',
      Type: 'String',
    })
  })

  it('creates a Lambda function', () => {
    template.resourceCountIs('AWS::Lambda::Function', 1)
  })

  it('creates an SQS event source mapping with batchSize 5', () => {
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      BatchSize: 5,
    })
  })

  it('grants Lambda DynamoDB PutItem permission', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          {
            Action: 'dynamodb:PutItem',
            Effect: 'Allow',
            Resource: 'arn:aws:dynamodb:us-east-1:123456789012:table/Messages',
          },
        ]),
      },
    })
  })
})
