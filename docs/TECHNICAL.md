# Shop POS — Technical Documentation

_Audience: developers working on the codebase. Last updated: 2026-07-12._

## 1. Overview

Backend service for a shop point-of-sale system. It exposes a REST API for menu
management, ringing up sales, daily sales reporting, and expense tracking, secured
by JWT authentication with role-based access control (RBAC).

A Next.js frontend is planned as a separate phase; CORS is already enabled so it can
consume this API.

## 2. Tech stack

| Concern        | Choice                          | Notes |
| -------------- | ------------------------------- | ----- |
| Language       | TypeScript                      | `nodenext` module resolution |
| Framework      | NestJS 11                       | Modular architecture |
| Database       | PostgreSQL 16                   | Runs via Docker Compose |
| ORM            | TypeORM 1.0                     | Entities + repositories |
| Auth           | `@nestjs/jwt` + `passport-jwt`  | Bearer tokens |
| Password hash  | `bcryptjs`                      | Pure JS (no native build) |
| Validation     | `class-validator` / `class-transformer` | Global `ValidationPipe` |
| API docs       | `@nestjs/swagger`               | Served at `/docs` |

## 3. Project structure

```
shop-pos/backend
├── docker-compose.yml          # PostgreSQL 16 (host port 5433 -> container 5432)
├── .env / .env.example         # configuration
├── src/
│   ├── main.ts                 # bootstrap: ValidationPipe, Swagger, CORS
│   ├── app.module.ts           # wires config, TypeORM, global guards + serializer
│   ├── data-source.ts          # standalone DataSource for the TypeORM CLI
│   ├── seed.ts                 # creates schema (dev) + first owner account
│   ├── config/
│   │   └── data-source-options.ts   # single source of DB connection settings
│   ├── common/
│   │   ├── enums/              # Role, PaymentMethod, OrderStatus
│   │   ├── decorators/         # @Roles, @Public, @CurrentUser
│   │   ├── guards/             # JwtAuthGuard, RolesGuard
│   │   ├── interfaces/         # JwtPayloadUser
│   │   ├── transformers/       # decimal (numeric <-> number)
│   │   └── utils/              # date range + rounding helpers
│   ├── auth/                   # login, JWT strategy, /auth/me
│   ├── users/                  # user entity + owner-only user management
│   ├── menu/                   # MenuCategory + MenuItem (POS management)
│   ├── orders/                 # Order + OrderItem (POS) + sales summary
│   ├── expenses/               # Expense + ExpenseCategory + monthly summary
│   └── dashboard/              # combined owner snapshot
```

Each feature is a self-contained module (entities, service, controller, DTOs).

## 4. Data model

```
User (OWNER | STAFF)
MenuCategory 1───* MenuItem
Order 1───* OrderItem *───0..1 MenuItem
Order *───0..1 User (createdBy)
ExpenseCategory 1───* Expense *───0..1 User (createdBy)
```

Entities and notable columns:

- **User** — `id`, `name`, `email` (unique), `passwordHash` (`select:false` + `@Exclude`),
  `role`, `isActive`, timestamps.
- **MenuCategory** — `id`, `name`, `description`.
- **MenuItem** — `id`, `name`, `description`, `price` (numeric), `isAvailable`,
  `imageUrl`, `categoryId` (FK, `ON DELETE SET NULL`).
- **Order** — `id`, `orderNumber` (unique), `subtotal`, `discount`, `tax`, `total`
  (all numeric), `paymentMethod`, `status`, `createdById`, `items[]`.
- **OrderItem** — `id`, `orderId`, `menuItemId` (nullable), `nameSnapshot`,
  `unitPrice`, `quantity`, `lineTotal`.
- **ExpenseCategory** — `id`, `name` (unique).
- **Expense** — `id`, `title`, `amount` (numeric), `expenseDate` (date), `note`,
  `categoryId`, `createdById`, timestamps.

### Design decisions

- **Money** is stored as `numeric(10,2)` and mapped to JS `number` via a
  `ColumnNumericTransformer` (Postgres returns decimals as strings otherwise).
- **Order line snapshots**: each `OrderItem` copies the item's name and price at sale
  time. Editing/deleting a menu item later never alters historical sales.
