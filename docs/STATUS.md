# Shop POS — Project Status

_What's built, what's verified, and what's left. Last updated: 2026-09-06._

This complements the other docs:
- [PLANNING.md](PLANNING.md) — the plan and the "why" behind each feature
- [TECHNICAL.md](TECHNICAL.md) — architecture and developer detail
- [API.md](API.md) — endpoint reference
- [OPERATIONS.md](OPERATIONS.md) — configuration, deployment, runbook
- [NON-TECHNICAL.md](NON-TECHNICAL.md) — plain-language guide

---

## 1. At a glance

- **Backend:** ✅ Complete for every planned feature, plus multi-tenancy, refunds and
  the print queue.
- **Frontend:** 🟡 The till, expenses and the owner's day-to-day screens are done;
  the dashboard remains.
- **Print bridge:** ✅ Complete and verified against live hardware.

| Feature | Backend API | Frontend UI |
| ------- | :---------: | :---------: |
| Authentication + roles (OWNER / STAFF) | ✅ Done | ✅ Done |
| Multi-tenancy — shops, platform administrator | ✅ Done | ✅ Done |
| Menu management (categories + items) | ✅ Done | ✅ Done |
| POS — ring up sales | ✅ Done | ✅ Done |
| Sales tracking (daily) | ✅ Done | ✅ Done |
| Staff / user management | ✅ Done | ✅ Done |
| Refund an order | ✅ Done | ✅ Done |
| Void an order | ✅ Done | ⬜ To do |
| Bluetooth receipt printing (print bridge) | ✅ Done | ✅ Done |
| Expense tracking (monthly) | ✅ Done | ✅ Done |
| Owner dashboard (sales + expenses + net) | ✅ Done | ⬜ To do |

Legend: ✅ done · 🟡 in progress · ⬜ not started

---

## 2. Done — details

### Backend (NestJS + PostgreSQL, `backend/`)

- **Multi-tenancy** — a `Shop` is the tenant; every row of trading data carries
  `shop_id`. The shop comes from the token, never from the request, and is enforced in
  three layers (token, per-query scoping, `ShopContextGuard` backstop).
- **Platform administration** — a `SUPER_ADMIN` role that belongs to no shop, creates a
  shop and its first owner in one call, can suspend a shop (blocking login for all of
  its users), and is refused access to any shop's trading data.
- **Auth & RBAC** — JWT login, `/auth/me`, global auth guard with `@Public()` opt-out,
  role guard. Passwords bcrypt-hashed and never returned.
- **Users** — owner-only CRUD within the shop, soft-deactivate preserving order history.
- **Menu** — categories and items; read for all shop users, write for the owner;
  availability flag, optional image, filters.
- **Orders (POS)** — server-side pricing inside a transaction, duplicate-line merging,
  name/price snapshots, per-shop order numbering, list with date and status filters,
  void and refund.
- **Sales tracking** — daily summary: total, order count, payment-method breakdown, top
  five items.
- **Expenses** — categories and expenses CRUD, monthly summary with per-category
  breakdown.
- **Dashboard** — one call combining today's sales, month-to-date sales, monthly
  expenses and net profit.
- **Printing** — the print-job queue: exclusive claims, station heartbeat, retry and
  give-up, stale-job expiry, printer status for the tills.
- **Reporting timezone** — day and month boundaries computed in the business timezone
  (`APP_TIMEZONE`, default `Asia/Dhaka`) rather than the server's, unit-tested.
- **Supporting** — Swagger at `/docs`, idempotent startup seeding, Dockerfile, local
  Postgres compose file, migration scripts, validation everywhere.

Verified by a 39-check end-to-end smoke run (auth, menu, order pricing, summaries,
dashboard math, RBAC boundaries) plus unit tests for the date helpers and the tenant
guard.

### Print bridge (Node, `bridge/`)

Prints on the shop's Bluetooth thermal printer (BT583 class, 58 mm ESC/POS).

- **Why it exists** — no browser can reach these printers. Web Bluetooth speaks only
  BLE GATT; the printer is Bluetooth *Classic* (SPP), and iOS blocks serial outright. So
  the printer is owned by a small Node process on the counter PC.
- **Queue** — tills `POST /print-jobs`; the bridge claims work with `FOR UPDATE SKIP
  LOCKED` (no double printing), acknowledges each slip, retries three times, requeues
  jobs abandoned by a crash, and expires slips older than ten minutes.
- **Status** — `GET /print-jobs/printer-status` reports whether a station has checked in
  recently with its printer port open.
