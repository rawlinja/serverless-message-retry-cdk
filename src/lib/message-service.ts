import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { Logger } from '@aws-lambda-powertools/logger'
import { Temporal } from '@js-temporal/polyfill'
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
    const input = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: payload,
    })
    logger.info('Queuing message', { email: message.email })
    await sqsClient.send(input)
    logger.info('Message successfully queued', { email: message.email })
  }

  async registerMessage(message: Message) {
    await repository.create(message)
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
    await repository.create(failedMessage)
  }

  async seedRetryMessage(message: Message) {
    if (!message.email) {
      logger.error('Missing required fields', { message })
      throw new Error('Missing required fields')
    }

    const retryMessage = this.buildRetryMessage(message, message.retryCount ?? 0, {
      createdAt: message.createdAt ?? Temporal.Now.instant().toString({ smallestUnit: 'millisecond' }),
      preserveSchedule: true,
    })

    logger.info('Seeding retry message in database', {
      email: retryMessage.email,
      retryCount: retryMessage.retryCount,
      expirationAt: retryMessage.expirationAt,
      retryDate: retryMessage.retryDate,
    })

    await repository.create(retryMessage)
  }

  private buildQueueMessage(message: Message): Message {
    return {
      ...message,
      createdAt: Temporal.Now.instant().toString({ smallestUnit: 'millisecond' }),
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
    const computedExpirationAt = Temporal.Now.instant()
      .add({ milliseconds: Math.pow(2, retryCount) * BASE_DELAY_MS })
      .toString({ smallestUnit: 'millisecond' })
    const expirationAt =
      options.preserveSchedule && message.expirationAt ? message.expirationAt : computedExpirationAt

    return {
      ...message,
      createdAt: options.createdAt,
      retryCount,
      expirationAt,
      retryDate:
        options.preserveSchedule && message.retryDate
          ? message.retryDate
          : Temporal.Instant.from(expirationAt).toZonedDateTimeISO('UTC').toPlainDate().toString(),
    }
  }
}

export { MessageService }
