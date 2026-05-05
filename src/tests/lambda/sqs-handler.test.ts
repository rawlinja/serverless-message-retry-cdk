import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { SQSClient } from '@aws-sdk/client-sqs'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { SQSEvent, SQSRecord } from 'aws-lambda'
import { handler } from '../../lambda/sqs/handler'

const ddbMock = mockClient(DynamoDBClient)
mockClient(SQSClient)

const FIXED_NOW = new Date('2026-05-05T12:00:00.000Z')

beforeEach(() => {
  ddbMock.reset()
  jest.useFakeTimers()
  jest.setSystemTime(FIXED_NOW)
})

afterEach(() => jest.useRealTimers())

const makeRecord = (body: object): SQSRecord =>
  ({
    messageId: 'test-id',
    receiptHandle: 'handle',
    body: JSON.stringify(body),
    attributes: {} as SQSRecord['attributes'],
    messageAttributes: {},
    md5OfBody: '',
    eventSource: 'aws:sqs',
    eventSourceARN: 'arn:aws:sqs:us-east-1:123456789:test-queue',
    awsRegion: 'us-east-1',
  }) as SQSRecord

const makeEvent = (records: SQSRecord[]): SQSEvent => ({ Records: records })

describe('sqs handler', () => {
  it('stores message without retry fields on success', async () => {
    ddbMock.on(PutItemCommand).resolves({})

    await handler(makeEvent([makeRecord({ email: 'test@example.com' })]))

    const calls = ddbMock.commandCalls(PutItemCommand)
    expect(calls).toHaveLength(1)

    const stored = unmarshall(calls[0].args[0].input.Item!)
    expect(stored.email).toBe('test@example.com')
    expect(stored.retryCount).toBeUndefined()
    expect(stored.expirationAt).toBeUndefined()
  })

  it('stores failed message with retry fields when storeMessage throws', async () => {
    ddbMock
      .on(PutItemCommand)
      .rejectsOnce(new Error('DynamoDB unavailable'))
      .resolves({})

    await handler(makeEvent([makeRecord({ email: 'fail@example.com' })]))

    const calls = ddbMock.commandCalls(PutItemCommand)
    expect(calls).toHaveLength(2)

    const failStored = unmarshall(calls[1].args[0].input.Item!)
    expect(failStored.email).toBe('fail@example.com')
    expect(failStored.retryCount).toBe(0)
    expect(failStored.expirationAt).toBeDefined()
    expect(failStored.retryDate).toBeDefined()
  })

  it('preserves retryCount from message when re-processing a retry', async () => {
    ddbMock
      .on(PutItemCommand)
      .rejectsOnce(new Error('DynamoDB unavailable'))
      .resolves({})

    const retryMessage = {
      email: 'retry@example.com',
      createdAt: '2026-05-05T10:00:00.000Z',
      retryCount: 2,
      expirationAt: '2026-05-05T10:04:00.000Z',
      retryDate: '2026-05-05',
    }

    await handler(makeEvent([makeRecord(retryMessage)]))

    const calls = ddbMock.commandCalls(PutItemCommand)
    const failStored = unmarshall(calls[1].args[0].input.Item!)

    expect(failStored.retryCount).toBe(2)
  })

  it('processes remaining messages after one fails', async () => {
    ddbMock
      .on(PutItemCommand)
      .rejectsOnce(new Error('DynamoDB unavailable'))
      .resolves({})

    await handler(
      makeEvent([
        makeRecord({ email: 'fail@example.com' }),
        makeRecord({ email: 'ok@example.com' }),
      ])
    )

    const calls = ddbMock.commandCalls(PutItemCommand)
    expect(calls).toHaveLength(3)
  })
})