- **Soft references**: deleting a category/menu-item/user nulls the foreign key
  (`SET NULL`) instead of cascading, preserving records. Deleting an order cascades
  to its line items.
- **Totals are computed server-side** from live menu prices — never trusted from the
  client.

## 5. Authentication & authorization

- Login (`POST /auth/login`) verifies credentials with `bcrypt.compare` and returns a
  signed JWT plus the user object.
- The JWT payload is `{ sub: userId, email, role }`.
- **`JwtAuthGuard`** is registered globally — every route requires a valid token
  unless annotated `@Public()` (login and `/health`).
- **`RolesGuard`** runs after it and enforces `@Roles(...)` metadata.
- `JwtStrategy.validate` re-loads the user on each request and rejects inactive
  accounts.
- Passwords never leave the server: the hash column is `select:false` (excluded from
  DB reads) **and** `@Exclude()` (stripped by the global `ClassSerializerInterceptor`
  even when present in memory).

RBAC summary:

| Capability                     | OWNER | STAFF |
| ------------------------------ | :---: | :---: |
| Read menu                      |  yes  |  yes  |
| Create orders                  |  yes  |  yes  |
| Manage menu                    |  yes  |  no   |
| Void orders                    |  yes  |  no   |
| Sales summary / dashboard      |  yes  |  no   |
| Expenses (all)                 |  yes  |  no   |
| Manage users                   |  yes  |  no   |

## 6. Key request flows

### Create an order (`POST /orders`)
1. Duplicate line items for the same product are merged.
2. Inside a **DB transaction**: load the referenced menu items, reject missing or
   unavailable ones.
3. Compute `lineTotal = unitPrice × quantity`, `subtotal = Σ lineTotals`, then
   `total = subtotal − discount + tax` (discount cannot exceed subtotal).
4. Snapshot name + unit price onto each line, generate an `orderNumber`
   (`ORD-YYYYMMDD-NNNN`), and persist order + lines atomically.

### Daily sales summary (`GET /orders/summary?date=`)
Aggregates `COMPLETED` orders within the local-time day (defaults to today):
order count, total sales, breakdown by payment method, and top 5 items by quantity.

### Monthly expense summary (`GET /expenses/summary?month=`)
Aggregates expenses within the month (defaults to current): total and per-category
breakdown (uncategorized grouped as "Uncategorized").

### Dashboard (`GET /dashboard?date=`)
Composes the daily sales summary + month-to-date sales total + monthly expense
summary, and computes `netProfit = monthlySales − monthlyExpenses`.

## 7. Configuration

Environment variables (see `.env.example`):

| Var | Purpose |
| --- | --- |
| `NODE_ENV` | `development` enables SQL logging + schema `synchronize` |
| `PORT` | HTTP port (default 3000) |
| `DB_HOST/PORT/USERNAME/PASSWORD/DATABASE` | PostgreSQL connection |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Token signing |
| `OWNER_NAME/EMAIL/PASSWORD` | First owner account created by `npm run seed` |

> Note: on the current dev machine another Postgres already uses host port 5432, so
> this project maps to **5433**.

## 8. Running & operations

```bash
docker compose up -d     # start PostgreSQL
npm run seed             # create schema (dev) + owner account
npm run start:dev        # http://localhost:3000, Swagger at /docs
npm run build            # compile to dist/
```

**Schema management**: development uses TypeORM `synchronize` (auto-syncs entities to
schema). For production, set `NODE_ENV=production` (disables synchronize) and use the
migration scripts (`migration:generate`, `migration:run`, `migration:revert`).

## 9. Testing

An end-to-end smoke test (39 assertions) exercised the full flow: auth, menu CRUD,
order pricing, sales/expense summaries, dashboard math, and RBAC boundaries — all
passing. Future work: add unit tests per service and Nest e2e specs.

## 10. Known limitations / future work

- Order numbering uses an in-transaction daily count; the unique constraint guards
  against the rare race under heavy concurrency.
- Tax/discount are flat per-order amounts (no per-item tax rules yet).
- Single currency; no timezone configuration (uses server local time for day/month
  boundaries).
- No refunds/partial voids beyond full order void.
