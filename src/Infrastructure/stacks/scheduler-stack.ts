import { Construct } from 'constructs'
import { Duration, Stack, StackProps } from 'aws-cdk-lib'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as events from 'aws-cdk-lib/aws-events'
import * as targets from 'aws-cdk-lib/aws-events-targets'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as Path from 'path'
import { lambdaFunctionIdentifier } from './base-stack'

const LAMBDA_JOBS_PATH = '../../lambda/jobs/index.ts'
const LOOKBACK_DAYS = '30'

type SchedulerStackProps = StackProps & {
  handler: string
  duration: Duration
  tableArn: string
}

class SchedulerStack extends Stack {
  constructor(scope: Construct, id: string, props: SchedulerStackProps) {
    super(scope, id, props)

    const scheduler = this.buildLambdaFunction(props.handler, {
      LOOKBACK_DAYS,
    })

    scheduler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      }),
    )

    scheduler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:Query'],
        resources: [`${props.tableArn}/index/*`],
      }),
    )

    scheduler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:DeleteItem'],
        resources: [props.tableArn],
      }),
    )

    const rule = new events.Rule(this, 'SchedulerRule', {
      schedule: events.Schedule.rate(props.duration),
    })

    rule.addTarget(new targets.LambdaFunction(scheduler))
  }

  buildLambdaFunction(name: string, environment: { [key: string]: string }): lambda.Function {
    return new NodejsFunction(this, lambdaFunctionIdentifier(name), {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: name,
      entry: Path.join(__dirname, LAMBDA_JOBS_PATH),
      environment,
    })
  }
}

export { SchedulerStack }
