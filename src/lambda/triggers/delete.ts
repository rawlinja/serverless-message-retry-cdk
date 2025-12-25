import { DynamoDBStreamEvent, DynamoDBStreamHandler } from 'aws-lambda'

const handler: DynamoDBStreamHandler = async (
  event: DynamoDBStreamEvent,
): Promise<any> => {
  console.log('Received event:', JSON.stringify(event, null, 2))
  event.Records.forEach((record: any) => {
    console.log(record.body)

    if (record.eventName === 'REMOVE') {
      console.log('Record deleted', record)
    }
  })
}

export { handler }
