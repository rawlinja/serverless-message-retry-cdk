import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { Logger } from '@aws-lambda-powertools/logger'
import { Temporal } from '@js-temporal/polyfill'
import { MessageRepository } from './message-repository'
import type { Message } from './types'

const logger = new Logger({ serviceName: 'message-service' })
const queueUrl = process.env.MESSAGES_QUEUE_URL
const sqsClient = new SQSClient({ region: 'us-east-1' })
const repository = new MessageRepository('Messages')

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

  private buildQueueMessage(message: Message): Message {
    return {
      ...message,
      createdAt: Temporal.Now.instant().toString({ smallestUnit: 'millisecond' }),
    }
  }
}

export { MessageService }
