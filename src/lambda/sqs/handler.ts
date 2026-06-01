import { SQSEvent, SQSRecord } from 'aws-lambda'
import { Logger } from '@aws-lambda-powertools/logger'
import { MessageService } from '@lib/message-service'
import type { Message } from '@lib/types'

const logger = new Logger({ serviceName: 'sqs-handler' })
const service = new MessageService()

const processRecord = async (record: SQSRecord): Promise<void> => {
  logger.info('Processing record', { messageId: record.messageId })

  if (!record.body) {
    logger.error('Record body is empty, skipping', { messageId: record.messageId })
    return
  }

  let message: Message | null = null
  try {
    message = JSON.parse(record.body) as Message
  } catch {
    logger.error('Record body is not valid JSON, skipping', { body: record.body })
    return
  }

  await service.registerMessage(message)
  logger.info('Message registered', { email: message.email })
}

const handler = async (event: SQSEvent): Promise<void> => {
  await Promise.all(event.Records.map(processRecord))
}

export { handler }
