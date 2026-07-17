# Shop POS — Project Status

_What's built, what's verified, and what's left. Last updated: 2026-07-15._

This complements the other docs:
- `PLANNING.md` — the plan and the "why" behind each feature
- `TECHNICAL.md` — architecture and developer detail
- `NON-TECHNICAL.md` — plain-language guide

---

## 1. At a glance

- **Backend:** ✅ Complete and verified (all planned features).
- **Frontend:** 🟡 In progress — Login, POS, Menu management, and Sales tracking are
  done; Expenses and Dashboard pages remain.

| Feature | Backend API | Frontend UI |
| ------- | :---------: | :---------: |
| Authentication + roles (OWNER/STAFF) | ✅ Done | ✅ Done |
| Menu management (categories + items) | ✅ Done | ✅ Done |
| POS — ring up sales | ✅ Done | ✅ Done |
| Sales tracking (daily calculation) | ✅ Done | ✅ Done |
| Expense tracking (monthly) | ✅ Done | ⬜ To do |
| Owner dashboard (sales + expenses + net) | ✅ Done | ⬜ To do |
| Staff/user management | ✅ Done | ⬜ To do |
| Void an order | ✅ Done | ⬜ To do |

Legend: ✅ done · 🟡 in progress · ⬜ not started

---

## 2. Done — details

### Backend (NestJS + PostgreSQL, `shop-pos/backend`)
Complete and covered by a 39-check end-to-end smoke test.

- **Auth & RBAC** — JWT login (`/auth/login`), current user (`/auth/me`), global auth
  guard with `@Public()` opt-out, `OWNER`/`STAFF` role guard. Passwords hashed
  (`bcryptjs`) and never returned.
- **Users** — owner-only CRUD (`/users`), soft-deactivate.
- **Menu** — categories & items CRUD (`/menu/categories`, `/menu/items`), read for all,
  write for owner, availability + optional image, filters.
- **Orders (POS)** — `POST /orders` prices the order server-side inside a transaction,
  snapshots item name/price, generates an order number; list with date filters; void.
- **Sales tracking** — `GET /orders/summary?date=` (defaults to today): total, order
  count, payment-method breakdown, top items.
- **Expenses** — categories + expenses CRUD; `GET /expenses/summary?month=` (defaults to
  current month) with per-category breakdown.
- **Dashboard** — `GET /dashboard?date=` combining today's sales, month-to-date sales,
  monthly expenses, and net profit.
- **Supporting** — Swagger docs at `/docs`, seed script (first owner + schema),
  Docker Compose Postgres, migration scripts, input validation everywhere.

### Frontend (Next.js + Tailwind + shadcn/ui, `shop-pos/frontend`)
Verified with headless browser (Playwright) smoke tests.

- **Login + session** — JWT stored client-side, auto-redirect, 401 handling.
- **Protected app shell** — role-aware sidebar/topbar nav, current user, sign-out.
- **POS** (`/pos`) — item grid + category filters, cart with quantities, discount,
  payment method, checkout posting to `/orders`, confirmation toast.
- **Menu management** (`/menu`, owner-only) — full CRUD for categories and items via
  dialogs.
- **Sales tracking** (`/sales`, owner-only) — date picker (defaults to today), total
  sales, order count, average order value, payment-method breakdown, top items, and the
  day's orders.

---

## 3. To do

### Frontend — remaining Phase 2 (backend already supports all of these)
1. **Expenses pages** (`/expenses`, owner-only)
   - List expenses for a chosen month (month picker, defaults to current month).
   - Add / edit / delete expenses and expense categories.
   - Monthly summary: total + breakdown by category.
2. **Owner dashboard** (`/dashboard` or home, owner-only)
   - Today's sales, month-to-date sales, month-to-date expenses, net profit.
   - Likely becomes the landing page after login for owners.
3. **Staff / user management UI** (`/users` or settings, owner-only)
   - List users, create staff accounts, deactivate, change roles.
4. **Void an order** — action in the POS/sales order list (owner-only), calling
   `POST /orders/:id/void`.

### Polish / smaller improvements
- Replace `window.confirm` deletes with a styled confirm dialog.
- Loading skeletons instead of "Loading…" text.
- Empty-state illustrations/help.
- Show the logged-in staff name on receipts / order detail.
- Currency symbol/formatting configuration (currently plain 2-decimal numbers).

### Phase 3 — backlog (not yet designed; may need backend work)
- Printed / emailed receipts
- Refunds and partial voids
- Charts and trends (weekly/monthly graphs)
- Per-item tax rules / multiple tax rates
- Inventory / stock tracking
- Multiple shops or terminals
- Export to CSV/Excel for accounting
- Configurable timezone and currency

---

## 4. How to run (current state)

```bash
# 1. Database + backend  (from shop-pos/backend)
docker compose up -d          # Postgres (Docker Desktop must be running)
npm run seed                  # first run only: schema + owner account
npm run start:dev             # API on http://localhost:3000, docs at /docs

# 2. Frontend  (from shop-pos/frontend)
npm install
npm run dev -- -p 3001        # app on http://localhost:3001
```

Default owner login: `owner@shop.local` / `owner123`.

**Ops note:** if the backend returns `500` after a machine reboot, the Postgres
container is likely stopped — run `docker compose up -d` from `shop-pos/backend` again.
Data is preserved in a Docker volume.

---

## 5. Suggested next step

Build the **Expenses pages** and the **Owner dashboard** to complete Phase 2 — both are
fully supported by the backend and would round out the app into a complete
sales-and-expenses tool.
