import { SQSEvent } from 'aws-lambda'
import { MessageService, Message } from '../../lib/message-service'

const service = new MessageService()

const handler = async (event: SQSEvent) => {
  try {
    const messages = event.Records.map((record) => {
      console.log('Processing record:', JSON.stringify(record, null, 2))
      if (!record.body) {
        console.error('Record body is empty:', record)
        throw new Error('Record body is empty')
      }
      if (!record.body.startsWith('{')) {
        console.error('Record body is not a valid JSON:', record.body)
        throw new Error('Record body is not a valid JSON')
      }
      console.log('Record body:', record.body)
      // Parse the record body to ensure it is a valid Message object
      try {
        JSON.parse(record.body)
      } catch (error) {
        console.error('Error parsing record body:', error)
        throw new Error('Record body is not a valid JSON')
      }
      return JSON.parse(record.body) as Message
    })

    for (const message of messages) {
      const createdAt = new Date().toISOString()
      await service.storeMessage({ ...message, createdAt })
      console.log('message has been stored to database 👉', message)
    }
  } catch (error) {
    console.log(error)
  }
}

export { handler }
