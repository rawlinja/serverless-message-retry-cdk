import { SQSEvent } from 'aws-lambda'
import { MessageService, Message } from '../../lib/message-service'

const service = new MessageService()

const handler = async (event: SQSEvent) => {
  try {
    const messages = event.Records.map((record) => {
      const message = JSON.parse(record.body)
      return message
    })

    for (const message of messages) {
      const createdAt = new Date().toISOString()
      await service.storeMessage({...message, createdAt})
      console.log('message has been stored to database 👉', message)
    }
  } catch (error) {
    console.log(error)
  }
}

export { handler }
