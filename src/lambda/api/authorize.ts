import {
  APIGatewayTokenAuthorizerEvent,
  APIGatewayAuthorizerResult,
} from 'aws-lambda'
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager'

import * as jwt from 'jsonwebtoken'

type Token = {
  sub: string
  name: string
  iss: string
  aud: string
  exp: number
  iat: number
}

type Effect = 'Allow' | 'Deny'

const client = new SecretsManagerClient({ region: 'us-east-1' })
const secretName = process.env.MESSAGES_JWT_SECRET_NAME || ''

const authorize = async (
  event: APIGatewayTokenAuthorizerEvent,
): Promise<APIGatewayAuthorizerResult> => {
  let token = event.authorizationToken || ''
  token = token.replace(/^Bearer\s/, '')

  if (!token) {
    return generatePolicy('*', 'Deny', event.methodArn)
  }

  const decodedToken = jwt.decode(token, { complete: true })
  const { sub } = decodedToken?.payload as Token

  try {
    const secret = JSON.parse(await getJwtSecret())['messagesJwtSecret']

    jwt.verify(token, secret || '', {
      algorithms: ['HS256'],
    })

    return generatePolicy(sub, 'Allow', event.methodArn)
  } catch (error) {
    console.error(error)
    return generatePolicy(sub, 'Deny', event.methodArn)
  }
}

async function getJwtSecret() {
  try {
    const command = new GetSecretValueCommand({
      SecretId: secretName,
    })
    const response = await client.send(command)
    if (response.SecretString) {
      return response.SecretString
    } else {
      throw new Error('SecretString is empty')
    }
  } catch (error) {
    console.error(error)
    throw error
  }
}

function generatePolicy(
  principalId: string,
  effect: Effect,
  resource: string,
): APIGatewayAuthorizerResult {
  const authResponse: APIGatewayAuthorizerResult = {
    principalId: principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    },
  }
  return authResponse
}

export { authorize }
