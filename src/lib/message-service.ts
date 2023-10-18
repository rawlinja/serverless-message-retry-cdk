import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { MessageRepository } from './message-repository'
import { Message } from './types'

const queueUrl = process.env.MESSAGES_QUEUE_URL

const sqsClient = new SQSClient({ region: 'us-east-1' })
const repository = new MessageRepository('Messages')

class MessageService {
  async queueMessage(message: any) {
    const payload = JSON.stringify(message)
    try {
      const input = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: payload,
      })
      await sqsClient.send(input)
    } catch (error) {
      throw error
    }
  }

  async storeMessage(message: Message) {
    if (
      !message.firstName ||
      !message.lastName ||
      !message.email ||
      !message.createdAt
    ) {
      throw new Error('Missing required fields')
    }

    try {
      await repository.create(message)
    } catch (error) {
      throw error
    }
  }
}

export { MessageService, Message }