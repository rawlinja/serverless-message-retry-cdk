import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import middy from '/opt/nodejs/node_modules/@middy/core'
import jsonBodyParser from '/opt/nodejs/node_modules/@middy/http-json-body-parser'

// TODO: query DynamoDB by email (from authorizer context) and return paginated message history
const get = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  return {
    headers: { 'Content-Type': 'application/json' },
    body: `You've hit the GET endpoint ${JSON.stringify(event)}\n`,
    statusCode: 200,
  }
}

const handler = middy<APIGatewayProxyEvent, APIGatewayProxyResult>().use(jsonBodyParser()).handler(get)
export { handler, get }
