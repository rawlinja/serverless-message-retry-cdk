import {
  CloudWatchLogsClient,
  DescribeLogStreamsCommand,
  GetLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs'

const FUNCTION_NAME = process.env.FUNCTION_NAME
const MINUTES = parseInt(process.env.MINUTES ?? '5', 10)
const FILTER = process.env.FILTER

const main = async () => {
  if (!FUNCTION_NAME) {
    console.error('Missing required env var: FUNCTION_NAME')
    process.exit(1)
  }

  const logGroupName = `/aws/lambda/${FUNCTION_NAME}`
  const client = new CloudWatchLogsClient({ region: 'us-east-1' })
  const since = Date.now() - MINUTES * 60 * 1000

  const streamsResult = await client.send(
    new DescribeLogStreamsCommand({
      logGroupName,
      orderBy: 'LastEventTime',
      descending: true,
      limit: 5,
    }),
  )

  const streams = (streamsResult.logStreams ?? []).filter(
    (s) => (s.lastEventTimestamp ?? 0) >= since,
  )

  if (streams.length === 0) {
    console.log(`No log streams with activity in the last ${MINUTES} minute(s) for ${FUNCTION_NAME}`)
    return
  }

  for (const stream of streams) {
    const eventsResult = await client.send(
      new GetLogEventsCommand({
        logGroupName,
        logStreamName: stream.logStreamName!,
        startTime: since,
        startFromHead: true,
      }),
    )

    const events = eventsResult.events ?? []
    const filtered = FILTER
      ? events.filter((e) => e.message?.includes(FILTER))
      : events

    for (const event of filtered) {
      const time = new Date(event.timestamp!).toISOString()
      try {
        const parsed = JSON.parse(event.message!)
        console.log(`[${time}] ${parsed.level ?? ''} ${parsed.message ?? event.message}`, parsed.email ? `(${parsed.email})` : '')
      } catch {
        console.log(`[${time}] ${event.message?.trim()}`)
      }
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
