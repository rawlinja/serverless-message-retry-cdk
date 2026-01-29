import { DynamoDBStreamEvent, DynamoDBStreamHandler } from 'aws-lambda'
import { Logger } from '@aws-lambda-powertools/logger'

const logger = new Logger({ serviceName: 'dynamodb-delete-trigger' })

const handler: DynamoDBStreamHandler = async (
  event: DynamoDBStreamEvent,
): Promise<any> => {
  logger.info('Received DynamoDB stream event', { recordCount: event.Records.length })
  event.Records.forEach((record: any) => {
    if (record.eventName === 'REMOVE') {
      logger.info('Record deleted', { keys: record.dynamodb?.Keys })
    }
  })
}

export { handler }
