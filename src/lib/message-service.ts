import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { Logger } from '@aws-lambda-powertools/logger'
import { MessageRepository } from './message-repository'
import type { Message } from './types'

const logger = new Logger({ serviceName: 'message-service' })
const queueUrl = process.env.MESSAGES_QUEUE_URL
const sqsClient = new SQSClient({ region: 'us-east-1' })
const repository = new MessageRepository('Messages')

export const MAX_RETRIES = 5
const BASE_DELAY_MS = 3_600_000

class MessageService {
  async queueMessage(message: Message) {
    const payload = JSON.stringify(this.buildQueueMessage(message))
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

  async registerMessage(message: Message) {
    try {
      logger.info('Storing message to database', { message })
      await repository.create(message)
    } catch (error) {
      logger.error('Error storing message to database', { error })
      throw error
    }
  }

  async failMessage(message: Message, retryCount: number) {
    if (!message.email || !message.createdAt) {
      logger.error('Missing required fields', { message })
      throw new Error('Missing required fields')
    }
    const failedMessage = this.buildRetryMessage(message, retryCount, {
      createdAt: message.createdAt,
      preserveSchedule: false,
    })

    logger.info('Storing failed message for retry', {
      email: message.email,
      retryCount: failedMessage.retryCount,
      expirationAt: failedMessage.expirationAt,
    })
    try {
      await repository.create(failedMessage)
    } catch (error) {
      logger.error('Error storing failed message', { error })
      throw error
    }
  }

  async seedRetryMessage(message: Message) {
    if (!message.email) {
      logger.error('Missing required fields', { message })
      throw new Error('Missing required fields')
    }

    const retryMessage = this.buildRetryMessage(message, message.retryCount ?? 0, {
      createdAt: message.createdAt ?? new Date().toISOString(),
      preserveSchedule: true,
    })

    logger.info('Seeding retry message in database', {
      email: retryMessage.email,
      retryCount: retryMessage.retryCount,
      expirationAt: retryMessage.expirationAt,
      retryDate: retryMessage.retryDate,
    })

    try {
      await repository.create(retryMessage)
    } catch (error) {
      logger.error('Error seeding retry message', { error })
      throw error
    }
  }

  private buildQueueMessage(message: Message): Message {
    return {
      ...message,
      createdAt: new Date().toISOString(),
    }
  }

  private buildRetryMessage(
    message: Message,
    retryCount: number,
    options: {
      createdAt: string
      preserveSchedule: boolean
    },
  ): Message {
    const computedExpirationAt = new Date(
      Date.now() + Math.pow(2, retryCount) * BASE_DELAY_MS,
    ).toISOString()
    const expirationAt =
      options.preserveSchedule && message.expirationAt
        ? message.expirationAt
        : computedExpirationAt

    return {
      ...message,
      createdAt: options.createdAt,
      retryCount,
      expirationAt,
      retryDate:
        options.preserveSchedule && message.retryDate
          ? message.retryDate
          : expirationAt.split('T')[0],
    }
  }

}

export { MessageService }
