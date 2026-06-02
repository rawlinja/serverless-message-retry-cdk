import { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda'
import { marshall } from '@aws-sdk/util-dynamodb'
import { handler } from '../../lambda/triggers/relay'

const makeInsertEvent = (message: object): DynamoDBStreamEvent => ({
  Records: [
    {
      eventName: 'INSERT',
      dynamodb: { NewImage: marshall(message) },
    } as DynamoDBRecord,
  ],
})

describe('relay trigger', () => {
  it('processes INSERT events without throwing', async () => {
    await expect(
      handler(makeInsertEvent({ email: 'test@example.com', retryCount: 0 })),
    ).resolves.toBeUndefined()
  })

  it('skips non-INSERT events', async () => {
    const event: DynamoDBStreamEvent = {
      Records: [{ eventName: 'REMOVE', dynamodb: {} } as DynamoDBRecord],
    }
    await expect(handler(event)).resolves.toBeUndefined()
  })

  it('skips INSERT events with missing NewImage', async () => {
    const event: DynamoDBStreamEvent = {
      Records: [{ eventName: 'INSERT', dynamodb: {} } as DynamoDBRecord],
    }
    await expect(handler(event)).resolves.toBeUndefined()
  })

  it('processes multiple records in a batch', async () => {
    const event: DynamoDBStreamEvent = {
      Records: [
        { eventName: 'INSERT', dynamodb: { NewImage: marshall({ email: 'a@example.com' }) } } as DynamoDBRecord,
        { eventName: 'REMOVE', dynamodb: {} } as DynamoDBRecord,
        { eventName: 'INSERT', dynamodb: { NewImage: marshall({ email: 'b@example.com' }) } } as DynamoDBRecord,
      ],
    }
    await expect(handler(event)).resolves.toBeUndefined()
  })
})
