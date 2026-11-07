import { v2 as cloudinary } from 'cloudinary'
import { cloudinaryConfigured, env } from '../../config/env.js'
import { HttpError } from '../../core/http.js'

if (cloudinaryConfigured) {
  cloudinary.config({ cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, secure: true })
}

export function createDocumentUploadSignature(input: { tenantId: string; customerId?: string; scope?: string }) {
  if (!cloudinaryConfigured) throw new HttpError(503, 'MEDIA_NOT_CONFIGURED', 'Cloudinary media storage is not configured.')
  const timestamp = Math.floor(Date.now() / 1000)
  const folder = `${env.CLOUDINARY_FOLDER}/${input.tenantId}/${input.scope ?? (input.customerId ? 'customers' : 'general')}/${input.customerId ?? 'general'}`
  const signature = cloudinary.utils.api_sign_request({ timestamp, folder, type: 'authenticated' }, env.CLOUDINARY_API_SECRET!)
  return { cloudName: env.CLOUDINARY_CLOUD_NAME, apiKey: env.CLOUDINARY_API_KEY, timestamp, folder, type: 'authenticated', signature }
}

export async function inspectUploadedDocument(publicId: string) {
  if (!cloudinaryConfigured) throw new HttpError(503, 'MEDIA_NOT_CONFIGURED', 'Cloudinary media storage is not configured.')
  return cloudinary.api.resource(publicId, { resource_type: 'auto', type: 'authenticated' })
}
