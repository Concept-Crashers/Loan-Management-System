import mongoose from 'mongoose'
import { env } from './env.js'

let replicaSetReady = false

export async function connectDatabase() {
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 5_000 })
  const hello = await mongoose.connection.db?.admin().command({ hello: 1 })
  replicaSetReady = Boolean(hello?.setName)
  if (env.MONGODB_REQUIRE_REPLICA_SET && !replicaSetReady) {
    await mongoose.disconnect()
    throw new Error('MongoDB replica set is required for transactional financial operations.')
  }
}

export async function disconnectDatabase() {
  replicaSetReady = false
  await mongoose.disconnect()
}

export function databaseReadiness() {
  return { connected: mongoose.connection.readyState === 1, replicaSet: replicaSetReady }
}
