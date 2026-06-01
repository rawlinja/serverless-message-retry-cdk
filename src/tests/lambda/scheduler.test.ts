import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBClient, QueryCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { handler } from '../../lambda/jobs/scheduler'

const ddbMock = mockClient(DynamoDBClient)

const FIXED_NOW = new Date('2026-05-05T12:00:00.000Z')

beforeEach(() => {
  ddbMock.reset()
  jest.useFakeTimers()
  jest.setSystemTime(FIXED_NOW)
})

afterEach(() => {
  jest.useRealTimers()
  delete process.env.LOOKBACK_DAYS
})

const mockRecord = (overrides = {}) =>
  marshall({
    pk: 'EMAIL::test@example.com',
    sk: 'CREATEDAT::2026-05-05T10:00:00.000Z',
    id: 'abc123',
    email: 'test@example.com',
    createdAt: '2026-05-05T10:00:00.000Z',
    retryCount: 0,
    expirationAt: '2026-05-05T10:01:00.000Z',
    retryDate: '2026-05-05',
    ...overrides,
  })

describe('scheduler handler', () => {
  it('queries GSI for each date in the lookback window', async () => {
    process.env.LOOKBACK_DAYS = '3'
    ddbMock.on(QueryCommand).resolves({ Items: [] })

    await handler()

    expect(ddbMock.commandCalls(QueryCommand)).toHaveLength(3)
    const calls = ddbMock.commandCalls(QueryCommand)
    const dates = calls.map(
      (call) => unmarshall(call.args[0].input.ExpressionAttributeValues!)[':retryDate'],
    )
    expect(dates).toEqual(['2026-05-05', '2026-05-04', '2026-05-03'])
  })

  it('deletes each expired message returned from the GSI', async () => {
    process.env.LOOKBACK_DAYS = '1'
    ddbMock
      .on(QueryCommand)
      .resolves({ Items: [mockRecord(), mockRecord({ pk: 'EMAIL::other@example.com' })] })
    ddbMock.on(DeleteItemCommand).resolves({})

    await handler()

    expect(ddbMock.commandCalls(DeleteItemCommand)).toHaveLength(2)
  })

  it('handles empty result set without errors', async () => {
    process.env.LOOKBACK_DAYS = '1'
    ddbMock.on(QueryCommand).resolves({ Items: [] })

    await expect(handler()).resolves.not.toThrow()
    expect(ddbMock.commandCalls(DeleteItemCommand)).toHaveLength(0)
  })

  it('continues to next date if one date query fails', async () => {
    process.env.LOOKBACK_DAYS = '2'
    ddbMock
      .on(QueryCommand)
      .rejectsOnce(new Error('DynamoDB error'))
      .resolves({ Items: [mockRecord()] })
    ddbMock.on(DeleteItemCommand).resolves({})

    await expect(handler()).resolves.not.toThrow()
    expect(ddbMock.commandCalls(DeleteItemCommand)).toHaveLength(1)
  })
})
