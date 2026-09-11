# Shop POS — API Reference

_Audience: anyone writing a client against the backend. Last updated: 2026-09-09._

A live, interactive version of this reference (OpenAPI/Swagger) is served by the
running backend at **`/docs`**. This document is the narrative companion: it states the
role each endpoint requires, the tenant rules, and the errors worth handling.

Base URL: `http://localhost:5000` in development.

---

## 1. Conventions

**Authentication.** Every endpoint except those marked _public_ requires a bearer
token:

```
Authorization: Bearer <jwt>
```

**Tenancy.** The shop is taken from the token. No endpoint accepts a shop id as a
parameter, and an id belonging to another shop is simply not found (`404`). See
[TECHNICAL.md §4](TECHNICAL.md#4-multi-tenancy).

**Roles.** `SUPER_ADMIN` (platform, no shop), `OWNER`, `STAFF`. Where a role column
says "OWNER", `STAFF` receives `403`.

**Validation.** Bodies are validated with a global whitelist pipe: unknown properties
are rejected rather than ignored. A validation failure returns `400` with `message` as
an array of strings.

**Money.** All amounts are numbers with two decimal places. Totals are always computed
server-side; a client never sends a price.

**Dates.** `date` parameters are `YYYY-MM-DD`, `month` parameters are `YYYY-MM`. Both
are interpreted in the deployment's business timezone (`APP_TIMEZONE`, default
`Asia/Dhaka`).

**Enums.**

| Enum | Values |
| ---- | ------ |
| `Role` | `SUPER_ADMIN`, `OWNER`, `STAFF` |
| `PaymentMethod` | `CASH`, `BKASH`, `NAGAD` |
| `OrderStatus` | `COMPLETED`, `VOIDED`, `REFUNDED` |
| `PrintJobType` | `RECEIPT`, `KITCHEN` |
| `PrintJobStatus` | `PENDING`, `PRINTING`, `DONE`, `FAILED` |

**Common error shapes.**

| Status | Meaning |
| ------ | ------- |
| `400` | Validation failure, or a rejected business rule (unavailable item, discount above subtotal, illegal status transition) |
| `401` | Missing, expired or invalid token; inactive account |
| `403` | Role not permitted, or no shop context (platform admin on a shop route, or a user with no shop) |
| `404` | Not found **or** belonging to another shop — the two are indistinguishable by design |
| `409` | Uniqueness conflict (email already taken, duplicate shop slug or category name) |

---

## 2. Service

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| `GET` | `/` | public | Service banner |
| `GET` | `/health` | public | Liveness probe |
| `GET` | `/docs` | public | Swagger UI |

---

## 3. Authentication

### `POST /auth/login` — public

```json
{ "email": "owner@shop.local", "password": "owner123" }
```

Returns a signed JWT and the user, including the shop they belong to:

```json
{
  "accessToken": "eyJhbGciOi...",
  "user": {
    "id": "uuid",
    "name": "Shop Owner",
    "email": "owner@shop.local",
    "role": "OWNER",
    "shopId": "uuid",
    "isActive": true
  }
}
```

`401` for wrong credentials, an inactive user, or a user whose shop is deactivated. The
password hash is never present in any response.

### `GET /auth/me` — any authenticated role

The current user. This is the one shop-less route (`@NoShopRequired()`), so a
`SUPER_ADMIN` can identify themselves.

---

## 4. Shops (platform administration)

