import { Construct } from 'constructs'
import { StackProps } from 'aws-cdk-lib'
import { Stack } from 'aws-cdk-lib'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { lambdaFunctionIdentifier } from './base-stack'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources'
import * as Path from 'path'
import { Table } from 'aws-cdk-lib/aws-dynamodb'
import * as iam from 'aws-cdk-lib/aws-iam'

const LAMBDA_STREAMS_PATH = '../../lambda/triggers/index.ts'
const MESSAGES_TABLE_IMPORT_ID = 'MessagesTableImport'

type ExponentialBackoffStackProps = StackProps & {
  handler: string
  tableArn: string
  tableStreamArn: string
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
    })
  }

  //// Build delete trigger
  build(buildProps: {
    handler: string
    tableArn: string
    tableStreamArn: string
  }) {
    //// Lambda function for delete trigger
    ////
    const deleteTrigger = this.buildLambdaFunction(buildProps.handler)
    // Grant permissions to lambda function
    deleteTrigger.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: ['*'],
      }),
    )

    // DynamoDB table for delete trigger
    // The table must be imported using the tableArn and tableStreamArn
    const table = Table.fromTableAttributes(this, MESSAGES_TABLE_IMPORT_ID, {
      tableArn: buildProps.tableArn,
      tableStreamArn: buildProps.tableStreamArn,
    })
    // Grant read stream access to lambda function
    table.grantStreamRead(deleteTrigger)

    // Add event source to lambda function
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
    //environment: LambdaEnvironment,
  ): lambda.Function {
    return new NodejsFunction(this, lambdaFunctionIdentifier(name), {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: name,
      entry: Path.join(__dirname, LAMBDA_STREAMS_PATH),
      //environment,
    })
  }
}

export { ExponentialBackoffStack }
