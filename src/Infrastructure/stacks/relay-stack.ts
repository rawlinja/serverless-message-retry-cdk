import { Construct } from 'constructs'
import { StackProps, Stack } from 'aws-cdk-lib'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { lambdaFunctionIdentifier } from './base-stack'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources'
import * as Path from 'path'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Table } from 'aws-cdk-lib/aws-dynamodb'

const LAMBDA_STREAMS_PATH = '../../lambda/triggers/index.ts'
const MESSAGES_TABLE_IMPORT_ID = 'MessagesTableRelayImport'

type RelayStackProps = StackProps & {
  handler: string
  tableArn: string
  tableStreamArn: string
}

class RelayStack extends Stack {
  constructor(scope: Construct, id: string, props: RelayStackProps) {
    super(scope, id, props)
    this.build(props)
  }

  build(buildProps: { handler: string; tableArn: string; tableStreamArn: string }) {
    const relayTrigger = this.buildLambdaFunction(buildProps.handler, {})

    relayTrigger.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      }),
    )

    const table = Table.fromTableAttributes(this, MESSAGES_TABLE_IMPORT_ID, {
      tableArn: buildProps.tableArn,
      tableStreamArn: buildProps.tableStreamArn,
    })

    table.grantStreamRead(relayTrigger)

    relayTrigger.addEventSource(
      new lambdaEventSources.DynamoEventSource(table, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 5,
        retryAttempts: 0,
      }),
    )
  }

  buildLambdaFunction(name: string, environment: { [key: string]: string }): lambda.Function {
    return new NodejsFunction(this, lambdaFunctionIdentifier(name), {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: name,
      entry: Path.join(__dirname, LAMBDA_STREAMS_PATH),
      environment,
    })
  }
}

export { RelayStack }
