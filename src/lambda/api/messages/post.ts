import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { Logger } from '@aws-lambda-powertools/logger'
import middy from '/opt/nodejs/node_modules/@middy/core'
import jsonBodyParser from '/opt/nodejs/node_modules/@middy/http-json-body-parser'
import { MessageService } from '../../../lib/message-service'
import { returnSuccess, returnError } from '../../../lib/api-utils'

const logger = new Logger({ serviceName: 'api-messages-post' })

const post = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const service = new MessageService()

  try {
    logger.info('Processing POST /messages request', { body: event.body })
    await service.queueMessage(event.body || '{}')
    return returnSuccess(`Message sent ${JSON.stringify(event.body)}`)
  } catch (error) {
    logger.error('Error sending message', { error, body: event.body })
    return returnError(`Message not sent ${JSON.stringify(event.body)}`)
  }
}

const handler = middy().use(jsonBodyParser()).handler(post as any)
export { handler }
