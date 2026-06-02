import { mockClient } from 'aws-sdk-client-mock'
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { MessageService } from '@lib/message-service'

const sqsMock = mockClient(SQSClient)
const ddbMock = mockClient(DynamoDBClient)

const FIXED_NOW = new Date('2026-05-05T12:00:00.000Z')

beforeEach(() => {
  sqsMock.reset()
  ddbMock.reset()
  jest.useFakeTimers()
  jest.setSystemTime(FIXED_NOW)
})

afterEach(() => jest.useRealTimers())

describe('queueMessage', () => {
  it('stamps createdAt on the SQS payload at enqueue time', async () => {
    sqsMock.on(SendMessageCommand).resolves({})
    const service = new MessageService()

    await service.queueMessage({ email: 'test@example.com' })

    const call = sqsMock.commandCalls(SendMessageCommand)[0]
    const body = JSON.parse(call.args[0].input.MessageBody!)
    expect(body.createdAt).toBe(FIXED_NOW.toISOString())
  })

  it('preserves all caller-provided fields on the SQS payload', async () => {
    sqsMock.on(SendMessageCommand).resolves({})
    const service = new MessageService()

    await service.queueMessage({ email: 'test@example.com', firstName: 'Jane', data: 'hello' })

    const call = sqsMock.commandCalls(SendMessageCommand)[0]
    const body = JSON.parse(call.args[0].input.MessageBody!)
    expect(body.email).toBe('test@example.com')
    expect(body.firstName).toBe('Jane')
    expect(body.data).toBe('hello')
  })
})

describe('registerMessage', () => {
  it('persists the message to DynamoDB', async () => {
    ddbMock.on(PutItemCommand).resolves({})
    const service = new MessageService()

    await service.registerMessage({
      email: 'test@example.com',
      createdAt: '2026-05-05T10:00:00.000Z',
    })

    const call = ddbMock.commandCalls(PutItemCommand)[0]
    const stored = unmarshall(call.args[0].input.Item!)
    expect(stored.email).toBe('test@example.com')
    expect(stored.pk).toBe('EMAIL::test@example.com')
    expect(stored.sk).toBe('CREATEDAT::2026-05-05T10:00:00.000Z')
  })
})
