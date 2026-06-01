import { SQSEvent } from 'aws-lambda'
import { Logger } from '@aws-lambda-powertools/logger'
import { MessageService } from '@lib/message-service'
import type { Message } from '@lib/types'

const logger = new Logger({ serviceName: 'sqs-handler' })
const service = new MessageService()

const handler = async (event: SQSEvent): Promise<void> => {
  await Promise.allSettled(
    event.Records.map(async (record) => {
      logger.info('Processing record', { messageId: record.messageId })

      if (!record.body) {
        logger.error('Record body is empty, skipping', { messageId: record.messageId })
        return
      }

      const message = await Promise.try(() => JSON.parse(record.body) as Message).catch(() => {
        logger.error('Record body is not valid JSON, skipping', { body: record.body })
        return null
      })

      if (message === null) return

      try {
        await service.storeMessage(message)
        logger.info('Message stored', { email: message.email })
      } catch (error) {
        logger.error('Failed to store message, recording for retry', { email: message.email, error })
        try {
          await service.failMessage(message, message.retryCount ?? 0)
        } catch (failError) {
          logger.error('Failed to record message for retry, message lost', { email: message.email, failError })
        }
      }
    })
  )
}

export { handler }
