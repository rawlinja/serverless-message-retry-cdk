import { Capture, Match, Template } from 'aws-cdk-lib/assertions'
import { PersistenceStack } from '@stacks/index'
import { App } from 'aws-cdk-lib'

const TABLE_NAME = 'Messages'

describe('PersistanceStack', () => {
  it('should have a table', () => {
    const stack = new PersistenceStack(new App(), 'PersistenceStack', {})

    const template = Template.fromStack(stack)

    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: TABLE_NAME,
    })
  })
})
