import { Logger } from '@aws-lambda-powertools/logger'
import { MessageRepository } from '@lib/message-repository'

const logger = new Logger({ serviceName: 'scheduler' })
const repository = new MessageRepository('Messages')

const handler = async (): Promise<void> => {
  const lookbackDays = parseInt(process.env.LOOKBACK_DAYS ?? '2', 10)
  const now = new Date().toISOString()
  let totalDeleted = 0

  for (let i = 0; i < lookbackDays; i++) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const retryDate = date.toISOString().split('T')[0]

    try {
      const expired = await repository.queryExpired(retryDate, now)

      for (const message of expired) {
        await repository.deleteMessage(message.pk, message.sk)
        totalDeleted++
        logger.info('Deleted expired message', {
          email: message.email,
          retryDate,
          expirationAt: message.expirationAt,
        })
      }
    } catch (error) {
      logger.error('Error processing date in lookback window, continuing', {
        retryDate,
        error,
      })
    }
  }

  logger.info('Scheduler complete', { totalDeleted, lookbackDays })
}

export { handler }
