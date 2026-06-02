import { Stack, StackProps, Duration } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { ApiStack } from './api-stack'
import { MessagingStack } from './messaging-stack'
import { PersistenceStack } from './persistence-stack'
import { SchedulerStack } from './scheduler-stack'
import { ExponentialBackoffStack } from './exponential-backoff-stack'
import { RelayStack } from './relay-stack'

export const LAMBDA_SQS_PATH = '../../lambda/sqs/index.ts'
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
      tableArn,
      resources: [
        {
          rootName: 'MessagesApi',
          name: 'messages',
          routes: [
            {
              method: 'POST',
              handler: 'index.messagesPost',
            },
            {
              method: 'GET',
              handler: 'index.messagesGet',
            },
          ],
        },
        {
          rootName: 'RetryApi',
          name: 'retry',
          routes: [
            {
              method: 'POST',
              handler: 'index.retryPost',
            },
            {
              method: 'GET',
              handler: 'index.retryGet',
            },
          ],
        },
      ],
    })

    new SchedulerStack(scope, 'SchedulerStack', {
      handler: 'index.scheduler',
      duration: Duration.hours(1),
      tableArn,
    })

    new ExponentialBackoffStack(scope, 'ExponentialBackoffStack', {
      handler: 'index.delete',
      tableArn,
      tableStreamArn,
      queueArn,
    })

    new RelayStack(scope, 'RelayStack', {
      handler: 'index.relay',
      tableArn,
      tableStreamArn,
    })
  }
}
