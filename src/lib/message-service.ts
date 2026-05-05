import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { Logger } from '@aws-lambda-powertools/logger'
import { MessageRepository } from './message-repository'
import type { Message } from './types'

const logger = new Logger({ serviceName: 'message-service' })
const queueUrl = process.env.MESSAGES_QUEUE_URL
const sqsClient = new SQSClient({ region: 'us-east-1' })
const repository = new MessageRepository('Messages')

const BASE_DELAY_MS = 60_000

class MessageService {
  async queueMessage(message: Message) {
    const payload = JSON.stringify(message)
    try {
      const input = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: payload,
      })
      logger.info('Sending message to SQS queue', { payload })
      await sqsClient.send(input)
    } catch (error) {
      logger.error('Error sending message to SQS queue', { error })
      throw error
    }
  }

  async storeMessage(message: Message) {
    if (!message.email || !message.createdAt) {
      logger.error('Missing required fields', { message })
      throw new Error('Missing required fields')
    }
    try {
      logger.info('Storing message to database', { message })
      await repository.create(message)
    } catch (error) {
      logger.error('Error storing message to database', { error })
      throw error
    }
  }

  async failMessage(message: Message, retryCount: number) {
    const delayMs = Math.pow(2, retryCount) * BASE_DELAY_MS
    const expirationAt = new Date(Date.now() + delayMs).toISOString()
    const retryDate = expirationAt.split('T')[0]

    const failedMessage: Message = { ...message, retryCount, expirationAt, retryDate }

    logger.info('Storing failed message for retry', {
      email: message.email,
      retryCount,
      expirationAt,
    })
    try {
      await repository.create(failedMessage)
    } catch (error) {
      logger.error('Error storing failed message', { error })
      throw error
    }
  }

  async retryMessage(message: Message) {
    if (!message.email || !message.createdAt) {
      logger.error('Missing required fields', { message })
      throw new Error('Missing required fields')
    }
    try {
      logger.info('Retrying message storage to database', { message })
      await repository.create(message)
    } catch (error) {
      logger.error('Error retrying message storage to database', { error })
      throw error
    }
  }
}

export { MessageService }
