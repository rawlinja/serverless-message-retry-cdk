import { APIGatewayProxyResult } from 'aws-lambda'
import middy from '/opt/nodejs/node_modules/@middy/core'
import jsonBodyParser from '/opt/nodejs/node_modules/@middy/http-json-body-parser'
import { MessageService } from '@lib/message-service'
import { returnSuccess, returnError } from '@lib/api-utils'
import type { Message, APIGatewayProxyEventWithBody } from '@lib/types'

const post = async (
  event: APIGatewayProxyEventWithBody<Message>,
): Promise<APIGatewayProxyResult> => {
  const service = new MessageService()

  try {
    await service.queueMessage(event.body)
    return returnSuccess(`Message sent ${JSON.stringify(event.body)}`)
  } catch (error) {
    return returnError(`Message not sent ${JSON.stringify(event.body)}`)
  }
}

const handler = middy<APIGatewayProxyEventWithBody<Message>, APIGatewayProxyResult>()
  .use(jsonBodyParser())
  .handler(post)
export { handler }
