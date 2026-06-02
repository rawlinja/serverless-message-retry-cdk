import { Temporal } from '@js-temporal/polyfill'
import { MessageRepository } from '../src/lib/message-repository'

const TABLE_NAME = process.env.TABLE_NAME ?? 'Messages'
const EMAIL = process.env.EMAIL
const RETRY_COUNT = parseInt(process.env.RETRY_COUNT ?? '0', 10)
const IMMEDIATE = process.env.IMMEDIATE === 'true'

const BASE_DELAY_MS = 3_600_000

const main = async () => {
  if (!EMAIL) {
    console.error('Missing required env var: EMAIL')
    process.exit(1)
  }

  const repository = new MessageRepository(TABLE_NAME)
  const createdAt = Temporal.Now.instant().toString({ smallestUnit: 'millisecond' })

  // IMMEDIATE=true sets expirationAt in the past so the scheduler picks it up on the next run
  const expirationAt = IMMEDIATE
    ? Temporal.Now.instant().subtract({ seconds: 1 }).toString({ smallestUnit: 'millisecond' })
    : Temporal.Now.instant()
        .add({ milliseconds: Math.pow(2, RETRY_COUNT) * BASE_DELAY_MS })
        .toString({ smallestUnit: 'millisecond' })

  const retryDate = Temporal.Instant.from(expirationAt).toZonedDateTimeISO('UTC').toPlainDate().toString()

  const message = {
    email: EMAIL,
    firstName: 'Smoke',
    lastName: 'Test',
    data: 'seed-retry script',
    createdAt,
    retryCount: RETRY_COUNT,
    expirationAt,
    retryDate,
  }

  console.log('Seeding retry record:')
  console.log(JSON.stringify(message, null, 2))

  await repository.create(message)

  console.log(`\nDone. retryDate: ${retryDate}, expirationAt: ${expirationAt}`)
  if (IMMEDIATE) {
    console.log('Record is immediately eligible — run invoke-scheduler.ts to trigger the cycle.')
  } else {
    console.log(`Record will be picked up by the scheduler on or after: ${retryDate}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
