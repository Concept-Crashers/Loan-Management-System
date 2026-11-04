# LendFlow backend

This is the backend foundation for the Uganda Loan Management System. It follows the supplied modular-monolith specification and currently provides:

- Strict TypeScript Express API
- MongoDB/Mongoose connection
- Helmet, CORS, JSON request limits, rate limiting, and structured HTTP logging
- Consistent success/error response envelopes
- Staff login, JWT access tokens, rotating refresh tokens, logout, `/me`, and permission middleware
- Health check at `GET /health`

## Run locally

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Use long random values for both JWT secrets. The API does not include credentials or database connection strings in source control.

The financial, lending, synchronisation, audit, notification, and reporting modules should be added behind their own route/service/repository boundaries. They must not be implemented by trusting browser-supplied balances, statuses, roles, branch IDs, or payment confirmation values.
