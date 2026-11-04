# LendFlow backend

This is the backend foundation for the Uganda Loan Management System. It follows the supplied modular-monolith specification and currently provides:

- Strict TypeScript Express API
- MongoDB/Mongoose connection
- Helmet, CORS, JSON request limits, rate limiting, and structured HTTP logging
- Consistent success/error response envelopes
- Staff login, JWT access tokens, rotating refresh tokens, logout, `/me`, and permission middleware
- Tenant/branch-scoped customers, document metadata, version-checked updates, and audit events
- Versioned loan products and server-validated loan application submission/decision boundaries
- Permission-protected audit and report summary endpoints
- Idempotent synchronisation operation intake with pending-review handling for offline repayment capture
- In-app notification retrieval and read-state endpoints
- Branch/staff assignment, credit assessment, collections, finance capture/confirmation/reversal, and OpenAPI JSON
- MongoDB transaction sessions for confirmation and reversal, Cloudinary signed media uploads, reconciliation, registered devices, and permission tests

## Cloudinary document storage

Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in the backend environment. The API exposes `POST /api/v1/documents/upload-signature`; the browser uploads directly to Cloudinary using the short-lived signature and stores only controlled metadata in MongoDB. Configure authenticated delivery and a Cloudinary moderation/malware workflow before making documents available to users.
- Health check at `GET /health`
- Readiness check at `GET /health/ready`; production readiness requires a MongoDB replica set.
- Password reset, email verification, password change, MFA enrollment/challenge, Cloudinary scan status, and IndexedDB sync contracts are exposed through the authenticated API.

## Run locally

```bash
cp .env.example .env
pnpm install
pnpm dev
```

For a local replica-set deployment, copy `backend/.env.example` to `backend/.env`, provide provider credentials, and run `docker compose up --build` from the repository root.

Use long random values for both JWT secrets. The API does not include credentials or database connection strings in source control.

The financial, lending, synchronisation, audit, notification, and reporting modules should be added behind their own route/service/repository boundaries. They must not be implemented by trusting browser-supplied balances, statuses, roles, branch IDs, or payment confirmation values.
