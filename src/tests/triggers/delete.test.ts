import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { unmarshall, marshall } from '@aws-sdk/util-dynamodb'
import { DynamoDBStreamEvent } from 'aws-lambda'
import { handler } from '../../lambda/triggers/delete'

const ddbMock = mockClient(DynamoDBClient)
const FIXED_NOW = new Date('2026-06-10T12:00:00.000Z')

beforeEach(() => {
  ddbMock.reset()
  jest.useFakeTimers()
  jest.setSystemTime(FIXED_NOW)
})

afterEach(() => jest.useRealTimers())

const makeRemoveRecord = (oldImage: object) => ({
  eventName: 'REMOVE' as const,
  dynamodb: { OldImage: marshall(oldImage) },
  eventSource: 'aws:dynamodb',
  eventVersion: '1.1',
  eventID: 'test-id',
  eventSourceARN: 'arn:aws:dynamodb:us-east-1:test:table/Messages/stream/2026',
  awsRegion: 'us-east-1',
})

const makeEvent = (records: object[]): DynamoDBStreamEvent => ({
  Records: records as DynamoDBStreamEvent['Records'],
})

describe('delete trigger', () => {
  it('writes retry record to DynamoDB with incremented retryCount and backoff', async () => {
    ddbMock.on(PutItemCommand).resolves({})

    await handler(makeEvent([makeRemoveRecord({
      pk: 'EMAIL::test@example.com',
      sk: 'CREATEDAT::2026-06-10T10:00:00.000Z',
      email: 'test@example.com',
      createdAt: '2026-06-10T10:00:00.000Z',
      retryCount: 0,
    })]))

    const calls = ddbMock.commandCalls(PutItemCommand)
    expect(calls).toHaveLength(1)

    const stored = unmarshall(calls[0].args[0].input.Item!)
    expect(stored.retryCount).toBe(1)
    expect(stored.expirationAt).toBe('2026-06-10T13:00:00.000Z')
    expect(stored.retryDate).toBe('2026-06-10')
    expect(stored.email).toBe('test@example.com')
  })

  it('doubles the backoff interval on each retry', async () => {
    ddbMock.on(PutItemCommand).resolves({})

    await handler(makeEvent([makeRemoveRecord({
      pk: 'EMAIL::test@example.com',
      sk: 'CREATEDAT::2026-06-10T10:00:00.000Z',
      email: 'test@example.com',
      createdAt: '2026-06-10T10:00:00.000Z',
      retryCount: 2,
    })]))

    const stored = unmarshall(ddbMock.commandCalls(PutItemCommand)[0].args[0].input.Item!)
    expect(stored.retryCount).toBe(3)
    expect(stored.expirationAt).toBe('2026-06-10T16:00:00.000Z') // now + 4h
  })

  it('does not write when retryCount reaches MAX_RETRIES (5)', async () => {
    await handler(makeEvent([makeRemoveRecord({
      pk: 'EMAIL::test@example.com',
      sk: 'CREATEDAT::2026-06-10T10:00:00.000Z',
      email: 'test@example.com',
      createdAt: '2026-06-10T10:00:00.000Z',
      retryCount: 5,
    })]))

    expect(ddbMock.commandCalls(PutItemCommand)).toHaveLength(0)
  })

  it('skips non-REMOVE events without writing', async () => {
    const insertRecord = {
      eventName: 'INSERT' as const,
      dynamodb: { NewImage: marshall({ email: 'test@example.com' }) },
      eventSource: 'aws:dynamodb',
      eventVersion: '1.1',
      eventID: 'test-id',
      eventSourceARN: 'arn',
      awsRegion: 'us-east-1',
    }

    await handler(makeEvent([insertRecord]))

    expect(ddbMock.commandCalls(PutItemCommand)).toHaveLength(0)
  })

  it('does not throw when DynamoDB write fails — skips record to preserve batch', async () => {
    ddbMock.on(PutItemCommand).rejects(new Error('DynamoDB unavailable'))

    await expect(handler(makeEvent([makeRemoveRecord({
      pk: 'EMAIL::test@example.com',
      sk: 'CREATEDAT::2026-06-10T10:00:00.000Z',
      email: 'test@example.com',
      createdAt: '2026-06-10T10:00:00.000Z',
      retryCount: 1,
    })]))).resolves.not.toThrow()
  })

  it('skips REMOVE record with missing OldImage without throwing', async () => {
    const record = {
      eventName: 'REMOVE' as const,
      dynamodb: {},
      eventSource: 'aws:dynamodb',
      eventVersion: '1.1',
      eventID: 'test-id',
      eventSourceARN: 'arn',
      awsRegion: 'us-east-1',
    }

    await expect(handler(makeEvent([record]))).resolves.not.toThrow()
    expect(ddbMock.commandCalls(PutItemCommand)).toHaveLength(0)
  })
})
