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

    await handler(
      makeEvent([makeRecord({ email: 'test@example.com', createdAt: FIXED_NOW.toISOString() })]),
    )

    const calls = ddbMock.commandCalls(PutItemCommand)
    expect(calls).toHaveLength(1)

    const stored = unmarshall(calls[0].args[0].input.Item!)
    expect(stored.email).toBe('test@example.com')
    expect(stored.retryCount).toBeUndefined()
    expect(stored.expirationAt).toBeUndefined()
  })

  it('skips invalid JSON records and processes valid ones', async () => {
    ddbMock.on(PutItemCommand).resolves({})

    const badRecord: SQSRecord = {
      ...makeRecord({ email: 'ok@example.com' }),
      body: 'not-valid-json',
    }

    await handler(
      makeEvent([
        badRecord,
        makeRecord({ email: 'ok@example.com', createdAt: FIXED_NOW.toISOString() }),
      ]),
    )

    const calls = ddbMock.commandCalls(PutItemCommand)
    expect(calls).toHaveLength(1)
    const stored = unmarshall(calls[0].args[0].input.Item!)
    expect(stored.email).toBe('ok@example.com')
  })

  it('throws when a record fails so SQS redelivers the batch', async () => {
    ddbMock.on(PutItemCommand).rejectsOnce(new Error('DynamoDB unavailable'))

    await expect(
      handler(
        makeEvent([makeRecord({ email: 'fail@example.com', createdAt: FIXED_NOW.toISOString() })]),
      ),
    ).rejects.toThrow('DynamoDB unavailable')
  })
})
