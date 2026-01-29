import { SQSEvent } from 'aws-lambda'
import { Logger } from '@aws-lambda-powertools/logger'
import { MessageService, Message } from '../../lib/message-service'

const logger = new Logger({ serviceName: 'sqs-handler' })
const service = new MessageService()

const handler = async (event: SQSEvent) => {
  try {
    const messages = event.Records.map((record) => {
      logger.info('Processing record', { messageId: record.messageId })
      if (!record.body) {
        logger.error('Record body is empty', { record })
        throw new Error('Record body is empty')
      }
      if (!record.body.startsWith('{')) {
        logger.error('Record body is not a valid JSON', { body: record.body })
        throw new Error('Record body is not a valid JSON')
      }
      try {
        JSON.parse(record.body)
      } catch (error) {
        logger.error('Error parsing record body', { error, body: record.body })
        throw new Error('Record body is not a valid JSON')
      }
      return JSON.parse(record.body) as Message
    })

    for (const message of messages) {
      const createdAt = new Date().toISOString()
      await service.storeMessage({ ...message, createdAt })
      logger.info('Message stored to database', { email: message.email })
    }
  } catch (error) {
    logger.error('Error processing SQS event', { error })
  }
}

export { handler }
