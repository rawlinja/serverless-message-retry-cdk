import { Template } from 'aws-cdk-lib/assertions'
import { PersistenceStack } from '@stacks/index'
import { App } from 'aws-cdk-lib'

describe('PersistenceStack', () => {
  const template = Template.fromStack(new PersistenceStack(new App(), 'PersistenceStack', {}))

  it('creates the Messages table', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'Messages',
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
    })
  })

  it('enables DynamoDB streams with NEW_AND_OLD_IMAGES', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
    })
  })

  it('creates the retryDate-expirationAt-index GSI', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      GlobalSecondaryIndexes: [
        {
          IndexName: 'retryDate-expirationAt-index',
          KeySchema: [
            { AttributeName: 'retryDate', KeyType: 'HASH' },
            { AttributeName: 'expirationAt', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
    })
  })
})
