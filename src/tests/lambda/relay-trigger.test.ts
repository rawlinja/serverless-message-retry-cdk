import { DynamoDBStreamEvent } from 'aws-lambda'
import { marshall } from '@aws-sdk/util-dynamodb'
import { handler } from '../../lambda/triggers/relay'

const makeInsertEvent = (message: object): DynamoDBStreamEvent => ({
  Records: [
    {
      eventName: 'INSERT',
      dynamodb: { NewImage: marshall(message) },
    } as any,
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
      Records: [{ eventName: 'REMOVE', dynamodb: {} } as any],
    }
    await expect(handler(event)).resolves.toBeUndefined()
  })

  it('skips INSERT events with missing NewImage', async () => {
    const event: DynamoDBStreamEvent = {
      Records: [{ eventName: 'INSERT', dynamodb: {} } as any],
    }
    await expect(handler(event)).resolves.toBeUndefined()
  })

  it('processes multiple records in a batch', async () => {
    const event: DynamoDBStreamEvent = {
      Records: [
        { eventName: 'INSERT', dynamodb: { NewImage: marshall({ email: 'a@example.com' }) } } as any,
        { eventName: 'REMOVE', dynamodb: {} } as any,
        { eventName: 'INSERT', dynamodb: { NewImage: marshall({ email: 'b@example.com' }) } } as any,
      ],
    }
    await expect(handler(event)).resolves.toBeUndefined()
  })
})
