import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'

type CreateOptions = {
    conditionExpression?: string
}

class DynamoDBRepository {
    private dynamoDBClient: DynamoDBClient

    constructor(readonly tableName: string) {
        this.dynamoDBClient = new DynamoDBClient({ region: 'us-east-1' })
    }

    async create(item: Record<string, any>, createOptions?: CreateOptions) {
        try {
            const params = {
                TableName: this.tableName,
                Item: this.serialize(item),
                conditionExpression: createOptions?.conditionExpression
            }
            const command = new PutItemCommand(params)
            await this.dynamoDBClient.send(command)
        } catch (error) {
            throw error
        }
    }

    private serialize(item: Record<string, any>) {
        return marshall(item, { removeUndefinedValues: true })

    }

}



export { DynamoDBRepository }