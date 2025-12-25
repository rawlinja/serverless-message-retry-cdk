import { Capture, Match, Template } from 'aws-cdk-lib/assertions'
import { PersistenceStack } from '../../Infrastructure/stacks'
import { App } from 'aws-cdk-lib'

const TABLE_NAME = 'Messages'

describe('PersistanceStack', () => {
  it('should have a table', () => {
    const stack = new PersistenceStack(new App(), 'PersistenceStack', {})

    // Prepare the stack for assertions.
    const template = Template.fromStack(stack)

    console.log(template.toJSON())

    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: TABLE_NAME,
    })
  })
})