All routes require **`SUPER_ADMIN`**. These are the only routes a platform admin may
call; any shop route returns `403`.

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/shops` | Create a shop **and its first owner** in one call |
| `GET` | `/shops` | List all shops |
| `GET` | `/shops/:id` | One shop |
| `PATCH` | `/shops/:id` | Rename, edit contact details, activate/suspend |
| `DELETE` | `/shops/:id` | Delete a shop and all of its data |

### `POST /shops`

```json
{
  "name": "Naval Bay",
  "slug": "naval-bay",
  "address": "Sector-7, Uttara, Dhaka",
  "phone": "+8801700000000",
  "owner": {
    "name": "Owner Name",
    "email": "owner@navalbay.local",
    "password": "a-strong-password"
  }
}
```

`slug` must be lowercase letters, numbers and hyphens, and unique platform-wide. The
owner's email must not already exist on the platform (emails are unique across all
shops). `409` on either conflict.

### `PATCH /shops/:id`

Accepts `name`, `address`, `phone`, `isActive`. Setting `isActive: false` **suspends
the shop**: every user belonging to it is refused at login. The slug cannot be changed.

> `DELETE /shops/:id` cascades to the shop's users, menu, orders, expenses and print
> jobs. It is irreversible — suspend with `isActive: false` unless the data is genuinely
> meant to go.

---

## 5. Shop users

All routes require **`OWNER`**, and operate only within the caller's own shop.

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/users` | Create a staff or owner account for this shop |
| `GET` | `/users` | List this shop's users |
| `GET` | `/users/:id` | One user |
| `PATCH` | `/users/:id` | Update name, email, password, role, `isActive` |
| `DELETE` | `/users/:id` | Deactivate (soft) — the record and its order history remain |

### `POST /users`

```json
{
  "name": "Counter Staff",
  "email": "staff@shop.local",
  "password": "a-strong-password",
  "role": "STAFF"
}
```

`role` defaults to `STAFF`; `SUPER_ADMIN` cannot be assigned here. The new user is
attached to the caller's shop automatically — there is no `shopId` field. `409` if the
email exists anywhere on the platform.

`DELETE` sets `isActive: false` rather than removing the row, so past orders keep their
"created by" attribution.

---

## 6. Menu

Reads are available to `OWNER` and `STAFF`; writes are **`OWNER`** only.

### Categories

| Method | Path | Role | Description |
| ------ | ---- | ---- | ----------- |
| `GET` | `/menu/categories` | any | List categories |
| `GET` | `/menu/categories/:id` | any | One category |
| `POST` | `/menu/categories` | OWNER | Create — `{ name, description? }` |
| `PATCH` | `/menu/categories/:id` | OWNER | Update |
| `DELETE` | `/menu/categories/:id` | OWNER | Delete — items are kept, their `categoryId` becomes `null` |

### Items

| Method | Path | Role | Description |
| ------ | ---- | ---- | ----------- |
| `GET` | `/menu/items` | any | List; filters `categoryId`, `available` |
| `GET` | `/menu/items/:id` | any | One item |
| `POST` | `/menu/items` | OWNER | Create |
| `PATCH` | `/menu/items/:id` | OWNER | Update (partial) |
| `DELETE` | `/menu/items/:id` | OWNER | Delete — past order lines are unaffected |

```json
{
  "name": "Cappuccino",
  "description": "Double shot",
  "price": 180,
  "categoryId": "uuid",
  "isAvailable": true,
  "imageUrl": "https://…"
}
```

Marking an item `isAvailable: false` keeps it on the menu but makes it unsellable: a
checkout naming it returns `400`. Deleting an item never alters historical receipts,
which carry their own name and price snapshot.

---

## 7. Orders (POS)

| Method | Path | Role | Description |
| ------ | ---- | ---- | ----------- |
| `POST` | `/orders` | OWNER, STAFF | Ring up a sale |
| `GET` | `/orders` | OWNER, STAFF | List; filters `from`, `to`, `status` |
| `GET` | `/orders/:id` | OWNER, STAFF | One order with its lines |
| `GET` | `/orders/open` | OWNER, STAFF | Orders still to serve or settle (the floor view) |
| `GET` | `/orders/summary` | OWNER | Daily sales summary |
| `POST` | `/orders/:id/void` | OWNER | Void an order |
| `POST` | `/orders/:id/refund` | OWNER | Refund an order |
| `POST` | `/orders/:id/pay` | OWNER, STAFF | Settle the bill, confirming how they paid |
| `POST` | `/orders/:id/unpay` | OWNER | Undo a payment marked in error |
| `POST` | `/orders/:id/serve` | OWNER, STAFF | Mark the food served |
| `POST` | `/orders/:id/unserve` | OWNER, STAFF | Take back a premature "served" |

