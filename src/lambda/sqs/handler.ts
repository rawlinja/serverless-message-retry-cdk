import { SQSEvent } from 'aws-lambda'
import { Logger } from '@aws-lambda-powertools/logger'
import { MessageService } from '@lib/message-service'
import type { Message } from '@lib/types'

const logger = new Logger({ serviceName: 'sqs-handler' })
const service = new MessageService()

const handler = async (event: SQSEvent) => {
  const messages: Message[] = []

  for (const record of event.Records) {
    logger.info('Processing record', { messageId: record.messageId })

    if (!record.body) {
      logger.error('Record body is empty, skipping', { messageId: record.messageId })
      continue
    }

    try {
      const parsed = JSON.parse(record.body) as Message
      messages.push(parsed)
    } catch {
      logger.error('Record body is not valid JSON, skipping', { body: record.body })
    }
  }

  for (const message of messages) {
    // Preserve createdAt for retry messages; set fresh for new messages
    const createdAt = message.createdAt ?? new Date().toISOString()
    const messageWithTimestamp: Message = { ...message, createdAt }

    try {
      await service.storeMessage(messageWithTimestamp)
      logger.info('Message stored', { email: message.email })
    } catch (error) {
      logger.error('Failed to store message, recording for retry', {
        email: message.email,
        error,
      })
      const retryCount = message.retryCount ?? 0
      await service.failMessage(messageWithTimestamp, retryCount)
    }
  }
}

export { handler }
