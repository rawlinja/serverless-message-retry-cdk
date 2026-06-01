import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { APIGatewayProxyEvent } from 'aws-lambda'
import { post as messagesPost } from '../../lambda/api/messages/post'
import { get as messagesGet } from '../../lambda/api/messages/get'
import { post as retryPost } from '../../lambda/api/retry/post'
import { get as retryGet } from '../../lambda/api/retry/get'
import type { APIGatewayProxyEventWithBody, Message } from '@lib/types'

const sqsMock = mockClient(SQSClient)
const ddbMock = mockClient(DynamoDBClient)

beforeEach(() => {
  sqsMock.reset()
  ddbMock.reset()
})

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
  it('returns 200 when retry message is seeded successfully', async () => {
    ddbMock.on(PutItemCommand).resolves({})

    const result = await retryPost(
      makePostEvent({
        email: 'retry@example.com',
        retryCount: 2,
        expirationAt: '2026-05-05T10:04:00.000Z',
      }),
    )

    expect(result.statusCode).toBe(200)

    const call = ddbMock.commandCalls(PutItemCommand)[0]
    const stored = unmarshall(call.args[0].input.Item!)
    expect(stored.email).toBe('retry@example.com')
    expect(stored.retryCount).toBe(2)
    expect(stored.expirationAt).toBe('2026-05-05T10:04:00.000Z')
    expect(stored.retryDate).toBe('2026-05-05')
  })

  it('returns 400 when DynamoDB write fails', async () => {
    ddbMock.on(PutItemCommand).rejects(new Error('DynamoDB unavailable'))

    const result = await retryPost(makePostEvent({ email: 'retry@example.com' }))

    expect(result.statusCode).toBe(400)
  })
})

describe('GET /messages', () => {
  it('returns 501 for the planned read endpoint', async () => {
    const result = await messagesGet(makeGetEvent())

    expect(result.statusCode).toBe(501)
    expect(result.body).toContain('read model pending')
  })
})

describe('GET /retry', () => {
  it('returns 501 for the planned retry history endpoint', async () => {
    const result = await retryGet(makeGetEvent())

    expect(result.statusCode).toBe(501)
    expect(result.body).toContain('retry history query pending')
  })
})
