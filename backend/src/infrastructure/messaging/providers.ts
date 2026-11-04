import { env } from '../../config/env.js'
import nodemailer from 'nodemailer'

export interface MessageProvider {
  send(input: { to: string; subject?: string; body: string }): Promise<{ accepted: boolean; provider: string }>
}

export class ConsoleEmailProvider implements MessageProvider {
  async send(input: { to: string; subject?: string; body: string }) {
    console.info(JSON.stringify({ channel: 'email', ...input }))
    return { accepted: true, provider: 'console' }
  }
}

export class ConsoleSmsProvider implements MessageProvider {
  async send(input: { to: string; body: string }) {
    console.info(JSON.stringify({ channel: 'sms', ...input }))
    return { accepted: true, provider: 'console' }
  }
}

class SmtpEmailProvider implements MessageProvider {
  private readonly transport = nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } })
  async send(input: { to: string; subject?: string; body: string }) {
    await this.transport.sendMail({ from: env.SMTP_FROM, to: input.to, subject: input.subject, text: input.body })
    return { accepted: true, provider: 'smtp' }
  }
}

class TwilioSmsProvider implements MessageProvider {
  async send(input: { to: string; body: string }) {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) throw new Error('Twilio SMS configuration is incomplete.')
    const body = new URLSearchParams({ To: input.to, From: env.TWILIO_FROM_NUMBER, Body: input.body })
    const authorization = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, { method: 'POST', headers: { Authorization: `Basic ${authorization}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body })
    if (!response.ok) throw new Error(`Twilio rejected the SMS with status ${response.status}.`)
    return { accepted: true, provider: 'twilio' }
  }
}

export const emailProvider: MessageProvider = env.EMAIL_PROVIDER === 'smtp' ? new SmtpEmailProvider() : new ConsoleEmailProvider()
export const smsProvider: MessageProvider = env.SMS_PROVIDER === 'twilio' ? new TwilioSmsProvider() : new ConsoleSmsProvider()
export const messagingConfiguration = { email: env.EMAIL_PROVIDER, sms: env.SMS_PROVIDER }
