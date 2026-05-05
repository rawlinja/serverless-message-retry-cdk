import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { SQSClient } from '@aws-sdk/client-sqs'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { MessageService } from '@lib/message-service'

const ddbMock = mockClient(DynamoDBClient)
mockClient(SQSClient)

const BASE_DELAY_MS = 60_000
const FIXED_NOW = new Date('2026-05-05T12:00:00.000Z')

beforeEach(() => {
  ddbMock.reset()
  jest.useFakeTimers()
  jest.setSystemTime(FIXED_NOW)
})

afterEach(() => jest.useRealTimers())

const baseMessage = {
  email: 'test@example.com',
  createdAt: '2026-05-05T10:00:00.000Z',
}

describe('failMessage', () => {
  it('stores with expirationAt = now + BASE_DELAY for retryCount=0', async () => {
    ddbMock.on(PutItemCommand).resolves({})
    const service = new MessageService()

    await service.failMessage(baseMessage, 0)

    const call = ddbMock.commandCalls(PutItemCommand)[0]
    const stored = unmarshall(call.args[0].input.Item!)

    expect(stored.pk).toBe('EMAIL::test@example.com')
    expect(stored.sk).toBe('CREATEDAT::2026-05-05T10:00:00.000Z')
    expect(stored.retryCount).toBe(0)
    expect(stored.expirationAt).toBe(
      new Date(FIXED_NOW.getTime() + BASE_DELAY_MS).toISOString()
    )
    expect(stored.retryDate).toBe('2026-05-05')
  })

  it('stores with expirationAt = now + 2*BASE_DELAY for retryCount=1', async () => {
    ddbMock.on(PutItemCommand).resolves({})
    const service = new MessageService()

    await service.failMessage(baseMessage, 1)

    const call = ddbMock.commandCalls(PutItemCommand)[0]
    const stored = unmarshall(call.args[0].input.Item!)

    expect(stored.retryCount).toBe(1)
    expect(stored.expirationAt).toBe(
      new Date(FIXED_NOW.getTime() + 2 * BASE_DELAY_MS).toISOString()
    )
  })

  it('stores with expirationAt = now + 8*BASE_DELAY for retryCount=3', async () => {
    ddbMock.on(PutItemCommand).resolves({})
    const service = new MessageService()

    await service.failMessage(baseMessage, 3)

    const call = ddbMock.commandCalls(PutItemCommand)[0]
    const stored = unmarshall(call.args[0].input.Item!)

    expect(stored.retryCount).toBe(3)
    expect(stored.expirationAt).toBe(
      new Date(FIXED_NOW.getTime() + 8 * BASE_DELAY_MS).toISOString()
    )
  })

  it('retryDate is always the date portion of expirationAt', async () => {
    ddbMock.on(PutItemCommand).resolves({})
    const service = new MessageService()

    await service.failMessage(baseMessage, 0)

    const call = ddbMock.commandCalls(PutItemCommand)[0]
    const stored = unmarshall(call.args[0].input.Item!)

    expect(stored.retryDate).toBe(stored.expirationAt.split('T')[0])
  })

  it('throws if DynamoDB write fails', async () => {
    ddbMock.on(PutItemCommand).rejects(new Error('DynamoDB error'))
    const service = new MessageService()

    await expect(service.failMessage(baseMessage, 0)).rejects.toThrow('DynamoDB error')
  })

  it('throws if email or createdAt is missing', async () => {
    const service = new MessageService()
    await expect(service.failMessage({ email: '' }, 0)).rejects.toThrow('Missing required fields')
  })
})