- **Three routes, tried in order** — a bridge on the same machine (`127.0.0.1:9110`),
  the shop's counter-PC bridge via the queue, then the browser print dialog as a
  fallback, so a receipt is always obtainable.
- **ESC/POS renderer** — hand-rolled, width-aware (32 columns at 58 mm, halved for
  double-width headers), chunked writes for small Bluetooth buffers.
- **Setup and troubleshooting** — [bridge/README.md](../bridge/README.md).

Verified end-to-end against a live backend: 22 checks covering the queue lifecycle,
claim exclusivity, the retry/give-up path, and tenant isolation.

### Frontend (Next.js + Tailwind + shadcn/ui, `frontend/`)

Verified with headless-browser (Playwright) smoke tests.

- **Login + session** — JWT held client-side, auto-redirect, global 401 handling.
- **Protected app shell** — role-aware sidebar and topbar, current user and shop,
  sign-out, light/dark theme.
- **POS** (`/pos`) — item grid with category filters, cart with quantities, discount,
  payment method, checkout, and receipt printing via the three-route bridge.
- **Menu management** (`/menu`, owner) — full CRUD for categories and items.
- **Sales tracking** (`/sales`, owner) — date picker defaulting to today, total sales,
  order count, average order value, payment-method breakdown, top items, the day's
  orders, order detail, and refund.
- **Staff** (`/staff`, owner) — list users, create staff accounts, edit, deactivate.
- **Shops** (`/admin/shops`, platform admin) — list shops, create a shop with its owner,
  edit details, suspend and reactivate.
- **Expenses** (`/expenses`, owner) — month picker defaulting to the current month,
  monthly total / entry count / largest category, expense CRUD with a category filter,
  and expense-category CRUD showing each category's spend for the month (plus an
  Uncategorized row so the totals reconcile). Verified by a 13-check browser run
  covering create, recategorize, clear to Uncategorized, month switching, mobile
  layout and delete.

---

## 3. To do

### Frontend — remaining (the backend already supports all of these)

1. **Owner dashboard** (`/dashboard`, owner-only)
   - Today's sales, month-to-date sales, month-to-date expenses, net profit.
   - Likely becomes the landing page after login for owners, in place of `/pos`.
2. **Void an order** — an owner action in the sales order list, alongside refund,
   calling `POST /orders/:id/void`.

### Polish

- Replace `window.confirm` deletes with a styled confirm dialog.
- Loading skeletons instead of "Loading…" text.
- Empty-state help and illustrations.
- Show the logged-in staff name on receipts and order detail.
- Currency symbol and formatting configuration (currently plain two-decimal numbers).

### Engineering

- Commit the initial TypeORM migration — the schema has so far only ever been created
  by `synchronize`, so there is no reproducible production schema yet.
- Turn the manual end-to-end smoke runs into a committed Nest e2e suite, and add
  per-service unit tests.
- Restrict CORS to known origins and add rate limiting on `POST /auth/login` before any
  public deployment.

### Backlog — not yet designed, likely needs backend work

- Partial refunds and per-line voids
- Charts and trends (weekly / monthly graphs)
- Per-item tax rules and multiple tax rates
- Inventory / stock tracking
- Multiple terminals per shop with per-terminal reporting
- CSV / Excel export for accounting
- Per-shop timezone and currency
- Raster (bitmap) receipt rendering so non-Latin item names can print

---

## 4. How to run (current state)

```bash
# 1. Backend  (from backend/)
docker compose up -d          # local Postgres — skip if using a hosted database
npm install
cp .env.example .env          # set DATABASE_URL and JWT_SECRET
npm run start:dev             # API on http://localhost:3000, docs at /docs

# 2. Frontend  (from frontend/)
npm install
npm run dev -- -p 3001        # app on http://localhost:3001

# 3. Print bridge  (from bridge/, on the PC the printer is paired to)
npm install
npm run probe                 # find the printer's COM port
cp .env.example .env          # then fill in the port + a shop login
npm start
```

Seeding runs automatically on backend startup and is idempotent. Default logins:

| Role | Email | Password |
| ---- | ----- | -------- |
| Platform admin | `admin@shop-pos.local` | `admin123` |
| Shop owner | `owner@shop.local` | `owner123` |

Change both before the deployment is reachable by anyone else.

Operational issues — a stopped database container, a silent printer, reports off by a
day — are covered in the [OPERATIONS.md runbook](OPERATIONS.md#9-runbook).

---

## 5. Suggested next step

Build the **Owner dashboard** — the last screen of Phase 2. Sales and expenses are
both now captured in the UI, so the dashboard endpoint (`GET /dashboard`) has
everything it needs to show today's takings, the month's expenses and net profit in
one view.
