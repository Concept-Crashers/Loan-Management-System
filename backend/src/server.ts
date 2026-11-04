import { app } from './app.js'
import { connectDatabase } from './config/database.js'
import { disconnectDatabase } from './config/database.js'
import { env } from './config/env.js'

await connectDatabase()
const server = app.listen(env.PORT, () => {
  console.log(`LendFlow API listening on port ${env.PORT}`)
})

async function shutdown(signal: string) {
  console.log(`${signal} received; shutting down gracefully`)
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  await disconnectDatabase()
}

process.once('SIGTERM', () => void shutdown('SIGTERM'))
process.once('SIGINT', () => void shutdown('SIGINT'))
