import { APIGatewayProxyEvent } from 'aws-lambda'

type Message = {
  firstName?: string
  lastName?: string
  email: string
  phone?: string
  createdAt?: string
  data?: string
  retryCount?: number
  expirationAt?: string
  retryDate?: string
}

type MessageRecord = Message & {
  pk: string
  sk: string
  id: string
}

type APIGatewayProxyEventWithBody<T> = Omit<APIGatewayProxyEvent, 'body'> & {
  body: T
}

export type { Message, MessageRecord, APIGatewayProxyEventWithBody }
