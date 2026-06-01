import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { returnError } from '@lib/api-utils'

const base = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  return returnError(`Not implemented ${JSON.stringify(event)}`)
}

export { base as handler }
