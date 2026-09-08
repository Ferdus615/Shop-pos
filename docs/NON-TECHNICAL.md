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

### 2. Ring up an order

Pick what the customer is buying and how many of each, put in the **table number**
(leave it empty for a counter or takeaway sale), and send the order. The kitchen ticket
prints straight away with the table in big letters.

Nothing is treated as money yet — the order goes on the Sales list as **unpaid** and
**waiting**. You never do the maths; it always uses your current menu prices.

**If the table orders again before paying**, the new items join the same bill rather
than starting a second one, so there is only ever one bill to settle per table. Once
they have paid, the next round starts a fresh bill.

### 3. Print receipts

If the shop has a Bluetooth thermal printer, receipts print automatically at checkout.
The app tries three ways in order, so you can always hand over a receipt:

1. straight to the printer, if you're ringing up on the counter computer itself;
2. through the counter computer, if you're on a tablet or phone;
3. the normal print dialog, if the counter computer is switched off.

The app tells you which happened. One note: thermal printers can only print Latin
letters and numbers, so Bengali item names come out as `?` — for now, give items Latin
names on the menu.

### 4. The Tables screen

This is the screen for whoever is working the floor. It shows **only what still needs
doing** — every table that is waiting for food, owes money, or both — as one card per
table:

- what is on each bill, and how long it has been waiting,
- an amber warning once something has been waiting more than 15 minutes,
- **Done** and **Paid** buttons right there on the card,
- a table with two rounds shows both bills together under one heading,
- counter and takeaway orders are grouped under "Counter".

Along the top it tells you how many tables are open, how many orders are waiting to go
out, and how much money is still unsettled. It refreshes itself every few seconds, so
two people can work from it at once and each sees what the other has marked. When
everything is served and settled, it simply says "Nothing open".

Your staff have this screen too.

### 5. Mark orders done and paid

The Sales list is the working list for the floor. Each order shows two things at once:

- **Done / Waiting** — whether the food has gone out.
- **Paid / Unpaid** — whether the money has been taken.

They are separate on purpose: food often goes out long before the bill is settled, and
sometimes the other way round. Tap **Done** when the food is served, and **Paid** when
they pay — that asks how they paid (cash, bKash or Nagad), works out the change if it
is cash, and prints the customer's receipt.

The tabs at the top of the list cut it down to **Unpaid** or **Waiting**, so you can
see at a glance what still needs doing. Your staff can work this list too.

### 6. See your daily sales

Pick any day (it opens on today) and see:

- **Collected** — money actually taken that day,
- **Unpaid** — rung up but not settled yet, shown apart in amber so it is never
  mistaken for takings,
- how many paid orders and the average,
- how customers paid,
- your best-selling items,
- every order from that day, with the details of each.

Your sales figure only counts money you have actually received, which is why an unpaid
table does not move it.

### 7. Cancel a sale: void or refund

Open any order from the sales list and you get two choices, because two different
things can go wrong:

- **Void** — the sale should never have been rung up: wrong buttons pressed, the
  customer changed their mind before you handed anything over, or someone was testing
  the till.
- **Refund** — the sale did happen and you gave the money back.

Both take the order out of that day's takings, and neither deletes anything: the order
stays on record, marked "Voided" or "Refunded". Keeping them apart matters at
month-end — "we mis-punched four orders" tells a very different story from "we refunded
four customers".

Each one asks you to confirm first, because neither can be undone.

### 8. Manage your staff

Add an account for each person who works the till, and switch it off when they leave.
Their past sales stay on record.

### 9. Track your expenses

Record what you spend — rent, supplies, bills — sorted into your own categories.
**Every new expense starts with its category**: the dialog asks for it first and will
not save without one, so nothing ends up in a nameless pile. If the category you need
does not exist yet, add it right there in the same dialog — you never have to leave
and come back. Anything you recorded before this rule keeps whatever it had.
The Expenses screen opens on this month and shows your total, how many entries there
are, your biggest category, and what each category cost you. Pick another month from
the month box to look back.

### 10. Owner dashboard

The screen you land on when you sign in. It answers "how is the shop doing?" over
three spans at once — **today, this month, and this year**:

- three cards at the top showing what you took in each span, and your profit for it;
- tap one to see that span in full: sales, number of orders, average sale, what you
  spent, and your profit;
- where the money went, by expense category, and how customers paid;
- your best sellers for that span, with a button per category so you can leave a
  category (drinks, say) out of the ranking — hiding it changes nothing about the
  takings, only which items compete for the top spots, and the choice is remembered
  on your device;
- the full list of everything sold in that span and how many of each;
- a **month-by-month chart** of the whole year — takings beside spending, so a bad
  month is visible at a glance. Hover a month for its exact figures, or press "View as
  table" if you would rather read the numbers.

A month where you spent more than you took is shown in red and labelled as such, so a
loss is never mistaken for a gain. Pick any past day with the date box to look back.

## Who can log in, and what they see

Three kinds of login:

- **Owner (you)** — everything: the till, the menu, sales figures, expenses, and staff
  accounts.
- **Staff** — work the till, the Tables screen and the Sales list (marking orders done
  and paid), and can read the menu. They **cannot** change prices, see the dashboard, touch expenses, or
  manage accounts — and they cannot void or refund an order, which stays your call.
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

- **A "void" button** for cancelling an order rather than refunding it (the engine
  already supports it).
- **Nothing outstanding for you to choose** — signing in as the owner now opens the
  dashboard, while staff still open straight onto the till.
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
