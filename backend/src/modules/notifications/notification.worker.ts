import { NotificationDeliveryModel, NotificationModel } from './notification.model.js'
import { emailProvider, smsProvider } from '../../infrastructure/messaging/providers.js'

export async function processNotificationDeliveries(limit = 25) {
  const jobs = await NotificationDeliveryModel.find({ status: 'queued', nextAttemptAt: { $lte: new Date() } }).sort({ nextAttemptAt: 1 }).limit(limit)
  for (const job of jobs) {
    try {
      const notification = await NotificationModel.findById(job.notificationId).lean()
      if (!notification) throw new Error('Notification record was not found.')
      const provider = job.channel === 'email' ? emailProvider : smsProvider
      await provider.send({ to: job.destination, subject: notification.title, body: notification.message })
      job.status = 'sent'
      job.attempts += 1
      job.lastError = undefined
    } catch (error) {
      job.attempts += 1
      job.lastError = error instanceof Error ? error.message : 'Notification delivery failed.'
      job.status = job.attempts >= 5 ? 'dead_letter' : 'queued'
      job.nextAttemptAt = new Date(Date.now() + Math.min(60 * 60 * 1000, 2 ** job.attempts * 10_000))
    }
    await job.save()
  }
  return jobs.length
}
