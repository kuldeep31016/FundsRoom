# Mini ERP + CRM Operations Portal

An internal operations portal for a wholesale/distribution business: customer CRM, product and
inventory management, and sales challans whose confirmation deducts stock transactionally.

Built with **Node.js · TypeScript · Express · PostgreSQL** on the backend and
**React · TypeScript · Vite** on the frontend, with JWT authentication and role-based access
enforced server-side.

---

## Table of contents

- [Business context](#business-context)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Database design](#database-design)
- [Authentication](#authentication)
- [Role-based access](#role-based-access)
- [Business rules](#business-rules)
- [API documentation](#api-documentation)
- [Environment variables](#environment-variables)
- [Local setup](#local-setup)
- [Testing](#testing)
- [Deployment](#deployment)
- [Live URLs](#live-urls)
- [Test credentials](#test-credentials)
- [Assumptions](#assumptions)
- [Known limitations](#known-limitations)
- [Future improvements](#future-improvements)

---

## Business context

The company deals with customers, products, stock and sales challans, and is used by internal
staff across sales, warehouse, accounts and administration.

The operational flow the system models:

1. **Sales** capture leads, convert them to customers and log follow-ups.
2. **Warehouse** maintain the product catalogue and record stock received or issued.
3. **Sales** raise a challan for a customer with one or more products.
4. Saving as a **draft** changes nothing in inventory. **Confirming** deducts stock and writes an
   audit trail entry per line — atomically.
5. **Accounts** have read-only visibility across every module for reporting.

---

## Features

**Authentication and roles**
- JWT login, bcrypt password hashing, protected API routes and protected frontend routes
- Four roles (Admin, Sales, Warehouse, Accounts) with a permission matrix enforced by the server

**Customer CRM**
- All required fields, with GST optional and validated as a real 15-character GSTIN
- Add, edit, server-side search (name, business, mobile, email, GST), filters, pagination
- Customer detail page and an append-only follow-up activity log that can advance the next
  follow-up date in the same transaction

**Products and inventory**
- Full product master with unique SKU, unit price, current stock, minimum alert quantity, location
- Low-stock detection and filtering
- Append-only stock movement ledger recording product, signed quantity change, IN/OUT type,
  reason, before/after balance, actor and timestamp
- Stock can only ever change through the movement service, so the ledger always explains the balance

**Sales challans**
- Customer selection, multiple products with per-line quantities, automatic challan numbering
- Draft / Confirmed / Cancelled lifecycle with confirm and cancel flows
- Product snapshots so historical documents never change when the catalogue does
- Transactional confirmation: stock validation, deduction, movement logging and status change
  all succeed together or not at all
- **PDF export** — a printable A4 delivery challan rendered from the stored snapshot, with a
  company letterhead, status watermark for draft/cancelled documents, pagination and signature
  blocks

**Product images**
- Optional photo per product, uploaded **directly to S3** via a presigned URL so files
  never pass through the API process
- Works against AWS S3 in production and MinIO locally — identical code, one env var apart
- Degrades gracefully: with no bucket configured the endpoints return a clear 503 and the
  uploader is hidden, so the rest of the portal is unaffected

**Dashboard**
- Aggregated counters, inventory valuation, low-stock watchlist, due follow-ups, recent challans

**UX**
- Loading, empty, error and success states throughout; inline form validation; confirmation
  dialogs for stock-affecting actions; responsive layout down to 375 px

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js 20 | Assignment requirement |
| Language | TypeScript (strict) | Type safety across both apps |
| API | Express 4 | Assignment requirement; small and explicit |
| Database | PostgreSQL 16 | Assignment requirement; transactions and row locks are central here |
| DB access | `pg` with hand-written SQL | Transactions, `SELECT … FOR UPDATE` and constraints are visible rather than hidden behind an ORM |
| Validation | Zod | One schema per endpoint, coerced and typed |
| Auth | `jsonwebtoken` + `bcryptjs` | Stateless JWT; pure-JS bcrypt avoids native build issues on free hosts |
| PDF | `pdfkit` | Server-side challan rendering with no headless browser to host |
| Object storage | `@aws-sdk/client-s3` | Presigned direct-to-S3 uploads; MinIO for local dev and tests |
| Frontend | React 18 + Vite | Assignment requirement; fast builds |
| Routing | React Router 6 | Standard SPA routing |
| Styling | Hand-written CSS with design tokens | No UI framework needed for this surface area; keeps the bundle small |
| Testing | Vitest + Supertest | Integration tests against a real PostgreSQL instance |

**Dependency policy:** no state-management library, no UI kit, no HTTP client library — React
context, the platform `fetch` and a small typed API wrapper cover the requirements. Every
dependency in `package.json` is used by the application.

---

## Architecture

```
┌────────────────────┐        HTTPS / JSON        ┌────────────────────────┐
│   React SPA        │ ─────────────────────────▶ │   Express REST API     │
│   (Vite build)     │   Authorization: Bearer    │   /api/v1              │
│                    │ ◀───────────────────────── │                        │
└────────────────────┘   { success, data, meta }  └───────────┬────────────┘
                                                              │ pg pool
                                                              ▼
                                                  ┌────────────────────────┐
                                                  │      PostgreSQL        │
                                                  │  constraints · enums   │
                                                  │  row locks · triggers  │
                                                  └────────────────────────┘
```

### Request lifecycle

```
Route → authenticate (JWT) → requirePermission (RBAC) → validate (Zod)
      → controller (HTTP concerns) → service (business rules, transactions)
      → repository (SQL) → PostgreSQL
                                   ↓ any thrown error
                        centralised error middleware → consistent JSON envelope
```

Each layer has one job:

- **Routes** declare the endpoint and the middleware chain.
- **Controllers** translate between HTTP and the service layer; they contain no business rules.
- **Services** own the business rules and transaction boundaries.
- **Repositories** contain SQL and nothing else.
- **Middleware** handles authentication, authorization, validation and error translation.

### Why raw SQL rather than an ORM

The core requirement of this assignment is that confirming a challan must deduct stock correctly
and never partially. That behaviour depends on an explicit transaction, `SELECT … FOR UPDATE` row
locks acquired in a deterministic order, and database `CHECK` constraints as a final backstop.
Writing that SQL directly makes the guarantee auditable in review instead of depending on an ORM's
implicit behaviour.

### Consistent response envelope

```jsonc
// success
{ "success": true, "data": { ... } }

// paginated list
{ "success": true, "data": [ ... ],
  "meta": { "page": 1, "limit": 10, "total": 57, "totalPages": 6, "hasNext": true, "hasPrev": false } }

// error
{ "success": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Insufficient stock — CleanMax Dishwash Gel 500ml (CLN-DISH-500): requested 50, available 12. No stock has been deducted.",
    "details": [{ "field": "items.0.quantity", "message": "Quantity must be greater than zero" }],
    "meta": { "shortfalls": [ ... ] }
  },
  "requestId": "9f0c…" }
```

The frontend switches on `error.code`, maps `error.details` onto form fields, and renders
`error.meta` (for example the per-product shortfall list) in the confirmation dialog.

---

## Project structure

```
.
├── backend/
│   ├── migrations/                 # Ordered, checksum-verified SQL migrations
│   │   ├── 001_core_and_users.sql
│   │   ├── 002_customers.sql
│   │   ├── 003_products_and_stock.sql
│   │   └── 004_challans.sql
│   ├── src/
│   │   ├── config/
│   │   │   ├── env.ts              # Validated environment (the only place reading process.env)
│   │   │   └── permissions.ts      # Role → permission matrix (single source of truth)
│   │   ├── db/
│   │   │   ├── pool.ts             # Connection pool + withTransaction helper
│   │   │   ├── migrator.ts         # Migration runner
│   │   │   ├── seed.ts             # Demo data
│   │   │   └── cli/                # `npm run migrate` / `npm run seed`
│   │   ├── middleware/             # auth, RBAC, validation, errors, request context
│   │   ├── modules/                # One folder per domain
│   │   │   ├── auth/               # *.routes / *.controller / *.service / *.schema
│   │   │   ├── customers/          # + *.repository
│   │   │   ├── products/
│   │   │   ├── stock/
│   │   │   ├── challans/
│   │   │   ├── dashboard/
│   │   │   └── users/
│   │   ├── routes/index.ts         # Mounts every module under /api/v1
│   │   ├── types/                  # Domain types + Express request augmentation
│   │   ├── utils/                  # ApiError, HTTP helpers, serializers, logger
│   │   ├── validation/common.ts    # Reusable Zod primitives
│   │   ├── app.ts                  # Express app assembly (testable, no listen)
│   │   └── server.ts               # Bootstrap, health check, graceful shutdown
│   └── tests/                      # Integration suite (Vitest + Supertest)
│
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── layout/             # AppLayout (shell + nav), ProtectedRoute
│       │   └── ui/                 # Shared component library + EntityPicker
│       ├── context/                # AuthContext, ToastContext
│       ├── hooks/useApiResource.ts # Data fetching with abort + loading/error state
│       ├── lib/                    # API client, formatting, client-side validation
│       ├── pages/                  # One folder per module
│       ├── styles/                 # Design tokens + application styles
│       ├── types/api.ts            # API response types (mirrors the backend serializers)
│       └── App.tsx                 # Route table only
│
├── docs/
│   └── erp-crm-api.postman_collection.json
├── docker/initdb/                  # Creates the test database on first container start
├── .github/workflows/ci.yml        # Typecheck, migrate, test, build, secret check
├── docker-compose.yml              # Local PostgreSQL (+ optional full stack)
└── render.yaml                     # One-click Render blueprint (DB + API + web)
```

---

## Database design

Seven application tables plus a challan-number sequence table and the migration ledger.

```
users ──┬──< customers ──< customer_follow_ups
        │        │
        │        └──────────< challans ──< challan_items >── products
        │                         │                            │
        └──< stock_movements >────┘────────────────────────────┘
                (reference_type = 'CHALLAN', reference_id = challans.id)
```

| Table | Purpose | Key constraints |
|---|---|---|
| `users` | Portal accounts | Unique `lower(email)`; `user_role` enum |
| `customers` | CRM master | `customer_type` / `customer_status` enums; mobile format `CHECK`; GSTIN format `CHECK`; unique `upper(gst_number)` where not null |
| `customer_follow_ups` | Append-only activity log | FK → customers `ON DELETE CASCADE` |
| `products` | Catalogue | Unique `sku`; **`CHECK (current_stock >= 0)`**; SKU format `CHECK` |
| `stock_movements` | Append-only ledger | `stock_movement_type` enum; `CHECK (quantity > 0)`; generated signed `quantity_change`; `stock_before` / `stock_after` |
| `challans` | Challan header | Unique `challan_number`; `challan_status` enum; `CHECK` that CONFIRMED/CANCELLED rows carry their timestamp |
| `challan_items` | Lines + product snapshot | `CHECK (quantity > 0)`; generated `line_total`; unique `(challan_id, product_id)` |
| `challan_number_sequences` | Per-year counter | Single-row atomic upsert |

**Design notes**

- **`CHECK (current_stock >= 0)`** means no code path — application bug, manual SQL or race — can
  produce negative stock. The service layer returns a friendly 409 first; the constraint is the backstop.
- **`quantity_change`** is a generated column (`+q` for IN, `-q` for OUT) so the ledger sums to the
  current balance and can be reconciled.
- **Snapshot columns** on `challan_items` (`product_name`, `product_sku`, `product_category`,
  `product_location`, `unit_price`) are written once and never updated.
- **Indexes** cover every filter and sort exposed by the API: status/type/date/foreign keys, plus
  `pg_trgm` GIN indexes for the `ILIKE` search endpoints and a partial index for the low-stock query.
  `pg_trgm` creation is wrapped so the migration still succeeds on hosts that restrict extensions.
- **`updated_at`** is maintained by a database trigger rather than trusted to application code.

### Migrations

`backend/migrations/*.sql` run in filename order, each inside its own transaction, tracked in
`schema_migrations` with a SHA-256 checksum. Editing an already-applied migration fails loudly
rather than silently diverging.

```bash
npm run migrate          # apply pending migrations
npm run migrate:status   # show applied vs pending
npm run db:reset         # drop, re-migrate and re-seed (destructive)
```

---

## Authentication

- `POST /auth/login` verifies the password with bcrypt and returns a signed JWT plus the user's
  permission list.
- The token is sent as `Authorization: Bearer <jwt>`; `authenticate` middleware verifies signature,
  issuer and expiry and populates `req.user`.
- The SPA stores the token in `localStorage` and rehydrates the session through `GET /auth/me`,
  which re-reads the user so a deactivated account loses access immediately.
- Any `401` from the API clears the session and returns the user to the login screen.
- Unknown email and wrong password both return the same generic `401`, so the endpoint cannot be
  used to enumerate accounts. Login is additionally rate-limited.

---

## Role-based access

The assignment names the four roles but does not define their permissions, so the matrix below is
a documented, business-sensible interpretation. It lives in `backend/src/config/permissions.ts`
and is the single source of truth: the API enforces it, and the frontend reads the same permission
names only to hide controls a user cannot use.

| Capability | Admin | Sales | Warehouse | Accounts |
|---|:--:|:--:|:--:|:--:|
| View dashboard | ✅ | ✅ | ✅ | ✅ |
| View customers / products / stock / challans | ✅ | ✅ | ✅ | ✅ |
| Create & edit customers | ✅ | ✅ | ❌ | ❌ |
| Add follow-up notes | ✅ | ✅ | ❌ | ❌ |
| Create & edit products | ✅ | ❌ | ✅ | ❌ |
| Record stock movements | ✅ | ❌ | ✅ | ❌ |
| Create & edit challans | ✅ | ✅ | ❌ | ❌ |
| Confirm challans (dispatch) | ✅ | ✅ | ✅ | ❌ |
| Cancel challans | ✅ | ✅ | ✅ | ❌ |
| Manage users | ✅ | ❌ | ❌ | ❌ |

> **Frontend restrictions are UX only.** A request crafted by hand with a valid Accounts token is
> rejected by the server with `403 FORBIDDEN`. This is covered by 75 automated RBAC assertions and
> can be reproduced with the *Role-based access (403 proofs)* folder in the Postman collection.

---

## Business rules

Implemented in `backend/src/modules/challans/challan.service.ts` and
`backend/src/modules/stock/stock.service.ts`.

| # | Rule | How it is guaranteed |
|---|---|---|
| 1 | A confirmed challan reduces stock | `confirm` posts one OUT movement per line through the stock service |
| 2 | Stock can never go negative | Service check → row lock → database `CHECK (current_stock >= 0)` |
| 3 | Insufficient stock returns a proper error | `409 INSUFFICIENT_STOCK` listing **every** short line with requested/available/shortfall |
| 4 | No partial stock updates | All lines are validated *before* any deduction, and the whole unit of work is one transaction |
| 5 | A draft challan does not reduce stock | Availability is only enforced, and movements only posted, on confirmation |
| 6 | Challans store a product snapshot | Name, SKU, category, location and unit price are copied onto each line at creation |
| 7 | Confirmation is transactional | Number allocation, header, items, validation, deduction, ledger writes and status change share one `BEGIN … COMMIT` |

**Worked example** (from the specification, verified end to end):

```
Product stock = 20
Create draft challan, quantity 5      → stock stays 20, no movement written
Confirm the challan                   → stock becomes 15
                                        movement: OUT, qty 5, 20 → 15,
                                        reason "Sales Challan CH-2026-000004",
                                        created_by = logged-in user, timestamped
Confirm again                         → 409 INVALID_STATE_TRANSITION, stock stays 15
Request 25 against stock of 20        → 409 INSUFFICIENT_STOCK, stock unchanged, nothing written
Cancel a confirmed challan            → stock returned with an IN movement
```

Additional safeguards:

- Products are locked in a deterministic order (sorted by id) so concurrent confirmations queue
  instead of deadlocking. A test confirms two simultaneous 8-unit challans against 10 units of
  stock resolve to exactly one `200` and one `409`, ending at 2 units.
- Challan numbers are allocated by a single atomic upsert (`CH-<year>-<6 digits>`), with a unique
  index as a second line of defence. Verified under concurrent creation.
- Only DRAFT challans are editable; editing a CONFIRMED or CANCELLED challan returns `409`.

---

## API documentation

Base URL: `/api/v1` · All endpoints except `/health`, `/meta/roles` and `/auth/login` require a JWT.

A **Postman collection with 59 requests** — including validation failures, 404s, 409s and a
role-based-access folder that demonstrates real `403` responses — is at
[`docs/erp-crm-api.postman_collection.json`](docs/erp-crm-api.postman_collection.json).
Import it, set `baseUrl`, run **Auth → Login (Admin)**, and the token and created record ids are
captured automatically for the remaining requests.

### Endpoints

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/health` | public | Liveness + database check |
| `GET` | `/meta/roles` | public | Role → permission matrix |
| `POST` | `/auth/login` | public | Sign in, returns JWT |
| `GET` | `/auth/me` | authenticated | Current user + permissions |
| `POST` | `/auth/logout` | authenticated | Ends the client session |
| `GET` | `/customers` | `customers:read` | List; `?page&limit&search&status&type&followUpBefore&sortBy&sortOrder` |
| `POST` | `/customers` | `customers:write` | Create customer |
| `GET` | `/customers/:id` | `customers:read` | Customer detail |
| `PATCH`/`PUT` | `/customers/:id` | `customers:write` | Partial update |
| `GET` | `/customers/:id/follow-ups` | `customers:read` | Paginated follow-up log |
| `POST` | `/customers/:id/follow-ups` | `customers:followup:write` | Add note, optionally set next follow-up |
| `GET` | `/products` | `products:read` | List; `?page&limit&search&category&lowStock&isActive&sortBy&sortOrder` |
| `GET` | `/products/categories` | `products:read` | Distinct categories |
| `POST` | `/products` | `products:write` | Create product (opening stock posted as IN) |
| `GET` | `/products/:id` | `products:read` | Product detail |
| `PATCH`/`PUT` | `/products/:id` | `products:write` | Update (stock excluded by design) |
| `GET` | `/products/:id/stock-movements` | `stock:read` | Per-product ledger |
| `GET` | `/stock/movements` | `stock:read` | Ledger; `?page&limit&search&productId&movementType&referenceType&from&to` |
| `POST` | `/stock/movements` | `stock:write` | Record an IN/OUT movement |
| `GET` | `/challans` | `challans:read` | List; `?page&limit&search&status&customerId&createdBy&from&to&sortBy&sortOrder` |
| `POST` | `/challans` | `challans:write` | Create as DRAFT or CONFIRMED |
| `GET` | `/challans/:id` | `challans:read` | Header + line items |
| `PATCH`/`PUT` | `/challans/:id` | `challans:write` | Edit (DRAFT only) |
| `POST` | `/challans/:id/confirm` | `challans:confirm` | Confirm and deduct stock |
| `POST` | `/challans/:id/cancel` | `challans:cancel` | Cancel, returning stock if confirmed |
| `GET` | `/challans/:id/pdf` | `challans:read` | Download the challan as a printable PDF |
| `POST` | `/products/:id/image/upload-url` | `products:write` | Presign a direct-to-S3 image upload |
| `POST` | `/products/:id/image` | `products:write` | Attach the uploaded object to the product |
| `DELETE` | `/products/:id/image` | `products:write` | Remove the image and delete the object |
| `GET` | `/dashboard/summary` | `dashboard:read` | Aggregated dashboard payload |
| `GET` | `/users` | `users:read` | List portal accounts |
| `POST` | `/users` | `users:write` | Create a portal account |

### HTTP status codes

| Code | Used for |
|---|---|
| `200` | Successful read or update |
| `201` | Successful creation |
| `400` | Validation failure, malformed UUID, malformed JSON |
| `401` | Missing, malformed, invalid or expired token; bad credentials |
| `403` | Authenticated but the role lacks the permission; deactivated account |
| `404` | Resource or route not found |
| `409` | Duplicate SKU/GST/email, insufficient stock, invalid state transition |
| `429` | Rate limit exceeded |
| `500` | Unexpected server error (details logged, never returned) |

### Error codes

`VALIDATION_ERROR` · `INVALID_CREDENTIALS` · `UNAUTHENTICATED` · `TOKEN_EXPIRED` · `TOKEN_INVALID` ·
`FORBIDDEN` · `ACCOUNT_DISABLED` · `NOT_FOUND` · `CONFLICT` · `DUPLICATE_SKU` · `DUPLICATE_EMAIL` ·
`INSUFFICIENT_STOCK` · `INVALID_STATE_TRANSITION` · `MALFORMED_JSON` · `RATE_LIMITED` ·
`INTERNAL_ERROR`

---

## Environment variables

No secret is committed. `.env` is git-ignored; `.env.example` documents every variable in both apps.

### Backend — `backend/.env`

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development` \| `test` \| `production` |
| `PORT` | no | `4000` | HTTP port (injected by Render/Railway) |
| `LOG_LEVEL` | no | `info` | `debug` \| `info` \| `warn` \| `error` \| `silent` |
| `DATABASE_URL` | **yes** | — | PostgreSQL connection string |
| `DATABASE_SSL` | no | `false` | `true` for Neon/Supabase/Render |
| `DATABASE_POOL_MAX` | no | `10` | Max pooled connections (use `5` on free tiers) |
| `TEST_DATABASE_URL` | for tests | — | Separate database; the suite drops and recreates its schema |
| `JWT_SECRET` | **yes** | — | Min. 16 chars. Generate with `openssl rand -base64 48` |
| `JWT_EXPIRES_IN` | no | `8h` | Token lifetime |
| `BCRYPT_SALT_ROUNDS` | no | `10` | Password hashing cost |
| `CORS_ORIGINS` | no | `http://localhost:5173` | Comma-separated allowed browser origins |
| `RATE_LIMIT_WINDOW_MS` | no | `900000` | Rate-limit window |
| `RATE_LIMIT_MAX` | no | `300` | Requests per window |
| `AUTH_RATE_LIMIT_MAX` | no | `20` | Stricter budget for `POST /auth/login` |
| `SEED_DEFAULT_PASSWORD` | no | `Password@123` | Password given to seeded demo users |
| `COMPANY_NAME` | no | `Shreeji Wholesale Distributors` | Letterhead name on generated challan PDFs |
| `COMPANY_ADDRESS` | no | *(sample address)* | Letterhead address |
| `COMPANY_GSTIN` | no | *(sample GSTIN)* | Letterhead GSTIN |
| `COMPANY_PHONE` | no | *(sample number)* | Letterhead phone |
| `COMPANY_EMAIL` | no | *(sample address)* | Letterhead email |
| `S3_BUCKET` | no | — | Bucket for product images. **Leave unset to disable image upload.** |
| `S3_REGION` | no | `ap-south-1` | AWS region |
| `S3_ACCESS_KEY_ID` | no | — | Access key (required with `S3_BUCKET`) |
| `S3_SECRET_ACCESS_KEY` | no | — | Secret key (required with `S3_BUCKET`) |
| `S3_ENDPOINT` | no | — | Only for S3-compatible services such as MinIO; **leave unset for AWS** |
| `S3_FORCE_PATH_STYLE` | no | `false` | `true` for MinIO |
| `S3_PUBLIC_BASE_URL` | no | — | CDN/bucket URL. When unset, presigned GET URLs are issued |
| `S3_UPLOAD_URL_TTL_SECONDS` | no | `300` | Lifetime of an upload URL |
| `S3_MAX_UPLOAD_BYTES` | no | `5242880` | Maximum image size (5 MB) |

The application validates this configuration with Zod at boot and refuses to start on a missing or
invalid value, rather than failing confusingly later. Nothing outside `src/config/env.ts` reads
`process.env`.

### Frontend — `frontend/.env`

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_BASE_URL` | **yes** in production | `http://localhost:4000/api/v1` | Backend base URL **including** `/api/v1` |
| `VITE_APP_NAME` | no | `ERP + CRM Portal` | Display name |

> Vite inlines `VITE_*` variables at **build time**. Changing the API URL requires a rebuild, and
> nothing secret may be placed here — everything ships in the browser bundle.

---

## Local setup

**Prerequisites:** Node.js 20+, and either Docker (recommended) or a local PostgreSQL 16.

### 1. Clone and configure

```bash
git clone https://github.com/kuldeep31016/FundsRoom.git
cd FundsRoom
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Generate a JWT secret and paste it into `backend/.env`:

```bash
openssl rand -base64 48
```

### 2. Start PostgreSQL

```bash
docker compose up -d db storage storage-init
```

This starts PostgreSQL 16 on **port 5433** (chosen to avoid clashing with an existing local
install) and creates both `erp_crm` and `erp_crm_test`. The defaults in `backend/.env.example`
already point at it. It also starts MinIO on **port 9000** (console on 9001) and creates the
product-image bucket, so the image-upload feature works locally without an AWS account.

<details>
<summary>Using an existing PostgreSQL install instead</summary>

```bash
createdb erp_crm
createdb erp_crm_test
# then set DATABASE_URL / TEST_DATABASE_URL in backend/.env accordingly
```
</details>

### 3. Run the backend

```bash
cd backend
npm install
npm run migrate     # create the schema
npm run seed        # demo users, customers, products and challans
npm run dev         # http://localhost:4000
```

Verify: `curl http://localhost:4000/api/v1/health` → `{"success":true,...,"database":"connected"}`

### 4. Run the frontend

```bash
cd frontend
npm install
npm run dev         # http://localhost:5173
```

Open <http://localhost:5173> and sign in with any account from
[Test credentials](#test-credentials) — the login screen lists them and fills the form on click.

### Production builds

```bash
cd backend  && npm run build && npm start    # compiles to dist/, serves from dist/server.js
cd frontend && npm run build && npm run preview   # static build in dist/
```

---

## Testing

**246 integration tests across 9 files**, run against a real PostgreSQL database so constraints,
transactions and row locks are genuinely exercised.

```bash
cd backend
npm test              # full suite
npm run test:watch    # watch mode
```

The suite creates its schema from the real migration files in `erp_crm_test` and never touches
development data.

| File | Tests | Covers |
|---|---:|---|
| `tests/auth.test.ts` | 20 | Valid/invalid/missing credentials, all four role logins, case-insensitive email, no account enumeration, JWT validation (garbage, wrong secret, expired, orphaned), disabled account, malformed JSON, 404 envelope |
| `tests/customers.test.ts` | 33 | Full CRUD, all fields, optional GST, mobile normalisation, invalid enums/email/mobile/GST, unknown-field rejection, duplicate GST, pagination, server-side search, filters, follow-ups, RBAC |
| `tests/products.test.ts` | 22 | CRUD, opening stock as an IN movement, duplicate SKU (incl. case-insensitive), negative/fractional/non-numeric rejection, low-stock filter and threshold, sorting, categories, stock-not-editable guard |
| `tests/stock.test.ts` | 16 | IN/OUT movements, complete audit fields, stock to exactly zero, insufficient stock with no write, invalid quantities and types, filters, ledger-sums-to-balance invariant |
| `tests/challans.test.ts` | 38 | Draft/confirmed creation, auto-numbering (incl. under concurrency), multi-product totals, duplicate-line merging, all six business rules, snapshot immutability after the product changes, confirm/cancel/edit transitions, concurrent confirmation safety |
| `tests/rbac.test.ts` | 75 | Every role against every module: reads, writes, confirm, cancel, user admin, unauthenticated access, and 401-vs-403 correctness |
| `tests/challan-pdf.test.ts` | 10 | Valid PDF structure and EOF marker, filename and cache headers, accurate Content-Length, rendering in all three statuses, multi-page pagination, per-role access and JSON (not PDF) errors |
| `tests/product-images.test.ts` | 15 | Real S3 round trip against MinIO: presign, direct upload, attach, read back identical bytes, replace-and-delete-old, remove; content-type and size rejection, cross-product key theft, unknown key, RBAC, plus the storage-disabled 503 path |
| `tests/error-handling.test.ts` | 15 | Database error translation, 500s that leak no internals, dashboard aggregation, database-level integrity invariants |

Highlights worth reviewing:

- **Rollback proof** — a two-line challan where one line is short leaves *both* products untouched
  and writes no challan row.
- **Snapshot proof** — after renaming, re-SKU-ing and repricing a product, the historical challan
  still reports the original values and total.
- **Concurrency proof** — two simultaneous confirmations for 8 units against 10 units of stock
  resolve to one `200` and one `409`, ending at 2 units.
- **Leak proof** — a simulated database failure containing a host, port and username returns a
  generic `500` with none of those strings in the response.

### Frontend verification

The frontend has no automated test suite (see [Known limitations](#known-limitations)). It was
verified manually in a browser across all four roles: login and error states, the complete
draft → confirm → stock-deduction flow, insufficient-stock handling, role-dependent UI, mobile
layout at 375 px with no horizontal overflow, PDF download producing a real `application/pdf`
blob with the correct filename, and a clean browser console.

### Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: backend typecheck, build,
migrations and the full test suite against a PostgreSQL service container; frontend typecheck and
production build; plus a check that no `.env` file is ever committed.

---

## Deployment

The application is container- and platform-agnostic. Configuration is entirely environment-driven
and no localhost URL is baked into any production build.

### Option A — Render (blueprint, recommended)

[`render.yaml`](render.yaml) provisions the database, API and static frontend together.

1. Push this repository to GitHub.
2. Render → **New → Blueprint** → select the repository.
3. Render creates `erp-crm-db`, `erp-crm-api` and `erp-crm-web`, wiring `DATABASE_URL`
   automatically and generating `JWT_SECRET`.
4. Set the two values marked `sync: false`:
   - on **erp-crm-api** → `CORS_ORIGINS` = the deployed frontend origin (e.g. `https://erp-crm-web.onrender.com`)
   - on **erp-crm-web** → `VITE_API_BASE_URL` = the deployed API URL **plus** `/api/v1`
5. Redeploy the frontend so Vite inlines the API URL.

The API start command runs `migrate:prod` then `seed:prod` before booting: migrations are
idempotent, and the seed only inserts demo data into an empty database.

### Option B — Vercel (frontend) + Render/Railway/Fly.io (backend) + Neon/Supabase (database)

1. **Database** — create a free PostgreSQL instance and copy its connection string.
2. **Backend** — deploy `backend/` as a Node service:
   - Build: `npm ci && npm run build`
   - Start: `npm run migrate:prod && npm run seed:prod && npm start`
   - Health check path: `/api/v1/health`
   - Environment: `NODE_ENV=production`, `DATABASE_URL=<connection string>`, `DATABASE_SSL=true`,
     `DATABASE_POOL_MAX=5`, `JWT_SECRET=<openssl rand -base64 48>`, `CORS_ORIGINS=<frontend origin>`
3. **Frontend** — import `frontend/` into Vercel. [`vercel.json`](frontend/vercel.json) already
   sets the Vite framework preset, the SPA rewrite and asset caching. Set the environment variable
   `VITE_API_BASE_URL=https://<your-api-host>/api/v1` and deploy.
4. **Finally** set `CORS_ORIGINS` on the backend to the deployed frontend origin and redeploy it.

> On Netlify, add a `_redirects` file containing `/*  /index.html  200` for SPA routing.

### Option C — Docker

```bash
export JWT_SECRET=$(openssl rand -base64 48)
export VITE_API_BASE_URL=http://localhost:4000/api/v1
docker compose --profile app up -d --build
```

Serves the API on `:4000` and the nginx-hosted frontend on `:5173`. Both images are multi-stage,
run as non-root and include a health check. Run migrations and the seed once:

```bash
docker compose exec api npm run migrate:prod
docker compose exec api npm run seed:prod
```

### Server setup notes

- The API is stateless — scale horizontally behind a load balancer; JWTs need no shared session store.
- `trust proxy` is enabled so rate limiting and logs see the real client IP behind a platform proxy.
- `helmet` sets security headers; `compression` gzips responses.
- CORS is an explicit allow-list from `CORS_ORIGINS`; requests without an `Origin` (curl, Postman,
  health checks) are permitted.
- `SIGTERM`/`SIGINT` trigger graceful shutdown: stop accepting connections, drain the pool, exit.
- Logs are structured JSON in production, each line carrying the request id echoed to clients as
  `X-Request-Id`.

### Deployment checklist

- [ ] `JWT_SECRET` is freshly generated, not the example value
- [ ] `DATABASE_SSL=true` for a managed database
- [ ] `CORS_ORIGINS` lists exactly the deployed frontend origin
- [ ] `VITE_API_BASE_URL` includes the `/api/v1` suffix and the frontend was rebuilt after setting it
- [ ] `SEED_DEFAULT_PASSWORD` changed if the deployment is publicly reachable
- [ ] `/api/v1/health` returns `database: connected`
- [ ] Login works for all four roles

---

## Live URLs

| Environment | URL |
|---|---|
| Frontend | _To be added after deployment_ |
| Backend API | _To be added after deployment_ |
| Health check | _`<backend URL>`/api/v1/health_ |

> **Status:** the application is complete and verified locally; the deployment steps above are
> ready to run. Deployment requires accounts on the chosen hosting providers, so the live URLs are
> filled in once those are provisioned. The assignment's alternative to deploying — a working local
> setup, a Postman collection and clear README instructions — is satisfied in full.

---

## Test credentials

Created by `npm run seed`. All four share the password below (`SEED_DEFAULT_PASSWORD`).

| Role | Email | Password | Access |
|---|---|---|---|
| **Admin** | `admin@erpcrm.test` | `Password@123` | Full access, including user administration |
| **Sales** | `sales@erpcrm.test` | `Password@123` | Customers, follow-ups, challans (create/confirm/cancel) |
| **Warehouse** | `warehouse@erpcrm.test` | `Password@123` | Products, stock movements, challan confirm/cancel |
| **Accounts** | `accounts@erpcrm.test` | `Password@123` | Read-only across all modules |

The login screen lists these accounts and fills the form when one is clicked.

The seed also creates 6 customers (across all three types and all three statuses), 12 products
(3 deliberately below their low-stock threshold), follow-up notes, and 2 challans — one confirmed
with matching stock movements, one draft.

---

## Assumptions

Where the specification left a decision open, the following choices were made:

1. **Role permissions.** The four roles are named but their permissions are not defined; the matrix
   in [Role-based access](#role-based-access) is a business-sensible interpretation.
2. **Warehouse may confirm and cancel challans**, since dispatching goods is a warehouse activity.
   **Accounts is read-only**, as no invoicing module is in scope for it to act on.
3. **Cancelling a confirmed challan returns stock** with an IN movement — the correct accounting
   behaviour, and the only way to reverse a confirmation.
4. **Only DRAFT challans are editable.** A confirmed document is a financial record; changing it
   would invalidate the stock movements already posted.
5. **Stock is not editable on the product form.** All changes flow through stock movements so the
   ledger always explains the balance.
6. **Opening stock is posted as an IN movement** rather than written directly, for the same reason.
7. **A product repeated across two challan lines is merged** into one line with summed quantities,
   which is friendlier than rejecting the request and matches the unique `(challan_id, product_id)`
   constraint.
8. **Currency is INR** and dates are formatted `en-GB`, matching an Indian wholesale context. GSTIN
   validation follows the Indian 15-character format.
9. **Challan number format** is `CH-<year>-<6 digits>`, resetting annually.
10. **Purchase orders and invoices** appear in the business context paragraph but not in the list of
    required modules, so they are out of scope. The challan module is the operational core.
11. **`PUT` is accepted as an alias for `PATCH`** (the brief says "PUT/PATCH"); both apply
    partial-update semantics.
12. **Pagination** defaults to `page=1&limit=10`, capped at 100 per page.
13. **Local PostgreSQL runs on port 5433** to avoid clashing with an existing installation.

---

## Known limitations

Stated plainly rather than hidden:

1. **Not yet deployed.** Live URLs require hosting accounts; all configuration and instructions are
   in place (see [Deployment](#deployment)).
2. **No frontend automated tests.** The backend has 219 integration tests; the UI was verified
   manually across all four roles. Component and E2E tests (Testing Library, Playwright) would be
   the next addition.
3. **JWT stored in `localStorage`.** Simple and appropriate for an internal tool, but readable by
   any XSS. An httpOnly refresh-token cookie pair would be the production hardening.
4. **No token refresh.** Sessions last 8 hours; expiry returns the user to the login screen rather
   than silently renewing.
5. **No password reset or self-service account management.** Administrators create users through
   `POST /users`.
6. **Users cannot be edited or deactivated through the UI.** The database supports `is_active` and
   the API honours it, but no screen exposes it.
7. **No soft delete.** Nothing is deletable by design — customers and products are deactivated
   rather than removed, preserving referential integrity for historical challans.
8. **Dashboard is not real-time.** It reflects the moment the page was loaded; there is no polling
   or websocket.
9. **Search uses `ILIKE`** with trigram indexes. Excellent to the tens of thousands of rows; a
   full-text or dedicated search index would be needed far beyond that.
10. **Rate limiting is in-process.** With multiple instances each holds its own counter; a shared
    Redis store would be needed for a strict global limit.
11. **Product images are not resized or virus-scanned.** The type and size are validated server-side
    against what actually landed in the bucket, but no thumbnailing pipeline or malware scan runs.
12. **Single currency and locale.** INR and `en-GB` formatting are hard-coded in the formatter.
    PDF documents print `Rs.` rather than the rupee glyph, because PDFKit's built-in fonts have no
    code point for it; embedding a Unicode font would fix this.

---

## Future improvements

- Frontend component and end-to-end test suites
- httpOnly cookie sessions with refresh-token rotation
- Purchase orders and invoicing, closing the procure-to-pay loop
- PDF challan/invoice export and email delivery
- Product images via S3 with presigned uploads
- Full user administration UI (edit, deactivate, reset password)
- Structured audit log across all entities, not only stock
- Server-driven CSV export for the list screens
- Redis-backed rate limiting and response caching for the dashboard

---

## Bonus features implemented

Only after every mandatory requirement was complete:

- **PDF export** — `GET /challans/:id/pdf` renders a printable A4 delivery challan with the
  company letterhead, a diagonal watermark on draft/cancelled documents, automatic pagination for
  long challans, totals and signature blocks. Built from the line-item snapshot, so a reprinted
  challan always matches the original. Covered by 10 tests.
- **Product image upload to S3** — presigned direct-to-storage uploads with server-side
  re-validation of what was actually stored, automatic cleanup of replaced objects, and graceful
  degradation when no bucket is configured. Verified end to end against MinIO (a real S3 API), so
  the same code path runs unchanged against AWS.
- **Docker** — multi-stage, non-root images for both apps plus a Compose stack (`--profile app`)
- **GitHub Actions CI** — typecheck, build, migrate, full test suite against a live PostgreSQL
  service container, and a committed-secrets check

All four optional bonus items are implemented.
