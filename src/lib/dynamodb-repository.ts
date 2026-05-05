import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  DeleteItemCommand,
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'

type CreateOptions = {
  conditionExpression?: string
}

type QueryOptions = {
  indexName?: string
  keyConditionExpression: string
  expressionAttributeValues: Record<string, unknown>
}

class DynamoDBRepository<T> {
  private dynamoDBClient: DynamoDBClient

  constructor(readonly tableName: string) {
    this.dynamoDBClient = new DynamoDBClient({ region: 'us-east-1' })
  }

  async create(item: T, createOptions?: CreateOptions) {
    try {
      const command = new PutItemCommand({
        TableName: this.tableName,
        Item: this.serialize(item),
        ConditionExpression: createOptions?.conditionExpression,
      })
      await this.dynamoDBClient.send(command)
    } catch (error) {
      throw error
    }
  }

  async query(options: QueryOptions): Promise<T[]> {
    try {
      const command = new QueryCommand({
        TableName: this.tableName,
        IndexName: options.indexName,
        KeyConditionExpression: options.keyConditionExpression,
        ExpressionAttributeValues: marshall(options.expressionAttributeValues),
      })
      const result = await this.dynamoDBClient.send(command)
      return (result.Items ?? []).map((item) => unmarshall(item) as T)
    } catch (error) {
      throw error
    }
  }

  async deleteItem(pk: string, sk: string): Promise<void> {
    const command = new DeleteItemCommand({
      TableName: this.tableName,
      Key: marshall({ pk, sk }),
    })
    await this.dynamoDBClient.send(command)
  }

  private serialize(item: T) {
    return marshall(item, { removeUndefinedValues: true })
  }
}

export { DynamoDBRepository }
export type { CreateOptions, QueryOptions }
