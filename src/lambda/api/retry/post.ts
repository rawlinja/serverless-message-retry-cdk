import { APIGatewayProxyResult } from 'aws-lambda'
import { Logger } from '@aws-lambda-powertools/logger'
import middy from '/opt/nodejs/node_modules/@middy/core'
import jsonBodyParser from '/opt/nodejs/node_modules/@middy/http-json-body-parser'
import { MessageService } from '@lib/message-service'
import { returnSuccess, returnError } from '@lib/api-utils'
import type { Message, APIGatewayProxyEventWithBody } from '@lib/types'

const logger = new Logger({ serviceName: 'api-retry-post' })

const post = async (
  event: APIGatewayProxyEventWithBody<Message>,
): Promise<APIGatewayProxyResult> => {
  const service = new MessageService()

  try {
    logger.info('Processing POST /retry request', { body: event.body })
    await service.seedRetryMessage(event.body)
    return returnSuccess(`Retry message seeded ${JSON.stringify(event.body)}`)
  } catch (error) {
    logger.error('Error seeding retry message', { error, body: event.body })
    return returnError(`Retry message not seeded ${JSON.stringify(event.body)}`)
  }
}

const handler = middy<APIGatewayProxyEventWithBody<Message>, APIGatewayProxyResult>()
  .use(jsonBodyParser())
  .handler(post)
export { handler, post }