### `POST /orders`

```json
{
  "items": [
    { "menuItemId": "uuid", "quantity": 2 },
    { "menuItemId": "uuid", "quantity": 1 }
  ],
  "paymentMethod": "CASH",
  "tableNumber": "7",
  "discount": 20,
  "tax": 0
}
```

`markPaid` defaults to **true**: the ordinary sale is paid as it is rung up. Send
`false` for a table that settles later, which leaves the bill open. Paying now for a
table that already has an unpaid bill settles that **whole** bill — a table has one
bill, so there is nothing else it could mean.

`tableNumber` is optional free text (max 16 chars); omit it for a counter or takeaway
sale. **If that table already has an unpaid bill, these items are appended to it** and
the response is that bill with `appendedToOpenBill: true` — its totals recomputed and
its serving reopened. Once the table has paid, the next ring-up starts a new order.

Orders are created **unserved** either way — the food has only just been ordered.

The request carries **no prices**. The server prices the order inside a transaction
from the shop's live menu, merges duplicate lines for the same item, snapshots each
item's name and unit price, and assigns an order number.

Response:

```json
{
  "id": "uuid",
  "orderNumber": "ORD-20260831-0007",
  "subtotal": 540,
  "discount": 20,
  "tax": 0,
  "total": 520,
  "paymentMethod": "CASH",
  "status": "COMPLETED",
  "createdById": "uuid",
  "items": [
    {
      "id": "uuid",
      "menuItemId": "uuid",
      "nameSnapshot": "Cappuccino",
      "unitPrice": 180,
      "quantity": 2,
      "lineTotal": 360
    }
  ],
  "createdAt": "2026-08-31T09:14:02.000Z"
}
```

`400` when an item id does not exist in this shop, an item is unavailable, or the
discount exceeds the subtotal.

### `GET /orders/open`

Every `COMPLETED` order that is **unpaid or unserved**, with its lines, oldest first.
Not filtered by date — a bill opened before midnight is still open afterwards, so a
day filter would hide a table that is still sitting there.

The union serves two screens, each filtering it: **Tables** takes the *unserved* ones
(its job is the food still to go out) and the POS's **Open bills** panel takes the
*unpaid* ones (its job is money still to collect). An order that is served but unpaid
appears in neither — it is settled from the Sales list.

### Settling and serving — `POST /orders/:id/pay`, `/serve`

```json
{ "paymentMethod": "BKASH", "receivedAmount": 500 }
```

Both fields are optional on `pay`: the method defaults to the one recorded at ring-up,
and `receivedAmount` is only used by the client for the change line on the receipt.
Paying and serving are independent — an order can be served before it is settled, or
settled before it is served — and both are staff work.

| Attempt | Result |
| ------- | ------ |
| Pay an order already paid | `400` "Order is already paid" |
| Pay a voided or refunded order | `400` "A voided order cannot be paid" |
| Unpay an order that was never paid | `400` "Order is not marked paid" |
| Serve an order already served | `400` "Order is already served" |

### `GET /orders/summary?date=YYYY-MM-DD`

Defaults to today, and counts **paid** `COMPLETED` orders — takings mean money
received. What has been rung up and not settled comes back separately as
`unpaidOrderCount` and `unpaidTotal`, so the day's total does not climb and fall as
tables settle.

```json
{
  "date": "2026-08-31",
  "orderCount": 42,
  "totalSales": 18450,
  "byPaymentMethod": [
    { "paymentMethod": "CASH", "orderCount": 30, "total": 12100 },
    { "paymentMethod": "BKASH", "orderCount": 12, "total": 6350 }
  ],
  "topItems": [
    {
      "name": "Cappuccino",
      "categoryId": "7c1f…",
      "categoryName": "Drinks",
      "quantitySold": 37,
      "revenue": 6660
    }
  ],
  "itemsSold": [ "…" ]
}
```

