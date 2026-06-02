import { DynamoDBStreamEvent } from 'aws-lambda'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { AttributeValue } from '@aws-sdk/client-dynamodb'
import { Logger } from '@aws-lambda-powertools/logger'
import type { Message } from '@lib/types'

const logger = new Logger({ serviceName: 'relay-trigger' })

const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  logger.info('Received DynamoDB stream event', { recordCount: event.Records.length })

  for (const record of event.Records) {
    if (record.eventName !== 'INSERT') continue

    if (!record.dynamodb?.NewImage) {
      logger.warn('INSERT event missing NewImage, skipping')
      continue
    }

    try {
      const message = unmarshall(
        record.dynamodb.NewImage as Record<string, AttributeValue>,
      ) as Message

      logger.info('Relaying message to third-party service', {
        email: message.email,
        retryCount: message.retryCount,
      })

      // Third-party relay integration goes here

      logger.info('Message successfully relayed', { email: message.email })
    } catch (error) {
      // Do not throw — would cause Lambda to retry the entire batch
      logger.error('Failed to relay message', { error })
    }
  }
}

export { handler }
