import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1),
  MONGODB_REQUIRE_REPLICA_SET: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('30d'),
  FRONTEND_ORIGIN: z.string().min(1),
  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),
  CLOUDINARY_FOLDER: z.string().default('lendflow'),
  EMAIL_PROVIDER: z.enum(['console', 'smtp']).default('console'),
  SMS_PROVIDER: z.enum(['console', 'twilio']).default('console'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
}).superRefine((value, context) => {
  if (value.EMAIL_PROVIDER === 'smtp' && (!value.SMTP_HOST || !value.SMTP_USER || !value.SMTP_PASSWORD || !value.SMTP_FROM)) {
    context.addIssue({ code: 'custom', path: ['EMAIL_PROVIDER'], message: 'SMTP provider requires SMTP_HOST, SMTP_USER, SMTP_PASSWORD and SMTP_FROM.' })
  }
  if (value.SMS_PROVIDER === 'twilio' && (!value.TWILIO_ACCOUNT_SID || !value.TWILIO_AUTH_TOKEN || !value.TWILIO_FROM_NUMBER)) {
    context.addIssue({ code: 'custom', path: ['SMS_PROVIDER'], message: 'Twilio provider requires account SID, auth token and from number.' })
  }
  if (value.NODE_ENV === 'production' && !value.MONGODB_REQUIRE_REPLICA_SET) {
    context.addIssue({ code: 'custom', path: ['MONGODB_REQUIRE_REPLICA_SET'], message: 'Production requires MongoDB replica-set transaction checks.' })
  }
  if (value.NODE_ENV === 'production') {
    const origins = value.FRONTEND_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
    if (origins.length === 0 || (!origins.includes('*') && origins.some((o) => !o.startsWith('https://')))) {
      context.addIssue({ code: 'custom', path: ['FRONTEND_ORIGIN'], message: 'Production frontend origins must use HTTPS (comma-separated), or set * to allow all.' })
    }
  }
  if (value.NODE_ENV === 'production' && (value.JWT_ACCESS_SECRET.startsWith('replace-') || value.JWT_REFRESH_SECRET.startsWith('replace-'))) {
    context.addIssue({ code: 'custom', path: ['JWT_ACCESS_SECRET'], message: 'Production JWT secrets must be replaced with random values.' })
  }
})

export const env = schema.parse(process.env)

if (env.NODE_ENV === 'production' && (env.EMAIL_PROVIDER === 'console' || env.SMS_PROVIDER === 'console')) {
  throw new Error('Production requires configured email and SMS providers; console providers are development-only.')
}

export const cloudinaryConfigured = Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET)

if (env.NODE_ENV === 'production' && !cloudinaryConfigured) {
  throw new Error('Production requires Cloudinary credentials for secure document storage.')
}
