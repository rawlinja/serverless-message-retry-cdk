import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import middy from '/opt/nodejs/node_modules/@middy/core'
import jsonBodyParser from '/opt/nodejs/node_modules/@middy/http-json-body-parser'
import { MessageService } from '../../../lib/message-service'
import { returnSuccess, returnError } from '../../../lib/api-utils'

/**
 * Handles POST requests to send messages.
 * Expects the message body to be a valid JSON string.
 *
 * @param event - The API Gateway event containing the request data.
 * @returns A response object with status and body.
 */
const post = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const service = new MessageService()

  try {
    console.log('Event body:', event.body)
    await service.queueMessage(event.body || '{}')
    return returnSuccess(`Message sent ${JSON.stringify(event.body)}`)
  } catch (error) {
    console.error('Error sending message:', error)
    return returnError(`Message not sent ${JSON.stringify(event.body)}`)
  }
}

const handler = middy().use(jsonBodyParser()).handler(post as any)
export { handler }
