import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'

const FUNCTION_NAME = process.env.SCHEDULER_FUNCTION_NAME

const main = async () => {
  if (!FUNCTION_NAME) {
    console.error('Missing required env var: SCHEDULER_FUNCTION_NAME')
    process.exit(1)
  }

  const client = new LambdaClient({ region: 'us-east-1' })

  console.log(`Invoking scheduler: ${FUNCTION_NAME}`)

  const result = await client.send(
    new InvokeCommand({
      FunctionName: FUNCTION_NAME,
      InvocationType: 'RequestResponse',
    }),
  )

  const payload = result.Payload ? Buffer.from(result.Payload).toString() : null

  console.log(`Status: ${result.StatusCode}`)
  if (result.FunctionError) {
    console.error(`Function error: ${result.FunctionError}`)
    if (payload) console.error(`Payload: ${payload}`)
    process.exit(1)
  }

  console.log('Scheduler invoked successfully.')
  console.log(
    'Check CloudWatch logs for deletion details, then wait a few seconds for the stream trigger to fire.',
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
