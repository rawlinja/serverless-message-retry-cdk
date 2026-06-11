import { mockClient } from 'aws-sdk-client-mock'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { APIGatewayTokenAuthorizerEvent } from 'aws-lambda'
import * as jwt from 'jsonwebtoken'
import { authorize } from '../../lambda/api/authorize'

const secretsMock = mockClient(SecretsManagerClient)

const TEST_SECRET = 'test-secret'
const METHOD_ARN = 'arn:aws:execute-api:us-east-1:123456789012:test/prod/POST/messages'

const makeToken = (overrides?: Partial<jwt.SignOptions>) =>
  jwt.sign({ sub: 'user-123', name: 'Test User' }, TEST_SECRET, {
    algorithm: 'HS256',
    ...overrides,
  })

const makeEvent = (token: string): APIGatewayTokenAuthorizerEvent => ({
  type: 'TOKEN',
  authorizationToken: `Bearer ${token}`,
  methodArn: METHOD_ARN,
})

beforeEach(() => {
  secretsMock.reset()
  secretsMock.on(GetSecretValueCommand).resolves({
    SecretString: JSON.stringify({ messagesJwtSecret: TEST_SECRET }),
  })
})

describe('authorize', () => {
  it('returns Allow policy for a valid token', async () => {
    const result = await authorize(makeEvent(makeToken()))

    expect(result.principalId).toBe('user-123')
    expect(result.policyDocument.Statement[0].Effect).toBe('Allow')
  })

  it('returns Deny policy when no token is provided', async () => {
    const event: APIGatewayTokenAuthorizerEvent = {
      type: 'TOKEN',
      authorizationToken: '',
      methodArn: METHOD_ARN,
    }

    const result = await authorize(event)

    expect(result.principalId).toBe('*')
    expect(result.policyDocument.Statement[0].Effect).toBe('Deny')
  })

  it('returns Deny policy for a token signed with wrong secret', async () => {
    const badToken = jwt.sign({ sub: 'user-123' }, 'wrong-secret', { algorithm: 'HS256' })

    const result = await authorize(makeEvent(badToken))

    expect(result.policyDocument.Statement[0].Effect).toBe('Deny')
  })

  it('returns Deny policy for an expired token', async () => {
    const expiredToken = makeToken({ expiresIn: -1 })

    const result = await authorize(makeEvent(expiredToken))

    expect(result.policyDocument.Statement[0].Effect).toBe('Deny')
  })

  it('returns Deny policy when SecretString is empty', async () => {
    secretsMock.on(GetSecretValueCommand).resolves({ SecretString: undefined })

    const result = await authorize(makeEvent(makeToken()))

    expect(result.policyDocument.Statement[0].Effect).toBe('Deny')
  })

  it('returns Deny policy when Secrets Manager fails', async () => {
    secretsMock.on(GetSecretValueCommand).rejects(new Error('AccessDenied'))

    const result = await authorize(makeEvent(makeToken()))

    expect(result.policyDocument.Statement[0].Effect).toBe('Deny')
  })
})
