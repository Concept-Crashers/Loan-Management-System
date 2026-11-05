# Loan Management System User Guide

## 1. Signing in

1. Open the application URL.
2. Enter your work email and password.
3. Select **Sign in**.
4. Use the eye button in password fields to show or hide the password.
5. Select **Forgot password?** if you need a reset link.

Multi-factor authentication is optional and disabled by default. It is configured from **Profile & security**, not from the login form.

## 2. Understanding access

The navigation is permission-aware. Each user sees only the areas allowed by the permissions returned by the server. Direct API requests are also protected by backend permission checks; hiding a menu item is not the security boundary.

Typical responsibilities are:

| Role | Main responsibilities |
| --- | --- |
| Super Admin / Admin | Organisation settings, staff, branches, customers, products, reports and oversight |
| Manager | Portfolio oversight, application review, reports and collections supervision |
| Loan Officer | Customer registration, applications and borrower follow-up |
| Credit Officer | Credit assessments and application analysis |
| Approver | Application decisions within assigned approval limits |
| Cashier | Repayment capture and operational payment processing |
| Accountant | Journal, reconciliation and financial reporting |
| Collections Officer | Arrears follow-up, promises to pay and collections tasks |

If a required menu is missing, ask an administrator to review the user’s server-side role and permissions.

## 3. Creating the first system administrator

Run this command from the `backend` directory. It requires an active MongoDB connection and reads the password only from the environment:

```bash
SYSTEM_ADMIN_EMAIL=admin@example.com \
SYSTEM_ADMIN_NAME="System Administrator" \
SYSTEM_ADMIN_TENANT_ID=tenant-id \
SYSTEM_ADMIN_BRANCH_IDS=branch-id \
SYSTEM_ADMIN_PASSWORD='Use-a-new-12-character-password' \
npm run create-system-admin
```

The command refuses to overwrite an existing account. Use a secret manager in production rather than storing the password in shell history or a committed file.

## 3. Daily lending workflow

1. Register or locate the customer in **Customers**.
2. Upload required supporting documents in the customer or document workspace.
3. Create an application and select the approved loan product.
4. Complete the credit assessment and submit the application for review.
5. An authorised approver reviews the assessment and records the decision.
6. Authorised staff approve and execute the disbursement.
7. The system creates the loan account and repayment schedule after approval/disbursement.
8. Record repayments from **Repayments**. Payments are allocated by the financial workflow and remain subject to confirmation and reconciliation controls.

Financial actions should never be completed from a spreadsheet or by editing browser data. Use the server-backed workflow so tenant, branch, permission, idempotency and audit checks are applied.

Accounting users can review journal and cashbook entries, then settle open cashbook entries only after checking the external cash, bank or mobile-money evidence. Penalties, restructuring, refinancing, settlement and write-off actions require an authorised reason and remain in the loan event history.

## 4. Documents and privacy

Upload only documents required for the lending process. Documents remain unavailable while they are pending security scanning. Rejected or unscanned files must not be used as approved evidence.

Do not share document URLs, passwords, customer identifiers or exported reports outside approved channels. Document access and sensitive actions are recorded in the audit trail.

Documents under legal hold cannot be deleted. Expired, deleted, rejected or unscanned documents are blocked from download.

## 5. Offline and PWA use

The system can be installed from the browser as a PWA. The application shell remains available when the connection drops, and supported operations are placed in an encrypted browser queue for later submission.

Offline payment captures are pending operations, not final confirmations. Reconnect, review the queue, and wait for server acknowledgement before treating a financial action as complete.

Authorised users can review notification deliveries in the dead-letter queue and retry them after correcting a provider or destination problem. Offline synchronization conflicts must be resolved as local, server or manual decisions; queued financial captures remain pending review until confirmed by the server.

## 6. Settings and branding

Administrators can update organisation name, currency and branding from **Settings**. Saved tenant settings are loaded for authenticated users and applied across the workspace and authentication experience.

Changes to staff roles, branches, approval limits, financial controls, provider credentials or retention policies should be made through the administrator or deployment process.

## 7. Security practices

- Use a unique password and never share it.
- Sign out from shared devices.
- Enable MFA from **Profile & security** when required by organisational policy.
- Report unexpected permission changes, duplicate payments, suspicious documents or incorrect balances immediately.
- Treat the readiness endpoint, logs, metrics, backups and provider credentials as administrator-only infrastructure.

## 8. Administrator release checklist

Before processing real borrower data or money, configure and verify:

- Production MongoDB replica-set deployment.
- SMTP/SMS provider credentials and delivery monitoring.
- Cloudinary private storage, signed webhooks and malware scanning.
- Secret management, TLS, backups and restore drills.
- Metrics, alerts, tracing, log retention and incident response.
- MongoDB integration, browser E2E, accessibility, load and financial-concurrency tests.
