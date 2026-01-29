import { Logger } from '@aws-lambda-powertools/logger'

const logger = new Logger({ serviceName: 'scheduler' })

const handler = async () => {
  logger.info('Scheduler triggered')
}

export { handler }
