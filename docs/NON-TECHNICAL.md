# Shop POS — Plain-Language Guide

_Audience: shop owners and anyone who doesn't need the technical detail._
_Last updated: 2026-09-06._

## What is this?

An app for running your shop from a tablet, phone or computer. It has three parts:

- **The screens you tap** — the till, your menu, your sales figures, your staff list.
- **The engine behind them** — stores everything and does all the calculations.
- **A small printer helper** — a program on the shop's counter computer that makes
  receipts come out of your Bluetooth printer.

Each shop on the system is completely separate. Your menu, your sales and your staff
are visible only to you and the people you give accounts to.

## What can it do today?

### 1. Manage your menu

Add the things you sell, grouped into categories (for example "Beverages", "Snacks").
Each item has a name, a price, a description, an optional photo, and a switch for
whether it's currently available. You can change prices any time.

### 2. Ring up sales

Pick what the customer is buying and how many of each, choose how they paid — **cash,
bKash or Nagad** — and the app:

- adds everything up,
- applies any discount you enter,
- records the sale with a receipt number and a timestamp.

You never do the maths. It always uses your current menu prices.

### 3. Print receipts

If the shop has a Bluetooth thermal printer, receipts print automatically at checkout.
The app tries three ways in order, so you can always hand over a receipt:

1. straight to the printer, if you're ringing up on the counter computer itself;
2. through the counter computer, if you're on a tablet or phone;
3. the normal print dialog, if the counter computer is switched off.

The app tells you which happened. One note: thermal printers can only print Latin
letters and numbers, so Bengali item names come out as `?` — for now, give items Latin
names on the menu.

### 4. See your daily sales

Pick any day (it opens on today) and see:

- how much money you took,
- how many orders you had,
- how customers paid,
- your best-selling items,
- every order from that day, with the details of each.

### 5. Refund an order

If something has to be given back, refund the order from the sales list. Nothing is
deleted — the record stays, and the money comes back out of the day's total, so your
figures stay honest.

### 6. Manage your staff

Add an account for each person who works the till, and switch it off when they leave.
Their past sales stay on record.

### 7. Track your expenses

Record what you spend — rent, supplies, bills — sorted into your own categories. Set
up your categories once (like your menu categories), then file each expense under one.
The Expenses screen opens on this month and shows your total, how many entries there
are, your biggest category, and what each category cost you. Pick another month from
the month box to look back.

### 8. Owner dashboard

One view combining today's sales with this month's sales, expenses, and your **net
profit** (sales minus expenses). _Also built in the engine, with the screen still to
come._

## Who can log in, and what they see

Three kinds of login:

- **Owner (you)** — everything: the till, the menu, sales figures, expenses, and staff
  accounts.
- **Staff** — can ring up sales and see the menu, but **cannot** see your sales totals,
  change prices, or touch expenses. Your business numbers stay private while your staff
  serve customers.
- **System administrator** — the person who set the platform up. They can create a new
  shop and switch one off, but they **cannot** see any shop's menu, sales or money. Not
  yours, not anyone's.

Everyone signs in with an email and password, so only the people you've given accounts
to can get in.

## Why it's built this way (in plain terms)

- **Your money numbers are exact.** Amounts are stored precisely, so reports add up to
  the last paisa.
- **Old sales never change.** Raise the price of a coffee tomorrow and yesterday's
  receipts still show what you actually charged. Your history stays honest.
- **Staff can't peek at profits.** The system enforces who sees what automatically — it
  isn't a matter of hiding a button.
- **Your shop's data is yours alone.** Other shops on the system cannot see it, and
  neither can the administrator.
- **The maths is done for you.** Totals, discounts, daily and monthly summaries and
  profit are all calculated.
- **Nothing is lost.** Removing a category, an old menu item or a staff member never
  erases past sales.
- **A receipt is always obtainable.** If the printer helper is off, the app falls back
  to the normal print dialog rather than failing.

## What's next?

- **The owner dashboard** — the last screen: today's takings, this month's expenses
  and your profit, all in one view.
- **A "void" button** for cancelling an order rather than refunding it (the engine
  already supports it).
- **Later ideas:** charts and trends, partial refunds, per-item tax, stock tracking,
  exporting to a spreadsheet for your accountant, and printing Bengali item names.

## A quick word on cost and privacy

- It runs on standard, widely-used, free and open-source technology — no licence fees.
- Your data lives in one database that only the app can reach, over an encrypted
  connection.
- Passwords are stored scrambled, in a way that cannot be reversed — not even by
  whoever runs the system.
- Owner, staff and administrator access are genuinely separated, and enforced by the
  system rather than by trust.

One thing to do on day one: change the starter passwords you were given. They're
written down in this project's setup notes, so they're a convenience for installation,
not a secret.
