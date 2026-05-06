import { Construct } from 'constructs'
import { StackProps, Stack } from 'aws-cdk-lib'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { lambdaFunctionIdentifier, MESSAGES_QUEUE_URL_PARAMETER_NAME } from './base-stack'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources'
import * as Path from 'path'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Table } from 'aws-cdk-lib/aws-dynamodb'
import { StringParameter } from 'aws-cdk-lib/aws-ssm'

const LAMBDA_STREAMS_PATH = '../../lambda/triggers/index.ts'
const MESSAGES_TABLE_IMPORT_ID = 'MessagesTableImport'
const MESSAGES_QUEUE_URL_PARAMETER_ID = 'MessagesQueueUrlParameter'

type ExponentialBackoffStackProps = StackProps & {
  handler: string
  tableArn: string
  tableStreamArn: string
  queueArn: string
}

class ExponentialBackoffStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: ExponentialBackoffStackProps,
  ) {
    super(scope, id, props)
    this.build({
      handler: props.handler,
      tableArn: props.tableArn,
      tableStreamArn: props.tableStreamArn,
      queueArn: props.queueArn,
    })
  }

  build(buildProps: {
    handler: string
    tableArn: string
    tableStreamArn: string
    queueArn: string
  }) {
    const queueUrl = StringParameter.fromStringParameterAttributes(
      this,
      MESSAGES_QUEUE_URL_PARAMETER_ID,
      { parameterName: MESSAGES_QUEUE_URL_PARAMETER_NAME, version: 1 },
    ).stringValue

    const deleteTrigger = this.buildLambdaFunction(buildProps.handler, {
      MESSAGES_QUEUE_URL: queueUrl,
    })

    deleteTrigger.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      }),
    )

    deleteTrigger.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['sqs:SendMessage'],
        resources: [buildProps.queueArn],
      }),
    )

    const table = Table.fromTableAttributes(this, MESSAGES_TABLE_IMPORT_ID, {
      tableArn: buildProps.tableArn,
      tableStreamArn: buildProps.tableStreamArn,
    })

    table.grantStreamRead(deleteTrigger)

    deleteTrigger.addEventSource(
      new lambdaEventSources.DynamoEventSource(table, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 5,
        retryAttempts: 0,
      }),
    )
  }

  buildLambdaFunction(
    name: string,
    environment: { [key: string]: string },
  ): lambda.Function {
    return new NodejsFunction(this, lambdaFunctionIdentifier(name), {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: name,
      entry: Path.join(__dirname, LAMBDA_STREAMS_PATH),
      environment,
    })
  }
}

export { ExponentialBackoffStack }
