import { Stack, StackProps, Duration } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { ApiStack } from './api-stack'
import { MessagingStack } from './messaging-stack'
import { PersistenceStack } from './persistence-stack'
import { SchedulerStack } from './scheduler-stack'
import { ExponentialBackoffStack } from './exponential-backoff-stack'

export const LAMBDA_SQS_PATH = '../lambda/sqs/index.ts'
export const MESSAGES_QUEUE_URL_PARAMETER_NAME = '/prod/messages/queue-url'

export const lambdaFunctionIdentifier = (name: string): string => {
  return `${name}-lambda-function`
}

export class BaseStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const persistenceStack = new PersistenceStack(scope, 'PersistenceStack')
    const { tableArn, tableStreamArn } = persistenceStack.exports

    const messagingStack = new MessagingStack(scope, 'MessagingStack', {
      handler: 'index.store',
      tableArn,
    })
    const { queueArn, queueUrlParameterArn } = messagingStack.exports
    
    new ApiStack(scope, 'ApiStack', {
      queue: {
        queueArn,
        queueUrlParameterArn,
      },
      resources: [
        {
          name: 'messages',
          routes: [
            {
              method: 'POST',
              handler: 'index.post'
            },
            {
              method: 'GET',
              handler: 'index.get'
            },
          ],
        },
      ],
    })

    new SchedulerStack(scope, 'SchedulerStack', { handler: 'index.scheduler', duration: Duration.days(12) })

    new ExponentialBackoffStack(scope, 'ExponentialBackoffStack', {
      handler: 'index.delete',
      tableArn,
      tableStreamArn
    })
  }
}
