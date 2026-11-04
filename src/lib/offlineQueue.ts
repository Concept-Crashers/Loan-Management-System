import { apiRequest } from './api'

export type OfflineOperation = {
  operationId: string
  batchId: string
  deviceId: string
  branchId: string
  entityType: string
  entityId: string
  operation: 'create' | 'update' | 'capture'
  payload: Record<string, unknown>
  createdAtClient: string
}

const databaseName = 'lendflow-offline'
const storeName = 'operations'

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'operationId' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Offline storage could not be opened.'))
  })
}

export async function queueOfflineOperation(operation: OfflineOperation) {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(storeName, 'readwrite').objectStore(storeName).put(operation)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('Offline operation could not be queued.'))
  })
}

export async function flushOfflineOperations() {
  const database = await openDatabase()
  const operations = await new Promise<OfflineOperation[]>((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).getAll()
    request.onsuccess = () => resolve(request.result as OfflineOperation[])
    request.onerror = () => reject(request.error ?? new Error('Offline operations could not be read.'))
  })
  if (!operations.length) return { acknowledged: 0 }
  const result = await apiRequest<{ acknowledgements: Array<{ operationId: string; status: string }> }>('/api/v1/sync/push', { method: 'POST', body: JSON.stringify({ operations }) })
  const acknowledged = result.acknowledgements.filter((item) => item.status !== 'rejected')
  const transaction = database.transaction(storeName, 'readwrite')
  for (const item of acknowledged) transaction.objectStore(storeName).delete(item.operationId)
  await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error) })
  return { acknowledged: acknowledged.length }
}
