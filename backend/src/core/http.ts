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

export function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction) {
  const httpError = error instanceof HttpError
    ? error
    : error instanceof ZodError
      ? new HttpError(400, 'VALIDATION_ERROR', 'Validation failed', error.issues)
      : new HttpError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.')
  response.status(httpError.status).json({ success: false, message: httpError.message, code: httpError.code, errors: httpError.errors })
}
