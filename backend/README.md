# Shop POS — Backend

NestJS + PostgreSQL (TypeORM) backend for a shop point-of-sale system:

- **POS management** — menu categories & items (name, price, details, availability)
- **POS** — ring up sales; server prices each order and snapshots item name/price
- **Sales tracking** — daily sales summary (defaults to today), filterable by date
- **Expense tracking** — record expenses; monthly summary (defaults to this month)
- **Auth** — JWT with `SUPER_ADMIN` / `OWNER` / `STAFF` roles (RBAC)
- **Multi-tenant** — every shop is an isolated tenant; its menu, sales, expenses
  and staff are visible only to its own users

## Requirements

- Node 20+ (built on Node 24)
- A [Neon](https://neon.tech) PostgreSQL database (free tier available)

## Quick start

```bash
# 1. Install
npm install

# 2. Configure — copy the example and paste your Neon connection string
cp .env.example .env
# Edit .env → replace the DATABASE_URL with your Neon connection string
# (Neon Dashboard → Connection Details → copy the connection string)

# 3. Create the schema + platform admin + demo shop
#    (schema and seeds are applied automatically on startup in dev)
#
#    Upgrading a database created before multi-tenancy? Its tables have no
#    shop_id, and the NOT NULL columns cannot be added to existing rows, so
#    drop the schema first — this DESTROYS all data:
#    npm run schema:drop

# 4. Run in watch mode
npm run start:dev
```

App: `http://localhost:3000` · Swagger docs: `http://localhost:3000/docs`

Seeded logins (from `.env`):

| Account        | Email                  | Password   | Sees                        |
| -------------- | ---------------------- | ---------- | --------------------------- |
| Platform admin | `admin@shop-pos.local` | `admin123` | Shops only — no trading data |
| Demo shop owner| `owner@shop.local`     | `owner123` | Everything in its own shop  |

## Multi-tenancy

Every shop is a tenant. `shops` is the root table, and `users`, `menu_categories`,
`menu_items`, `orders`, `expenses` and `expense_categories` each carry a
`shop_id`; every service filters by it.

- **A user belongs to exactly one shop.** Emails are unique platform-wide, so
  login takes an email and password with no shop picker — the credentials
  resolve the tenant.
- **`SUPER_ADMIN` belongs to no shop** (`shop_id` is NULL) and is refused shop
  data by `ShopContextGuard`. It creates shops and can suspend them; it cannot
  read a shop's sales.
- **Order numbers restart per shop** — each tenant has its own
  `ORD-YYYYMMDD-0001` series, enforced by a `(shop_id, order_number)` unique index.
- **Suspending a shop** (`DELETE /shops/:id`) blocks login for all its users and
  keeps its data. Reverse it with `PATCH /shops/:id { "isActive": true }`.

Scoping is enforced in two places: services filter every query by `shop_id`, and
`ShopContextGuard` refuses any request that would reach a handler without a
tenant, so a missing scope fails closed as a 403 instead of spanning shops.

## How auth works

1. `POST /auth/login` with email + password → `{ accessToken, user, shop }`.
2. Send `Authorization: Bearer <accessToken>` on every other request.
3. In Swagger, click **Authorize** and paste the token.

Roles:

| Area                              | SUPER_ADMIN | OWNER | STAFF |
| --------------------------------- | :---------: | :---: | :---: |
| Create / suspend shops            |     yes     |  no   |  no   |
| Read menu                         |     no      |  yes  |  yes  |
| Create orders (POS)               |     no      |  yes  |  yes  |
| Manage menu (create/edit/delete)  |     no      |  yes  |  no   |
| Sales summary / dashboard         |     no      |  yes  |  no   |
| Expenses (all)                    |     no      |  yes  |  no   |
| Void orders                       |     no      |  yes  |  no   |
| Manage staff of own shop          |     no      |  yes  |  no   |

## Key endpoints

- `POST /auth/login`, `GET /auth/me`
- `GET/POST/PATCH/DELETE /shops` (platform admin; POST creates the shop + its owner)
- `GET/POST/PATCH/DELETE /users` (owner — staff of the caller's own shop)
- `GET/POST/PATCH/DELETE /menu/categories`, `/menu/items` (read: all; write: owner)
- `POST /orders`, `GET /orders?from=&to=`, `GET /orders/:id`, `POST /orders/:id/void`
- `GET /orders/summary?date=YYYY-MM-DD` (owner; defaults to today)
- `GET/POST/PATCH/DELETE /expenses`, `/expenses/categories` (owner)
- `GET /expenses/summary?month=YYYY-MM` (owner; defaults to this month)
- `GET /dashboard?date=YYYY-MM-DD` (owner; today's sales + month-to-date sales/expenses/net)

## Database schema

`shops`, `users`, `menu_categories`, `menu_items`, `orders`, `order_items`,
`expense_categories`, `expenses`. Every table except `shops` and `order_items`
carries a `shop_id` (`order_items` inherits its tenant through `orders`).
Money is stored as `numeric(10,2)` and returned
as JS numbers. Order lines snapshot the item name + price at sale time so editing
or deleting a menu item never changes historical sales.

## Migrations

Development uses TypeORM `synchronize` (schema auto-syncs from entities), so you
don't need migrations to get started. For production, set `NODE_ENV=production`
(disables `synchronize`) and use migrations:

```bash
npm run migration:generate -- src/migrations/Init
npm run migration:run
npm run migration:revert
```

## Useful scripts

| Script                   | Purpose                              |
| ------------------------ | ------------------------------------ |
| `npm run start:dev`      | Run with hot reload                  |
| `npm run build`          | Compile to `dist/`                   |
| `npm run seed`           | Sync schema + create owner account   |
| `npm test`               | Unit tests                           |

