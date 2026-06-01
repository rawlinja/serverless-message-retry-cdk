import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import { Logger } from '@aws-lambda-powertools/logger'
import { DynamoDBRepository } from './dynamodb-repository'
import { generateId } from './nanoid-utils'
import type { Message, MessageRecord } from './types'

const logger = new Logger({ serviceName: 'message-repository' })
const GSI_NAME = 'retryDate-expirationAt-index'

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
      await super.create(
        {
          pk: this.getPrimaryKey(item),
          sk: this.getSortKey(item),
          id: generateId(),
          ...item,
        },
        { conditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)' },
      )
      logger.info('Item created successfully', { item })
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        logger.info('Duplicate message detected, skipping', {
          pk: this.getPrimaryKey(item),
          sk: this.getSortKey(item),
        })
        return
      }
      logger.error('Error creating item in DynamoDB', { error })
      throw error
    }
  }

  async queryExpired(retryDate: string, now: string): Promise<MessageRecord[]> {
    return this.query({
      indexName: GSI_NAME,
      keyConditionExpression: 'retryDate = :retryDate AND expirationAt <= :now',
      expressionAttributeValues: { ':retryDate': retryDate, ':now': now },
    })
  }

  async deleteMessage(pk: string, sk: string): Promise<void> {
    await this.deleteItem(pk, sk)
  }
}

export { MessageRepository }
