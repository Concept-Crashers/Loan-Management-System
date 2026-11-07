import { app } from './app.js'
import { connectDatabase } from './config/database.js'
import { disconnectDatabase } from './config/database.js'
import { env } from './config/env.js'
import { processNotificationDeliveries } from './modules/notifications/notification.worker.js'

await connectDatabase()
const server = app.listen(env.PORT, () => {
  console.log(`Trust Loans API listening on port ${env.PORT}`)
})
const notificationWorker = setInterval(() => { void processNotificationDeliveries().catch((error) => console.error('Notification worker failed', error)) }, 10_000)

async function shutdown(signal: string) {
  console.log(`${signal} received; shutting down gracefully`)
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  clearInterval(notificationWorker)
  await disconnectDatabase()
}

process.once('SIGTERM', () => void shutdown('SIGTERM'))
process.once('SIGINT', () => void shutdown('SIGINT'))
