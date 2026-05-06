import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { StatusCodes } from 'http-status-codes'
import middy from '/opt/nodejs/node_modules/@middy/core'
import jsonBodyParser from '/opt/nodejs/node_modules/@middy/http-json-body-parser'

// TODO: query DynamoDB by email (from authorizer context) and return paginated message history
const get = async (
  _event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Not implemented: read model pending' }),
    statusCode: StatusCodes.NOT_IMPLEMENTED,
  }
}

const handler = middy<APIGatewayProxyEvent, APIGatewayProxyResult>().use(jsonBodyParser()).handler(get)
export { handler, get }
