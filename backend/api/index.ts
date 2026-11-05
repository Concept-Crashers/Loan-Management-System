import { app } from '../src/app.js'
import { connectDatabase } from '../src/config/database.js'

let ready: Promise<void> | null = null
function ensureDb() {
  if (!ready) ready = connectDatabase()
  return ready
}

export default async function handler(req: any, res: any) {
  await ensureDb()
  return app(req, res)
}
