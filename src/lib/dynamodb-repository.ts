import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'

type CreateOptions = {
  conditionExpression?: string
}

class DynamoDBRepository<T> {
  private dynamoDBClient: DynamoDBClient

  constructor(readonly tableName: string) {
    this.dynamoDBClient = new DynamoDBClient({ region: 'us-east-1' })
  }

  async create(item: T, createOptions?: CreateOptions) {
    try {
      const params = {
        TableName: this.tableName,
        Item: this.serialize(item),
        ConditionExpression: createOptions?.conditionExpression,
      }
      const command = new PutItemCommand(params)
      await this.dynamoDBClient.send(command)
    } catch (error) {
      throw error
    }
  }

  private serialize(item: T) {
    return marshall(item, { removeUndefinedValues: true })
  }
}

export { DynamoDBRepository }
