import { Logger } from '@aws-lambda-powertools/logger'
import { DynamoDBRepository } from './dynamodb-repository'
import { generateId } from './nanoid-utils'
import type { Message, MessageRecord } from './types'

const logger = new Logger({ serviceName: 'message-repository' })

class MessageRepository extends DynamoDBRepository<MessageRecord> {
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
      logger.info('Item created successfully', { item })
    } catch (error) {
      logger.error('Error creating item in DynamoDB', { error })
      throw error
    }
  }
}

export { MessageRepository }
