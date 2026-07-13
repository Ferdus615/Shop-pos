# Shop POS — Plain-Language Guide

_Audience: the shop owner and anyone who doesn't need the technical detail._
_Last updated: 2026-07-12._

## What is this?

This is the "engine" (the **backend**) of an app for running your shop. It's the part
that stores all your information and does the calculations. On top of it we'll later
build the **screens** you actually tap and click (the frontend). Think of it like a
cash register's brain: right now the brain is built and working; next we build the
buttons and display.

## What can it do today?

### 1. Manage your menu
You can add the things you sell — group them into categories (e.g. "Beverages",
"Snacks"), give each item a name, a price, a description, and mark whether it's
currently available. You can edit prices or details any time.

### 2. Ring up sales (the POS)
You pick the items a customer is buying and how many of each, choose how they paid
(cash, card, or mobile), and the system:
- adds everything up for you,
- applies any discount,
- records the sale with a receipt number and a timestamp.

You never have to do the math — it uses the current menu prices automatically.

### 3. See your daily sales
At the end of the day (or any day you pick from a calendar) you can see:
- how much money you made,
- how many orders you had,
- how customers paid (cash vs card vs mobile),
- your best-selling items.

By default it shows **today**.

### 4. Track your expenses
You can record what you spend — rent, supplies, bills — and sort them into categories.
Then you can see a **monthly total** and where the money went, so you know your costs.
By default it shows **this month**.

### 5. Owner dashboard
A single at-a-glance view combining today's sales with this month's sales, expenses,
and your **net profit** (sales minus expenses).

## Who can use it and what they can see

There are two kinds of logins:

- **Owner (you)** — full access to everything: menu, sales, reports, expenses, and
  managing staff accounts.
- **Staff** — can ring up sales and view the menu, but **cannot** see your financial
  reports, change prices, or manage expenses. This keeps your business numbers
  private while letting staff serve customers.

Everyone logs in with an email and password, so only authorized people can use it.

## Why we built it this way (in plain terms)

- **Your money numbers are exact.** Prices and totals are stored precisely, so reports
  always add up to the cent.
- **Old sales never change.** If you raise the price of a coffee tomorrow, yesterday's
  receipts still show what you actually charged. Your history stays honest.
- **Staff can't peek at profits.** The system enforces who sees what, automatically.
- **The math is done for you.** Totals, discounts, daily and monthly summaries, and
  profit are all calculated by the system.
- **Nothing is lost.** Removing a category or an old staff member doesn't erase your
  past sales records.

## What's next?

- **The screens (frontend):** the actual app you'll use on a tablet/computer — a POS
  screen, menu editor, sales calendar, expense pages, and a dashboard.
- **Nice-to-haves later:** printed/emailed receipts, refunds, per-item tax rules,
  multiple shops, and charts/graphs.

## A quick word on cost & privacy

- It runs on standard, widely-used, free/open-source technology — no expensive
  licenses.
- Your data lives in your own database. Staff and owner access are separated and
  password-protected.
