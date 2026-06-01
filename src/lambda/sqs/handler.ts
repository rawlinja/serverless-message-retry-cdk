import { SQSEvent, SQSRecord } from 'aws-lambda'
import { Logger } from '@aws-lambda-powertools/logger'
import { MessageService } from '@lib/message-service'
import type { Message } from '@lib/types'

const logger = new Logger({ serviceName: 'sqs-handler' })
const service = new MessageService()

const processRecord = async (record: SQSRecord): Promise<void> => {
  logger.info('Received SQS record', { messageId: record.messageId })

  if (!record.body) {
    logger.error('Record body is empty, skipping', { messageId: record.messageId })
    return
  }

  let message: Message | null = null
  try {
    message = JSON.parse(record.body) as Message
  } catch {
    // drop unrecoverable records rather than retrying
    // until we have a dead letter queue and can analyze failures
    logger.error('Record body is not valid JSON, skipping', { rawBody: record.body })
    return
  }

  try {
    // persist to DynamoDB after async SQS delivery
    await service.registerMessage(message)
    logger.info('Message persisted to DynamoDB', { email: message.email })
  } catch (error) {
    logger.error('Failed to persist message, SQS will retry', { email: message.email, error })
    throw error
  }
}

const handler = async (event: SQSEvent): Promise<void> => {
  await Promise.all(event.Records.map(processRecord))
}

export { handler }
