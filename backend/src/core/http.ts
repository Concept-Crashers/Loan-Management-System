import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly errors: unknown[] = []) {
    super(message)
  }
}

export function asyncRoute(handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => {
    void handler(request, response, next).catch(next)
  }
}

function isCastError(error: unknown): error is { name: string; path?: string; value?: unknown } {
  return !!error && typeof error === 'object' && (error as { name?: string }).name === 'CastError'
}

export function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction) {
  if (process.env.NODE_ENV !== 'production') console.error('[http]', error)
  const httpError = error instanceof HttpError
    ? error
    : error instanceof ZodError
      ? new HttpError(400, 'VALIDATION_ERROR', 'Validation failed', error.issues)
      : isCastError(error)
        ? new HttpError(400, 'INVALID_ID', `Invalid identifier${error.path ? ` for ${error.path}` : ''}.`)
        : new HttpError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.')
  response.status(httpError.status).json({ success: false, message: httpError.message, code: httpError.code, errors: httpError.errors })
}