`itemsSold` is every item sold in the period — name, category, quantity and revenue
— ranked by quantity sold. `topItems` is the first five of that same list, so the two
can never disagree. Items sold under no category (or whose menu item has since been
deleted) report `categoryId: null` and `categoryName: "Uncategorized"`.

Category exclusion in the best-seller list is a reading preference and is applied by
the client over `itemsSold`; it never changes the totals the API reports.

### `POST /orders/:id/void` and `POST /orders/:id/refund`

Status transitions; nothing is deleted, and the order drops out of sales reporting
because only `COMPLETED` orders are counted. Both return the updated order.

The two are not interchangeable, and the status is the record of which happened:
**void** means the order should never have been rung up (mis-punched, cancelled before
handover), **refund** means the sale happened and the money went back. Neither is
reversible, so the transitions are guarded symmetrically:

| Attempt | Result |
| ------- | ------ |
| Void an order already `VOIDED` | `400` "Order is already voided" |
| Void a `REFUNDED` order | `400` "Cannot void a refunded order — the money has already been returned" |
| Refund an order already `REFUNDED` | `400` "Order is already refunded" |
| Refund a `VOIDED` order | `400` "Cannot refund a voided order" |

---

## 8. Expenses

All routes require **`OWNER`**.

Spending is recorded against a **catalogued item**, not a typed title. The shape
is category → item → entries: add "Chicken" under "Groceries" once, then record
what it cost each time it is bought. Entries are dated, so a day reads as what
was actually bought that day — 1 kg of chicken today; bread, 7up and biscuits
tomorrow.

### Expense categories

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/expenses/categories` | Create — `{ name }`, unique within the shop |
| `GET` | `/expenses/categories` | List |
| `PATCH` | `/expenses/categories/:id` | Rename |
| `DELETE` | `/expenses/categories/:id` | Delete — **`409`** while it still holds items |

> A category holding items cannot be deleted: doing so would cascade the item
> list away, and with it the only place the shop's buying history is organised.
> Move or delete the items first. Past expenses of a deleted category survive as
> uncategorized.

### Expense items (the catalogue)

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/expenses/items` | Create |
| `GET` | `/expenses/items` | List; filters `categoryId`, `includeInactive` |
| `GET` | `/expenses/items/:id` | One item |
| `PATCH` | `/expenses/items/:id` | Update (partial) |
| `DELETE` | `/expenses/items/:id` | Delete if never bought, otherwise retire |

```json
{
  "name": "Chicken",
  "categoryId": "uuid",
  "unit": "kg",
  "defaultUnitPrice": 320
}
```

`unit` defaults to `"pcs"`. `defaultUnitPrice` is optional and only pre-fills an
entry — leave it `null` when the price varies every time. A name has to be unique
within its category (`409` otherwise); `categoryId` is required, since the
category is how the item list is browsed.

> Posting a name held by a **retired** item in that category revives that item —
> same id, its history intact — with whatever `unit` and `defaultUnitPrice` the
> request carries (each falls back to what the retired row already had). Only a
> live item of that name is a `409`. Setting `isActive: true` via `PATCH` does
> the same thing when the id is already known.

> `DELETE` returns `200` with `{ "deleted": boolean, "item"?: ExpenseItem }`
> rather than `204`. An item with purchases behind it is **retired**
> (`isActive: false` — hidden from the pick lists, history untouched) instead of
> deleted, and the caller has to be able to tell the two apart. Retired items are
> excluded from `GET /expenses/items` unless `includeInactive=true`.

