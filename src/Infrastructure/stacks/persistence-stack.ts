import { Construct } from 'constructs'
import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib'
import { Table } from 'aws-cdk-lib/aws-dynamodb'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'

const TABLE_NAME = 'Messages'
const MESSAGES_TABLE_ID = 'MessagesTable'
const PARTITION_KEY = 'pk'
const SORT_KEY = 'sk'

type PersistenceStackExports = {
  tableArn: string
  tableStreamArn: string
}

class PersistenceStack extends Stack {
  exports: PersistenceStackExports

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const table = new Table(this, MESSAGES_TABLE_ID, {
      tableName: TABLE_NAME,
      partitionKey: {
        name: PARTITION_KEY,
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: { name: SORT_KEY, type: dynamodb.AttributeType.STRING },
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: RemovalPolicy.DESTROY,
    })

    this.exports = {
      tableArn: table.tableArn,
      tableStreamArn: table.tableStreamArn!,
    }
  }
}

export { PersistenceStack }
