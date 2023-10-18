
import { Construct } from 'constructs'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Stack, StackProps } from 'aws-cdk-lib'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import * as apigateway from 'aws-cdk-lib/aws-apigateway'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import { StringParameter } from 'aws-cdk-lib/aws-ssm'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import * as Path from 'path'
import { MESSAGES_QUEUE_URL_PARAMETER_NAME, lambdaFunctionIdentifier } from './base-stack'

const LAMBDA_API_PATH = '../lambda/api/index.ts'
const API_ROOT = 'MessagesApi'
const DEFAULT_REST_API_HANDLER = 'index.base'
const AUTHORIZE_API_HANDLER = 'index.authorize'
const TOKEN_AUTHORIZER_ID = 'MessagesTokenAuthorizer'
const MESSSAGES_QUEUE_URL_PARAMETER_ID = 'MessagesQueueUrlParameter'
const MIDDY_LAMBDA_LAYER_ARN_PARAMETER_ID = 'MiddyLambdaLayerArnParameter'
const SECRET_MANAGER_JWT_SECRET_ID = 'SecretManagerJwtSecretId'
const MESSAGES_JWT_SECRET_NAME = '/prod/messages/jwt-secret'
const MIDDY_LAMBDA_LAYER_ARN_PARAMETER_NAME = '/prod/middy-lambda-layer-arn'
const LAYER_VERSION_ATTRIBUTES_ID = 'LayerVersionAttributesId'

type LambdaEnvironment = { [key: string]: string }

type HttpMethod = 'GET' | 'POST'

type Route = {
  method: HttpMethod
  handler: string
}

type Resource = {
  name: string
  routes: Route[]
}

type QueueConfiguration = {
  queueArn: string
  queueUrlParameterArn: string
}

type ApiStackProps = StackProps & {
  resources: Resource[]
  queue: QueueConfiguration
  environment?: LambdaEnvironment
}

type BuildProps = {
  resources: Resource[]
  queueArn: string
}

type CreateRestApiProps = BuildProps & {
  authorizer: apigateway.TokenAuthorizer,
  middyLayer: lambda.ILayerVersion
}

class ApiStack extends Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props)

    const { resources, queue } = props
    this.build({ resources, queueArn: queue.queueArn })
  }

  build(props: BuildProps) {

    const authorizer = this.createTokenAuthorizer()
    
    const middyLayer = this.getMiddyLayer()

    this.createRestApi({
      resources: props.resources,
      queueArn: props.queueArn,
      authorizer,
      middyLayer: middyLayer
    })

  }

  createTokenAuthorizer(): apigateway.TokenAuthorizer {
    const authorizeLambda = this.buildLambdaFunction(AUTHORIZE_API_HANDLER, {
      MESSAGES_JWT_SECRET_NAME,
    })

    const secret = secretsmanager.Secret.fromSecretNameV2(this, SECRET_MANAGER_JWT_SECRET_ID, MESSAGES_JWT_SECRET_NAME)
    secret.grantRead(authorizeLambda)
    
    return new apigateway.TokenAuthorizer(this, TOKEN_AUTHORIZER_ID, {
      handler: authorizeLambda
    })

  }

  getMiddyLayer(): lambda.ILayerVersion {
    const middyLayerArn = StringParameter.fromStringParameterAttributes(
      this,
      MIDDY_LAMBDA_LAYER_ARN_PARAMETER_ID,
      {
        parameterName: MIDDY_LAMBDA_LAYER_ARN_PARAMETER_NAME,
        version: 1,
      }
    ).stringValue

    return lambda.LayerVersion.fromLayerVersionAttributes(this, LAYER_VERSION_ATTRIBUTES_ID, {
      layerVersionArn: middyLayerArn,
    })

  }

  createRestApi(props: CreateRestApiProps) {
    const messageQueueUrl = this.getMessageQueueUrl()

    const sendMessagePolicyStatement = this.createSendMessagePolicyStatement(props.queueArn)

    const api = new apigateway.LambdaRestApi(this, API_ROOT, {
      handler: this.buildLambdaFunction(DEFAULT_REST_API_HANDLER, {}),
      proxy: false,
    })

    props.resources.forEach((resource) => {
      let messagesResource = api.root.getResource(resource.name)

      if (!messagesResource) {
        messagesResource = api.root.addResource(resource.name)
      }

      resource.routes.forEach((route) => {
        const lambda = this.buildLambdaFunction(route.handler, {
          MESSAGES_QUEUE_URL: messageQueueUrl,
        }, props.middyLayer)
        lambda.addToRolePolicy(sendMessagePolicyStatement)

        messagesResource?.addMethod(
          route.method,
          new apigateway.LambdaIntegration(lambda),
          {
            authorizer: props.authorizer,
          }
        )
      })
    })
  }

  getMessageQueueUrl(): string {
    return StringParameter.fromStringParameterAttributes(
      this,
      MESSSAGES_QUEUE_URL_PARAMETER_ID,
      {
        parameterName: MESSAGES_QUEUE_URL_PARAMETER_NAME,
        version: 1,
      }
    ).stringValue

  }

  createSendMessagePolicyStatement(queueArn: string): iam.PolicyStatement {
    return new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['sqs:SendMessage'],
      resources: [queueArn],
    })
  }

  buildLambdaFunction(
    name: string,
    environment: LambdaEnvironment,
    middyLayer?: lambda.ILayerVersion
  ): lambda.Function {
    return new NodejsFunction(this, lambdaFunctionIdentifier(name), {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: name,
      entry: Path.join(__dirname, LAMBDA_API_PATH),
      layers: middyLayer ? [middyLayer] : [],
      environment,
    })
  }
}

export { ApiStack }
