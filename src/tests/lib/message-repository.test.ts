import { mockClient } from 'aws-sdk-client-mock'
import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  DeleteItemCommand,
  ConditionalCheckFailedException,
} from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'
import { MessageRepository } from '@lib/message-repository'

const ddbMock = mockClient(DynamoDBClient)

beforeEach(() => ddbMock.reset())

const mockRecord = {
  pk: 'EMAIL::test@example.com',
  sk: 'CREATEDAT::2026-05-05T10:00:00.000Z',
  id: 'abc123',
  email: 'test@example.com',
  createdAt: '2026-05-05T10:00:00.000Z',
  retryCount: 0,
  expirationAt: '2026-05-05T10:01:00.000Z',
  retryDate: '2026-05-05',
}

describe('queryExpired', () => {
  it('queries the correct GSI with retryDate and expirationAt conditions', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [marshall(mockRecord)] })
    const repo = new MessageRepository('Messages')

    const results = await repo.queryExpired('2026-05-05', '2026-05-05T12:00:00.000Z')

    expect(results).toHaveLength(1)
    expect(results[0].email).toBe('test@example.com')

    const call = ddbMock.commandCalls(QueryCommand)[0]
    expect(call.args[0].input.IndexName).toBe('retryDate-expirationAt-index')
    expect(call.args[0].input.KeyConditionExpression).toBe(
      'retryDate = :retryDate AND expirationAt <= :now'
    )
  })

  it('returns empty array when no expired messages found', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] })
    const repo = new MessageRepository('Messages')

    const results = await repo.queryExpired('2026-05-05', '2026-05-05T12:00:00.000Z')

    expect(results).toHaveLength(0)
  })
})

describe('create', () => {
  it('sends PutItemCommand with idempotency condition expression', async () => {
    ddbMock.on(PutItemCommand).resolves({})
    const repo = new MessageRepository('Messages')

    await repo.create({ email: 'test@example.com', createdAt: '2026-05-05T10:00:00.000Z' })

    const call = ddbMock.commandCalls(PutItemCommand)[0]
    expect(call.args[0].input.ConditionExpression).toBe(
      'attribute_not_exists(pk) AND attribute_not_exists(sk)'
    )
  })

  it('resolves without throwing when the item already exists', async () => {
    ddbMock.on(PutItemCommand).rejects(
      new ConditionalCheckFailedException({ message: 'The conditional request failed', $metadata: {} })
    )
    const repo = new MessageRepository('Messages')

    await expect(
      repo.create({ email: 'test@example.com', createdAt: '2026-05-05T10:00:00.000Z' })
    ).resolves.toBeUndefined()
  })

  it('rethrows non-duplicate DynamoDB errors', async () => {
    ddbMock.on(PutItemCommand).rejects(new Error('DynamoDB unavailable'))
    const repo = new MessageRepository('Messages')

    await expect(
      repo.create({ email: 'test@example.com', createdAt: '2026-05-05T10:00:00.000Z' })
    ).rejects.toThrow('DynamoDB unavailable')
  })
})

describe('deleteMessage', () => {
  it('calls DeleteItemCommand with correct pk and sk keys', async () => {
    ddbMock.on(DeleteItemCommand).resolves({})
    const repo = new MessageRepository('Messages')

    await repo.deleteMessage(
      'EMAIL::test@example.com',
      'CREATEDAT::2026-05-05T10:00:00.000Z'
    )

    const call = ddbMock.commandCalls(DeleteItemCommand)[0]
    expect(call.args[0].input.Key!['pk']).toEqual({ S: 'EMAIL::test@example.com' })
    expect(call.args[0].input.Key!['sk']).toEqual({
      S: 'CREATEDAT::2026-05-05T10:00:00.000Z',
    })
  })
})
