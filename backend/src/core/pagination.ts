import type { FilterQuery, Model } from 'mongoose'

export function pagination(request: { query: Record<string, unknown> }) {
  const page = Math.max(1, Number(request.query.page ?? 1) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(request.query.pageSize ?? 25) || 25))
  const search = typeof request.query.search === 'string' ? request.query.search.trim() : ''
  return { page, pageSize, search, skip: (page - 1) * pageSize }
}

export async function paged<T>(model: Model<T>, filter: FilterQuery<T>, options: { page: number; pageSize: number; skip: number }, sort: Record<string, 1 | -1> = { createdAt: -1 }) {
  const [data, total] = await Promise.all([
    model.find(filter).sort(sort).skip(options.skip).limit(options.pageSize).lean(),
    model.countDocuments(filter),
  ])
  return { data, meta: { page: options.page, pageSize: options.pageSize, total, pageCount: Math.max(1, Math.ceil(total / options.pageSize)) } }
}
