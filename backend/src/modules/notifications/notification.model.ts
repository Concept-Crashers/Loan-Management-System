import { model, Schema } from 'mongoose'

const notificationSchema = new Schema({
  tenantId: { type: String, required: true, index: true }, recipientId: { type: String, required: true, index: true },
  type: { type: String, required: true }, title: { type: String, required: true }, message: { type: String, required: true },
  readAt: { type: Date }, metadata: { type: Schema.Types.Mixed },
}, { timestamps: true })
notificationSchema.index({ recipientId: 1, readAt: 1, createdAt: -1 })
export const NotificationModel = model('Notification', notificationSchema)
