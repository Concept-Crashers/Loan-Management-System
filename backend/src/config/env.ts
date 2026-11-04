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
  FRONTEND_ORIGIN: z.string().url(),
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
})

export const env = schema.parse(process.env)

if (env.NODE_ENV === 'production' && (env.EMAIL_PROVIDER === 'console' || env.SMS_PROVIDER === 'console')) {
  throw new Error('Production requires configured email and SMS providers; console providers are development-only.')
}

export const cloudinaryConfigured = Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET)

if (env.NODE_ENV === 'production' && !cloudinaryConfigured) {
  throw new Error('Production requires Cloudinary credentials for secure document storage.')
}
