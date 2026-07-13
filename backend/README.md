# Shop POS — Backend

NestJS + PostgreSQL (TypeORM) backend for a shop point-of-sale system:

- **POS management** — menu categories & items (name, price, details, availability)
- **POS** — ring up sales; server prices each order and snapshots item name/price
- **Sales tracking** — daily sales summary (defaults to today), filterable by date
- **Expense tracking** — record expenses; monthly summary (defaults to this month)
- **Auth** — JWT with `OWNER` / `STAFF` roles (RBAC)

## Requirements

- Node 20+ (built on Node 24)
- Docker (for the Postgres container) — or any reachable PostgreSQL 14+

## Quick start

```bash
# 1. Install
npm install

# 2. Configure — copy the example and adjust if needed
cp .env.example .env

# 3. Start PostgreSQL (maps container 5432 -> host 5433 by default)
docker compose up -d

# 4. Create the schema + first owner account
npm run seed

# 5. Run in watch mode
npm run start:dev
```

App: `http://localhost:3000` · Swagger docs: `http://localhost:3000/docs`

Default owner login (from `.env`): `owner@shop.local` / `owner123`.

## How auth works

1. `POST /auth/login` with email + password → `{ accessToken, user }`.
2. Send `Authorization: Bearer <accessToken>` on every other request.
3. In Swagger, click **Authorize** and paste the token.

Roles:

| Area                              | OWNER | STAFF |
| --------------------------------- | :---: | :---: |
| Read menu                         |  yes  |  yes  |
| Create orders (POS)               |  yes  |  yes  |
| Manage menu (create/edit/delete)  |  yes  |  no   |
| Sales summary / dashboard         |  yes  |  no   |
| Expenses (all)                    |  yes  |  no   |
| Void orders                       |  yes  |  no   |
| Manage users                      |  yes  |  no   |

## Key endpoints

- `POST /auth/login`, `GET /auth/me`
- `GET/POST/PATCH/DELETE /users` (owner)
- `GET/POST/PATCH/DELETE /menu/categories`, `/menu/items` (read: all; write: owner)
- `POST /orders`, `GET /orders?from=&to=`, `GET /orders/:id`, `POST /orders/:id/void`
- `GET /orders/summary?date=YYYY-MM-DD` (owner; defaults to today)
- `GET/POST/PATCH/DELETE /expenses`, `/expenses/categories` (owner)
- `GET /expenses/summary?month=YYYY-MM` (owner; defaults to this month)
- `GET /dashboard?date=YYYY-MM-DD` (owner; today's sales + month-to-date sales/expenses/net)

## Database schema

`users`, `menu_categories`, `menu_items`, `orders`, `order_items`,
`expense_categories`, `expenses`. Money is stored as `numeric(10,2)` and returned
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
| `docker compose up -d`   | Start PostgreSQL                     |
| `docker compose down`    | Stop PostgreSQL (data volume kept)   |
