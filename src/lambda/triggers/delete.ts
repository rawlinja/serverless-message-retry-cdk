import { DynamoDBStreamEvent } from 'aws-lambda'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { AttributeValue } from '@aws-sdk/client-dynamodb'
import { Logger } from '@aws-lambda-powertools/logger'
import { FailedMessageService, MAX_RETRIES } from '@lib/failed-message-service'
import type { Message } from '@lib/types'

const logger = new Logger({ serviceName: 'dynamodb-delete-trigger' })
const service = new FailedMessageService()

const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  logger.info('Received DynamoDB stream event', { recordCount: event.Records.length })

  for (const record of event.Records) {
    if (record.eventName !== 'REMOVE') continue

    if (!record.dynamodb?.OldImage) {
      logger.warn('REMOVE event missing OldImage, skipping')
      continue
    }

    try {
      const message = unmarshall(
        record.dynamodb.OldImage as Record<string, AttributeValue>,
      ) as Message

      const retryCount = message.retryCount ?? 0

      if (retryCount >= MAX_RETRIES) {
        logger.warn('Message exceeded max retries, dead lettered', {
          email: message.email,
          retryCount,
          maxRetries: MAX_RETRIES,
        })
        continue
      }

      logger.info('Scheduling message for retry', { email: message.email, retryCount })

      await service.writeFailedMessage(message)
    } catch (error) {
      // Do not throw — would cause Lambda to retry the entire batch
      logger.error('Error processing REMOVE event, skipping record', { error })
    }
  }
}

export { handler }
