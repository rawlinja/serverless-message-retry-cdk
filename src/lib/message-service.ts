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
      console.log('Sending message to SQS queue:', payload)
      await sqsClient.send(input)
    } catch (error) {
      console.log('Error sending message to SQS queue:', error)
      throw error
    }
  }

  async storeMessage(message: Message) {
    if (
      !message.email ||
      !message.createdAt
    ) {
      console.error('Missing required fields:', message)
      throw new Error('Missing required fields')
    }

    try {
      console.log('Storing message to database:', message)
      await repository.create(message)
    } catch (error) {
      console.error('Error storing message to database:', error)
      throw error
    }
  }

  async retryMessage(message: Message) {
    if (
      !message.email ||
      !message.createdAt
    ) {
      console.error('Missing required fields:', message)
      throw new Error('Missing required fields')
    }

    try {
      console.log('Retrying message storage to database:', message)
      await repository.create(message)
    } catch (error) {
      console.error('Error retrying message storage to database:', error)
      console.log(error)
      throw error
    }
  }
}

export { MessageService, Message }
