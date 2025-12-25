import { Construct } from 'constructs'
import { Stack, StackProps } from 'aws-cdk-lib'
import { Queue } from 'aws-cdk-lib/aws-sqs'
import { StringParameter } from 'aws-cdk-lib/aws-ssm'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as Path from 'path'
import {
  MESSAGES_QUEUE_URL_PARAMETER_NAME,
  lambdaFunctionIdentifier,
} from './base-stack'

const LAMBDA_SQS_PATH = '../../lambda/sqs/index.ts'
const MESSAGES_QUEUE_ID = 'MessagesQueue'
const MESSAGES_QUEUE_URL_PARAMETER_ID = 'MessagesQueueUrlParameter'

type StringParameterProps = {
  id: string
  parameterName: string
  description: string
  stringValue: string
}

type MessagingStackProps = StackProps & {
  handler: string
  tableArn: string
}

type MessagingStackExports = {
  queueArn: string
  queueUrlParameterArn: string
}

type BuildProps = {
  handler: string
  tableArn: string
}

class MessagingStack extends Stack {
  exports: MessagingStackExports = {} as MessagingStackExports

  constructor(scope: Construct, id: string, props: MessagingStackProps) {
    super(scope, id, props)
    this.build({ handler: props.handler, tableArn: props.tableArn })
  }

  build(props: BuildProps) {
    const queue = new Queue(this, MESSAGES_QUEUE_ID, {})

    const messagesQueueUrlParameter = this.buildStringParameter({
      id: MESSAGES_QUEUE_URL_PARAMETER_ID,
      parameterName: MESSAGES_QUEUE_URL_PARAMETER_NAME,
      description: 'Message queue url parameter',
      stringValue: queue.queueUrl,
    })

    const lambda = this.buildLambdaFunction(props.handler)

    lambda.addEventSource(
      new SqsEventSource(queue, {
        batchSize: 5,
      }),
    )

    const policyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:PutItem'],
      resources: [props.tableArn],
    })

    lambda.addToRolePolicy(policyStatement)

    this.exports = {
      queueArn: queue.queueArn,
      queueUrlParameterArn: messagesQueueUrlParameter.parameterArn,
    }
  }

  buildLambdaFunction(name: string): lambda.Function {
    return new NodejsFunction(this, lambdaFunctionIdentifier(name), {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: name,
      entry: Path.join(__dirname, LAMBDA_SQS_PATH),
    })
  }

  buildStringParameter({
    id,
    parameterName,
    description,
    stringValue,
  }: StringParameterProps) {
    return new StringParameter(this, id, {
      parameterName,
      description,
      stringValue,
    })
  }
}

export { MessagingStack }
