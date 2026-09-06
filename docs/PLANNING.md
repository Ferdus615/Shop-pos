# Shop POS — Planning, Features & Rationale

_Last updated: 2026-09-06._

## 1. Project goal

Build an application to run a shop, consisting of:
- a **POS** to ring up sales,
- a **POS management** area to maintain the menu (items, prices, details),
- **sales tracking** to see daily takings (calendar, defaults to today),
- **expense tracking** to see monthly costs.

Delivered as a **NestJS backend** + **Next.js frontend**, later joined by a **Node
print bridge** for thermal receipts.

Two requirements arrived after the original plan and reshaped it: the platform had to
host **several independent shops** rather than one, and receipts had to come out of a
**Bluetooth thermal printer** — which browsers cannot drive at all.

## 2. Phases

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 1. Backend | API, database, auth, all four features | ✅ Done & verified |
| 2. Frontend | Next.js UI for all features | 🟡 In progress — the dashboard screen remains |
| 2b. Multi-tenancy | Shops as tenants, platform administrator, tenant isolation | ✅ Done & verified |
| 2c. Receipt printing | Print-job queue + counter-PC bridge for Bluetooth ESC/POS | ✅ Done & verified |
| 3. Enhancements | Charts, partial refunds, per-item tax, stock, exports | ⬜ Backlog |

Per-feature detail is tracked in [STATUS.md](STATUS.md).

## 3. Decisions made up front (and why)

| Decision | Choice | Why |
| -------- | ------ | --- |
| Database + ORM | PostgreSQL + TypeORM | Reliable relational store for financial data; TypeORM is the native NestJS pairing |
| Authentication | JWT + Owner/Staff roles | You need staff to sell without seeing your profits |
| Password hashing | `bcryptjs` | Pure-JS, avoided native build issues on this machine |
| Money storage | `numeric(10,2)` → number | Exact currency math to the cent |
| Local Postgres port | configurable (`DB_PORT`) | Another Postgres already used 5432 on the original dev machine |

## 3b. Decisions made later (and why)

| Decision | Choice | Why |
| -------- | ------ | --- |
| Tenancy model | One shared database, `shop_id` on every row | A shop is small; a database per shop would multiply operational cost for isolation the application already guarantees |
| Where the tenant comes from | The JWT, never the request | If a client cannot name another shop, it cannot ask for one — this removes a whole class of access bug rather than relying on every query being written correctly |
| Tenant enforcement | Three independent layers | Per-query scoping is the real mechanism; `ShopContextGuard` exists so a *missing* shop fails loudly (403) instead of quietly querying every shop |
| Platform administrator | A role belonging to no shop, barred from shop data | Whoever runs the platform needs to create and suspend shops; they have no business reading anyone's takings |
| Login identity | Email unique platform-wide | Lets the shop be resolved from the credentials alone — no shop picker on the login screen for staff to get wrong |
| Hosted database | Neon (Postgres over SSL) | Managed backups and point-in-time restore matter more than self-hosting where the data is sales records |
| Report boundaries | Computed in `APP_TIMEZONE`, not the server's zone | A server running in UTC would otherwise close the shop's day six hours early |
| Receipt printing | A Node bridge owning the printer, fed by a DB queue | No browser can reach a Bluetooth *Classic* printer: Web Bluetooth is BLE-only and iOS blocks serial. A queue also lets any till print, not just the counter PC |
| Print fallback | Local → queued → browser dialog | A shop whose counter PC is off must still be able to hand over a receipt |
| Claiming print jobs | `FOR UPDATE SKIP LOCKED` | The guarantee that matters is that two bridges never print the same receipt |
| Cancelling a sale | Void and refund as status changes, never deletes | The record is evidence; it should leave the day's total without leaving the books |

## 4. Features built — and the reasoning behind each

### Feature: Authentication & roles
**What:** Email/password login returning a token; Owner and Staff roles enforced on
every endpoint.
**Why:** The shop has an owner and staff. Staff must be able to take orders but must
**not** see sales totals, profits, expenses, or change prices. Building this first
means every other feature is protected by default.
**How verified:** Staff account confirmed able to create orders but blocked (403) from
menu management, reports, expenses, and user management.

