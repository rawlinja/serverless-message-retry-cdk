import { mockClient } from 'aws-sdk-client-mock'
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'
import { DynamoDBStreamEvent } from 'aws-lambda'
import { handler } from '../../lambda/triggers/delete'

const sqsMock = mockClient(SQSClient)
mockClient(DynamoDBClient)

beforeEach(() => sqsMock.reset())

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
  it('re-queues message to SQS with incremented retryCount', async () => {
    sqsMock.on(SendMessageCommand).resolves({ MessageId: 'msg-id' })

    const message = {
      pk: 'EMAIL::test@example.com',
      sk: 'CREATEDAT::2026-05-05T10:00:00.000Z',
      email: 'test@example.com',
      createdAt: '2026-05-05T10:00:00.000Z',
      retryCount: 2,
    }

    await handler(makeEvent([makeRemoveRecord(message)]))

    const calls = sqsMock.commandCalls(SendMessageCommand)
    expect(calls).toHaveLength(1)

    const body = JSON.parse(calls[0].args[0].input.MessageBody!)
    expect(body.retryCount).toBe(3)
    expect(body.email).toBe('test@example.com')
  })

  it('does not re-queue when retryCount reaches MAX_RETRIES (5)', async () => {
    sqsMock.on(SendMessageCommand).resolves({})

    const message = {
      pk: 'EMAIL::test@example.com',
      sk: 'CREATEDAT::2026-05-05T10:00:00.000Z',
      email: 'test@example.com',
      createdAt: '2026-05-05T10:00:00.000Z',
      retryCount: 5,
    }

    await handler(makeEvent([makeRemoveRecord(message)]))

    expect(sqsMock.commandCalls(SendMessageCommand)).toHaveLength(0)
  })

  it('skips non-REMOVE events without calling SQS', async () => {
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

    expect(sqsMock.commandCalls(SendMessageCommand)).toHaveLength(0)
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
    expect(sqsMock.commandCalls(SendMessageCommand)).toHaveLength(0)
  })
})
