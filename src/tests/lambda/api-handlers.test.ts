import { mockClient } from 'aws-sdk-client-mock'
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { APIGatewayProxyEvent } from 'aws-lambda'
import { post as messagesPost } from '../../lambda/api/messages/post'
import { get as messagesGet } from '../../lambda/api/messages/get'
import { post as retryPost } from '../../lambda/api/retry/post'
import { get as retryGet } from '../../lambda/api/retry/get'
import type { APIGatewayProxyEventWithBody, Message } from '@lib/types'

const sqsMock = mockClient(SQSClient)

beforeEach(() => sqsMock.reset())

const makePostEvent = (body: Message): APIGatewayProxyEventWithBody<Message> => ({
  body,
  headers: {},
  multiValueHeaders: {},
  httpMethod: 'POST',
  isBase64Encoded: false,
  path: '/',
  pathParameters: null,
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  stageVariables: null,
  requestContext: {} as APIGatewayProxyEvent['requestContext'],
  resource: '/',
})

const makeGetEvent = (): APIGatewayProxyEvent => ({
  body: null,
  headers: {},
  multiValueHeaders: {},
  httpMethod: 'GET',
  isBase64Encoded: false,
  path: '/',
  pathParameters: null,
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  stageVariables: null,
  requestContext: {} as APIGatewayProxyEvent['requestContext'],
  resource: '/',
})

describe('POST /messages', () => {
  it('returns 200 when message queued successfully', async () => {
    sqsMock.on(SendMessageCommand).resolves({})

    const result = await messagesPost(makePostEvent({ email: 'test@example.com' }))

    expect(result.statusCode).toBe(200)
  })

  it('returns 400 when SQS send fails', async () => {
    sqsMock.on(SendMessageCommand).rejects(new Error('SQS unavailable'))

    const result = await messagesPost(makePostEvent({ email: 'test@example.com' }))

    expect(result.statusCode).toBe(400)
  })

  it('includes the message email in the success response', async () => {
    sqsMock.on(SendMessageCommand).resolves({})

    const result = await messagesPost(makePostEvent({ email: 'sent@example.com' }))

    expect(result.body).toContain('sent@example.com')
  })
})

describe('POST /retry', () => {
  it('returns 200 when message queued successfully', async () => {
    sqsMock.on(SendMessageCommand).resolves({})

    const result = await retryPost(makePostEvent({ email: 'retry@example.com' }))

    expect(result.statusCode).toBe(200)
  })

  it('returns 400 when SQS send fails', async () => {
    sqsMock.on(SendMessageCommand).rejects(new Error('SQS unavailable'))

    const result = await retryPost(makePostEvent({ email: 'retry@example.com' }))

    expect(result.statusCode).toBe(400)
  })
})

describe('GET /messages', () => {
  it('returns 200', async () => {
    const result = await messagesGet(makeGetEvent())

    expect(result.statusCode).toBe(200)
  })
})

describe('GET /retry', () => {
  it('returns 200', async () => {
    const result = await retryGet(makeGetEvent())

    expect(result.statusCode).toBe(200)
  })
})