### Expenses (the entries)

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/expenses/summary` | Monthly summary; `month=YYYY-MM`, defaults to the current month |
| `GET` | `/expenses/days` | Days of a month that have spending; `month=YYYY-MM` |
| `POST` | `/expenses/bulk` | Record a whole basket against one date |
| `POST` | `/expenses` | Record one purchase |
| `GET` | `/expenses` | List; filters `date`, `month`, `categoryId`, `itemId` |
| `GET` | `/expenses/:id` | One expense |
| `PATCH` | `/expenses/:id` | Update (partial) |
| `DELETE` | `/expenses/:id` | Delete |

```json
{
  "itemId": "uuid",
  "quantity": 1.5,
  "unitPrice": 320,
  "expenseDate": "2026-09-09",
  "note": "Bought from the morning market"
}
```

`expenseDate` defaults to today. `amount` may be **omitted** when `quantity` and
`unitPrice` are both known — the server stores `quantity × unitPrice`; sending
`amount` wins, so an odd price paid on the day is recorded exactly. `unitPrice`
and `unit` default to the item's. An `itemId` from another shop is a `400`, and
so is an entry with no amount and nothing to multiply.

The stored row carries `title`, `categoryId`, `unit` and `unitPrice` **copied
from the item** at the time it was recorded. That is deliberate: renaming,
re-filing or retiring an item never rewrites what the books say was bought.

> `title` stays `NOT NULL` and `itemId` is nullable, because entries recorded
> before the item catalogue existed are still valid — they have a typed title and
> no item. Editing one leaves it item-less unless an item is chosen. Everything
> recorded from now on has both.

> On `PATCH`, only the fields you send are touched. Changing `itemId` re-derives
> the title, category, unit and price from the new item; changing `quantity` or
> `unitPrice` without an `amount` recomputes the total.

### `POST /expenses/bulk`

A day's shopping, saved as one unit — the basket built up item by item on screen,
then committed together. Applied in a transaction, so a day can never land
half-recorded; the items are all resolved before anything is written, so one bad
id fails the whole request. Up to 200 lines. Responds with the created entries.

```json
{
  "expenseDate": "2026-09-10",
  "entries": [
    { "itemId": "uuid", "quantity": 4, "unitPrice": 55 },
    { "itemId": "uuid", "quantity": 6, "unitPrice": 35 },
    { "itemId": "uuid", "quantity": 3, "amount": 120 }
  ]
}
```

### `GET /expenses/days?month=YYYY-MM`

Newest first. Only days with spending on them — for the day picker, where a run
of empty days is noise rather than information.

```json
[
  { "date": "2026-09-10", "entryCount": 3, "total": 560 },
  { "date": "2026-09-09", "entryCount": 1, "total": 320 }
]
```

### `GET /expenses/summary?month=YYYY-MM`

```json
{
  "month": "2026-09",
  "expenseCount": 23,
  "totalExpenses": 41500,
  "byCategory": [
    { "categoryId": "uuid", "categoryName": "Groceries", "expenseCount": 12, "total": 21000 },
    { "categoryId": null, "categoryName": "Uncategorized", "expenseCount": 2, "total": 1500 }
  ],
  "byItem": [
    { "itemId": "uuid", "itemName": "Chicken", "entryCount": 8, "totalQuantity": 12.5, "unit": "kg", "total": 4000 },
    { "itemId": null, "itemName": "September shop rent", "entryCount": 1, "totalQuantity": 0, "unit": null, "total": 18000 }
  ]
}
```

`byItem` groups on the stored `title`, so retired items and pre-catalogue entries
still appear. `totalQuantity` only means something when `unit` is the same
throughout the period.

---

## 9. Dashboard

### `GET /dashboard?date=YYYY-MM-DD` — **`OWNER`**

One call covering three horizons around the reference day — the day itself, its month
and its year — plus a twelve-month trend, so the owner screen needs no client-side
arithmetic and cannot mix figures read at different moments.

```json
{
  "date": "2026-09-06",
  "month": "2026-09",
  "year": "2026",
  "periods": {
    "day":   { "…": "PeriodOverview" },
    "month": { "…": "PeriodOverview" },
    "year":  { "…": "PeriodOverview" }
  },
  "monthlyTrend": [
    { "month": "2026-01", "orderCount": 10, "totalSales": 5000, "totalExpenses": 1500, "netProfit": 3500 }
  ],
  "today": { "…": "unchanged, the same shape as GET /orders/summary" },
  "monthToDate": {
    "totalSales": 512000,
    "totalExpenses": 41500,
    "netProfit": 470500,
    "expensesByCategory": [ "…" ]
  }
}
```

Each `PeriodOverview` is the same shape whichever horizon it describes:

```json
{
  "label": "2026-09",
  "sales": {
    "orderCount": 30,
    "totalSales": 9000,
    "averageOrderValue": 300,
    "byPaymentMethod": [ "…" ],
    "topItems": [ "…" ],
    "itemsSold": [ "…" ]
  },
  "expenses": {
    "expenseCount": 12,
    "totalExpenses": 3000,
    "byCategory": [ "…" ]
  },
  "netProfit": 6000
}
```

- `label` is `YYYY-MM-DD`, `YYYY-MM` or `YYYY` for the day, month and year respectively.
- `netProfit` is `totalSales − totalExpenses` for that period, and goes **negative**
  when a period spent more than it took.
- `averageOrderValue` is `0` — never `null` or `NaN` — for a period with no orders.
- `monthlyTrend` always holds **twelve** entries, including months with no activity, so
  a chart drawn from it has no gaps.
- Period boundaries follow the business timezone: a sale at 00:30 Dhaka on 1 January
  counts in the new year, and one at 23:30 on 31 December counts in the old one.
- `today` and `monthToDate` are the endpoint's original fields, still served unchanged.

> Sales figures across the dashboard count `COMPLETED` orders only, so voiding or
> refunding an order removes it from every period it appeared in.

---

## 10. Printing

Available to `OWNER` and `STAFF` — the bridge signs in as an ordinary shop user, so it
needs no special role. All jobs are scoped to the caller's shop. Background
architecture is in [TECHNICAL.md §8](TECHNICAL.md#8-receipt-printing).

### Till side

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/print-jobs` | Queue a slip |
| `GET` | `/print-jobs/printer-status` | Is this shop's printer reachable right now? |
| `GET` | `/print-jobs` | Recent jobs, newest first; filters `status`, `limit` |
| `POST` | `/print-jobs/:id/retry` | Requeue a `FAILED` slip |

