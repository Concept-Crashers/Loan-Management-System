import { model, Schema } from 'mongoose'

const notificationSchema = new Schema({
  tenantId: { type: String, required: true, index: true }, recipientId: { type: String, required: true, index: true },
  type: { type: String, required: true }, title: { type: String, required: true }, message: { type: String, required: true },
  readAt: { type: Date }, metadata: { type: Schema.Types.Mixed },
}, { timestamps: true })
notificationSchema.index({ recipientId: 1, readAt: 1, createdAt: -1 })
export const NotificationModel = model('Notification', notificationSchema)

const notificationDeliverySchema = new Schema({
  tenantId: { type: String, required: true, index: true }, notificationId: { type: Schema.Types.ObjectId, ref: 'Notification', required: true },
  channel: { type: String, enum: ['email', 'sms'], required: true }, destination: { type: String, required: true },
  status: { type: String, enum: ['queued', 'sent', 'failed', 'dead_letter'], default: 'queued', index: true },
  attempts: { type: Number, default: 0 }, nextAttemptAt: { type: Date, default: Date.now, index: true }, lastError: String,
}, { timestamps: true })
notificationDeliverySchema.index({ status: 1, nextAttemptAt: 1 })
export const NotificationDeliveryModel = model('NotificationDelivery', notificationDeliverySchema)
