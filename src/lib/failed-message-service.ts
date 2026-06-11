import { Logger } from '@aws-lambda-powertools/logger'
import { Temporal } from '@js-temporal/polyfill'
import { MessageRepository } from './message-repository'
import type { Message } from './types'

const logger = new Logger({ serviceName: 'failed-message-service' })
const repository = new MessageRepository('Messages')

export const MAX_RETRIES = 5
const BASE_DELAY_HOURS = 1

class FailedMessageService {
  async writeFailedMessage(message: Message) {
    const failed = this.buildFailedMessage(message)

    logger.info('Scheduling retry', {
      email: failed.email,
      retryCount: failed.retryCount,
      expirationAt: failed.expirationAt,
    })

    await repository.create(failed)
  }

  private buildFailedMessage(message: Message) {
    const retryCount = (message.retryCount ?? 0) + 1

    const backoff = Math.pow(2, retryCount - 1) * BASE_DELAY_HOURS

    const expirationInstant = Temporal.Now.instant().add({ hours: backoff })
    const expirationAt = expirationInstant.toString({ smallestUnit: 'millisecond' })

    const retryDate = expirationInstant.toZonedDateTimeISO('UTC').toPlainDate().toString()

    return {
      ...message,
      retryCount,
      expirationAt,
      retryDate,
    }
  }
}

export { FailedMessageService }