#### `POST /print-jobs`

```json
{ "type": "RECEIPT", "payload": { "…": "receipt contents" } }
```

`payload` is stored verbatim as `jsonb` and is opaque to the backend: it is the same
object the frontend builds for browser printing, so one shape serves both paths. The
job is created `PENDING` with `attempts: 0`.

#### `GET /print-jobs/printer-status`

```json
{
  "online": true,
  "stationOnline": true,
  "stationName": "Counter PC",
  "lastSeenAt": "2026-08-31T09:13:58.000Z",
  "lastError": null,
  "pendingJobs": 0
}
```

`stationOnline` means a bridge checked in within the last 30 seconds; `online`
additionally requires that its printer port was open. The POS queues a job only when
`online` is true, and otherwise falls back to the browser print dialog.

### Bridge side

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/print-jobs/claim` | Claim pending slips — this call is also the station heartbeat |
| `POST` | `/print-jobs/:id/ack` | Report whether a claimed slip printed |

#### `POST /print-jobs/claim`

```json
{
  "name": "Counter PC",
  "printerConnected": true,
  "lastError": null,
  "limit": 5
}
```

Returns the claimed jobs (now `PRINTING`, with `attempts` incremented). Selection uses
`FOR UPDATE SKIP LOCKED`, so concurrent bridges never receive the same slip. The same
call upserts the shop's single `PrintStation` row, which is what
`printer-status` reports on.

#### `POST /print-jobs/:id/ack`

```json
{ "success": false, "error": "COM3: Access is denied" }
```

`success: true` marks the job `DONE`. `success: false` returns it to `PENDING` for
another attempt, or marks it `FAILED` once `attempts` reaches 3, keeping `error` as the
last failure. A job claimed but never acknowledged is requeued automatically after 60
seconds; anything still pending after 10 minutes is failed rather than printed.
