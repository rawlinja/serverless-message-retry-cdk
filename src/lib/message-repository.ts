import { DynamoDBRepository } from './dynamodb-repository'
import { Message } from './message-service'
import { generateId } from './nanoid-utils'

class MessageRepository extends DynamoDBRepository {
  constructor(tableName: string) {
    super(tableName)
  }

  getPrimaryKey(item: Message) {
    return `EMAIL::${item.email}`
  }

  getSortKey(item: Message) {
    return `CREATEDAT::${item.createdAt}`
  }

  async create(item: Message) {
    try {
      await super.create({
        pk: this.getPrimaryKey(item),
        sk: this.getSortKey(item),
        id: generateId(),
        ...item,
      })
      console.log('Item created successfully:', item)
    } catch (error) {
      console.error('Error creating item in DynamoDB', error)
      throw error
    }
  }
}

export { MessageRepository }
