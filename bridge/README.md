# Shop POS Print Bridge

Prints Shop POS receipts on a Bluetooth thermal printer (BT583 and similar
58mm ESC/POS units) attached to a shop's counter PC.

## Why this exists

A web page cannot talk to this printer. Browsers' only Bluetooth API is Web
Bluetooth, which speaks **BLE GATT** — while these printers are **Bluetooth
Classic (SPP)**, a different radio protocol. iOS blocks non-MFi serial
entirely, and Android Chrome cannot open a serial port at all.

So the printer is owned by this small Node process on the counter PC. The
tills — Windows, Android, iPad, whatever — queue a slip through the POS
backend, and this bridge claims it and prints it.

```
Any till                     Backend              Counter PC (this)
  webapp  ──POST /print-jobs──►  queue  ◄──poll──  bridge ──COM port──►  BT583
```

On Windows a paired Bluetooth printer shows up as an ordinary outgoing COM
port, so there is no Bluetooth code here at all — just a serial write.

## Setup

### 1. Pair the printer with the counter PC

**Windows:** Settings → Bluetooth & devices → Add device. The PIN is usually
`0000` or `1234`. Then open *More Bluetooth settings → COM Ports* and note the
port marked **Outgoing**.

**Linux:** `sudo rfcomm bind 0 <printer-mac> 1` gives you `/dev/rfcomm0`.

### 2. Find the port

```bash
npm install
npm run probe
```

This lists every serial port the machine can see. Bluetooth printers appear as
`Standard Serial over Bluetooth link`. If two show up, the **outgoing** one is
the one you want — and the quickest way to be sure is to test both:

```bash
npm run probe -- COM3    # lists ports, then prints a test slip on COM3
```

Whichever one produces paper is the right one.

### 3. Create a login for the bridge

In the POS, under **Staff**, add a user for this station — for example
`printer@shop.local`. It needs no special role, but it must belong to the shop
whose printer this PC is attached to. The bridge signs in as this user, so it
can only ever see that shop's slips.

### 4. Configure and run

```bash
cp .env.example .env      # then edit it
npm start
```

You should see:

```
[bridge] starting; backend at http://localhost:5000
[printer] connected on COM3 at 9600 baud
[api] signed in as printer@shop.local
[bridge] local fast path on http://127.0.0.1:9110
```

Ring up a sale on any till; the receipt comes out here.

## Running it permanently

The bridge must be running for slips to print. On Windows the simplest durable
option is a scheduled task set to run at logon:

```
schtasks /create /tn "Shop POS Print Bridge" /tr "node C:\path\to\bridge\src\index.js" /sc onlogon
```

For a service proper, [NSSM](https://nssm.cc/) wraps the same command.

## How printing is routed

The POS tries three paths in order, so a receipt is always obtainable:

| Path | When it is used | Speed |
| --- | --- | --- |
| **Local** — till POSTs to `127.0.0.1:9110` | The till *is* the counter PC | Instant |
| **Queued** — till POSTs to the backend, bridge polls | Any other till, once a station is online | ~1s |
| **Browser** — the system print dialog | No bridge online | Manual |

The POS knows which to use from `GET /print-jobs/printer-status`, which reports
whether a station has checked in recently with its printer port open.

## Reliability behaviour

- **Claims are exclusive.** Jobs are handed out with `FOR UPDATE SKIP LOCKED`,
  so two bridges on one shop never print the same receipt.
- **Crashes recover.** A job claimed but never acknowledged is requeued after
  60 seconds.
- **Failures stop.** After 3 attempts a slip is marked `FAILED` rather than
  looping forever. It can be requeued from `POST /print-jobs/:id/retry`.
- **Stale slips are dropped.** Anything still pending after 10 minutes is
  failed instead of printed — nobody wants a backlog of old receipts when the
  bridge comes back online.
- **Writes are chunked** at 128 bytes with a short pause between chunks;
  Bluetooth serial buffers are small and silently drop large writes.

## Known limitation: non-Latin text

ESC/POS printers render single-byte code pages. This bridge uses CP437, so
Latin letters, digits and punctuation print correctly, and **anything outside
it — Bengali, Arabic, Chinese — is replaced with `?`**.

This is a limitation of text-mode ESC/POS, not of this bridge: no thermal
printer can print Bengali as text. Doing it requires rendering the slip to a
bitmap and sending it as a raster image (`GS v 0`). If the menu has Bengali
item names, that is the change to make.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `API_URL` | `http://localhost:5000` | POS backend |
| `BRIDGE_EMAIL` / `BRIDGE_PASSWORD` | — | Shop user the bridge signs in as |
| `PRINTER_PORT` | — | `COM3`, `/dev/rfcomm0`, … |
| `PRINTER_BAUD` | `9600` | Try `19200`/`115200` if output is garbled |
| `PRINTER_COLUMNS` | `32` | 32 for 58mm paper, 48 for 80mm |
| `PRINTER_HAS_CUTTER` | `false` | Most 58mm printers have none |
| `PRINTER_FEED_LINES` | `4` | Blank lines fed so the slip clears the tear bar |
| `POLL_INTERVAL_MS` | `1500` | How often to check for new slips |
| `STATION_NAME` | `Counter PC` | Shown in the POS printer status |
| `LOCAL_PORT` | `9110` | Local fast path; `0` disables it |

## Troubleshooting

**Nothing prints, no error.** The bridge is probably not running, or is signed
in as a user from a different shop. Check its console.

**`Access is denied` opening the port.** Another program holds it — often a
previous copy of the bridge still running.

**Garbled characters.** Wrong baud rate; try `19200` or `115200`. If only
*some* characters are wrong, see the non-Latin limitation above.

**Text runs off the paper.** `PRINTER_COLUMNS` is too high — 58mm paper is 32.

**Prints, then stops after a while.** The printer went to sleep. The bridge
reconnects on the next slip; if it does not, the port name may change on
re-pair.
