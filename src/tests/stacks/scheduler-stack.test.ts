import * as cdk from 'aws-cdk-lib'
import { Template, Match } from 'aws-cdk-lib/assertions'
import { SchedulerStack } from '@stacks/scheduler-stack'

describe('SchedulerStack', () => {
  const app = new cdk.App()
  const stack = new SchedulerStack(app, 'TestSchedulerStack', {
    handler: 'index.scheduler',
    duration: cdk.Duration.hours(1),
    tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/Messages',
  })
  const template = Template.fromStack(stack)

  it('creates a Lambda function with LOOKBACK_DAYS=2', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: { LOOKBACK_DAYS: '2' },
      },
    })
  })

  it('creates an EventBridge rule', () => {
    template.resourceCountIs('AWS::Events::Rule', 1)
  })

  it('grants Lambda dynamodb:Query on GSI', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          {
            Action: 'dynamodb:Query',
            Effect: 'Allow',
            Resource: 'arn:aws:dynamodb:us-east-1:123456789012:table/Messages/index/*',
          },
        ]),
      },
    })
  })

  it('grants Lambda dynamodb:DeleteItem on table', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          {
            Action: 'dynamodb:DeleteItem',
            Effect: 'Allow',
            Resource: 'arn:aws:dynamodb:us-east-1:123456789012:table/Messages',
          },
        ]),
      },
    })
  })
})