### Feature: POS management (menu)
**What:** Create/edit/delete menu **categories** and **items** (name, description,
price, availability, optional image). Reads allowed for all logged-in users; changes
restricted to the owner.
**Why:** You asked to "add the menu item price and details." Categories keep the menu
organized; the availability flag lets you hide a sold-out item without deleting it.
Only the owner can change prices to protect your margins.

### Feature: POS (sales / orders)
**What:** `POST /orders` takes a list of items + quantities and a payment method; the
server prices everything, applies discount/tax, generates a receipt number, and saves
it — all in one atomic transaction.
**Why:** This is the core "cash register." Pricing on the server (not the client)
prevents mistakes and tampering. The transaction guarantees an order is never saved
half-finished. Each line **snapshots** the item's name and price so that changing the
menu later never rewrites past receipts — essential for trustworthy history.

### Feature: Sales tracking
**What:** `GET /orders/summary?date=` — total sales, order count, payment-method
breakdown, and top-selling items for a chosen day; **defaults to today**.
**Why:** You asked to "see how much I have in sales every day… default current date."
The payment breakdown helps reconcile the cash drawer; top items inform what to stock.

### Feature: Expense tracking
**What:** Record expenses (title, amount, date, category, note) and view a monthly
summary with per-category breakdown; **defaults to the current month**.
**Why:** You asked to "track the monthly expenses." Categories (rent, supplies, etc.)
show where money goes. Combined with sales, this gives a true picture of the business.

### Feature: Owner dashboard
**What:** `GET /dashboard` — today's sales plus month-to-date sales, expenses, and
**net profit**, in one call.
**Why:** Sales and expenses are only half the story on their own. Seeing profit
(sales − expenses) at a glance is what actually tells you how the shop is doing. Also
sets up the frontend's home screen.

### Supporting pieces
- **API documentation (Swagger at `/docs`)** — so the feature set is browsable and the
  frontend team (and you) can try endpoints without extra tools.
- **Seed script** — creates the first owner account instantly so the system is usable
  from minute one.
- **Docker Compose for the database** — one command to start Postgres, no manual setup.
- **Input validation everywhere** — bad data is rejected with clear errors before it
  can reach the database.

## 5. Cross-cutting principles

- **Never trust the client for money** — all totals computed server-side.
- **History is immutable** — past sales are snapshots; edits don't rewrite them.
- **Least privilege** — staff see only what they need.
- **Defaults that match real use** — sales default to today, expenses to this month.
- **Preserve records** — deletes null references instead of wiping related history.

## 6. Roadmap / backlog (Phase 3 ideas)

Delivered since this list was first written: printed receipts, refunds, multiple shops,
and a configurable reporting timezone. What remains:

- Partial refunds and per-line voids
- Charts and trends (weekly / monthly graphs)
- Per-item tax rules and multiple tax rates
- Inventory / stock counts
- Multiple terminals per shop, with per-terminal reporting
- Export to CSV / Excel for accounting
- Per-shop timezone and currency
- Raster receipt rendering, so non-Latin item names can print
- Emailed receipts

## 7. Definition of done for Phase 1 (met)

- [x] All four requested features implemented as API endpoints
- [x] Owner/Staff authentication and access control
- [x] Database schema created and seedable
- [x] Project builds cleanly
- [x] End-to-end smoke test passes (39/39 checks)
- [x] Technical, non-technical, and planning documentation written

## 8. Definition of done for Phase 2

- [x] Login, POS, menu management and sales screens built and smoke-tested
- [x] Staff management and platform shop administration screens built
- [x] Receipt printing working on live hardware from any till
- [x] Tenant isolation verified end-to-end
- [x] Expenses screens built
- [ ] Owner dashboard screen built
- [ ] Void action exposed in the UI
- [ ] Initial database migration committed (no reliance on `synchronize`)
