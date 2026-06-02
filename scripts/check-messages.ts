import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'

const TABLE_NAME = process.env.TABLE_NAME ?? 'Messages'
const EMAIL = process.env.EMAIL

const main = async () => {
  if (!EMAIL) {
    console.error('Missing required env var: EMAIL')
    process.exit(1)
  }

  const client = new DynamoDBClient({ region: 'us-east-1' })

  const result = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: marshall({ ':pk': `EMAIL::${EMAIL}` }),
    }),
  )

  const items = (result.Items ?? []).map((item) => unmarshall(item))

  if (items.length === 0) {
    console.log(`No records found for ${EMAIL}`)
    return
  }

  console.log(`Found ${items.length} record(s) for ${EMAIL}:\n`)
  for (const item of items) {
    console.log(JSON.stringify(item, null, 2))
    console.log('---')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
