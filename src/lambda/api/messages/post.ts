import { APIGatewayProxyResult } from 'aws-lambda'
import { Logger } from '@aws-lambda-powertools/logger'
import middy from '/opt/nodejs/node_modules/@middy/core'
import jsonBodyParser from '/opt/nodejs/node_modules/@middy/http-json-body-parser'
import { MessageService } from '@lib/message-service'
import { returnSuccess, returnServerError } from '@lib/api-utils'
import type { Message, APIGatewayProxyEventWithBody } from '@lib/types'

const logger = new Logger({ serviceName: 'api-messages-post' })
const service = new MessageService()

const post = async (
  event: APIGatewayProxyEventWithBody<Message>,
): Promise<APIGatewayProxyResult> => {
  try {
    logger.info('Received message submission', { message: event.body })
    await service.queueMessage(event.body)
    return returnSuccess('Message queued')
  } catch (error) {
    logger.error('Failed to submit message to queue', { error, message: event.body })
    return returnServerError('Failed to queue message')
  }
}

const handler = middy<APIGatewayProxyEventWithBody<Message>, APIGatewayProxyResult>()
  .use(jsonBodyParser())
  .handler(post)
export { handler, post }