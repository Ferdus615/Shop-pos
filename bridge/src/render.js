/**
 * Turns a print-job payload into the ESC/POS byte stream a thermal printer
 * understands.
 *
 * The payload is the same object the web app builds for browser printing, so
 * a slip looks the same however it was produced.
 *
 * CHARACTER SET CAVEAT: ESC/POS printers render single-byte code pages
 * (CP437 here). Latin text and digits print correctly; scripts outside it --
 * Bengali, Arabic, Chinese -- cannot be printed as text by any ESC/POS printer
 * and are replaced with '?'. Printing those requires rasterising the slip to
 * a bitmap and sending it with GS v 0, which this bridge does not do yet.
 */

// --- ESC/POS control codes --------------------------------------------------
const ESC = 0x1b;
const GS = 0x1d;

const CMD = {
  init: [ESC, 0x40],
  alignLeft: [ESC, 0x61, 0],
  alignCenter: [ESC, 0x61, 1],
  alignRight: [ESC, 0x61, 2],
  boldOn: [ESC, 0x45, 1],
  boldOff: [ESC, 0x45, 0],
  /** GS ! n -- low nibble = width multiplier, high nibble = height. */
  size: (w, h) => [GS, 0x21, ((w - 1) << 4) | (h - 1)],
  /** ESC t n -- select code page 0 (CP437). */
  codepage: [ESC, 0x74, 0],
  cut: [GS, 0x56, 0x42, 0x00],
};

/**
 * CP437 has no Bengali/CJK. Fold what we can (accented Latin to ASCII) and
 * replace the rest, so a stray character never desyncs the byte stream.
 */
function encodeText(text) {
  const folded = String(text)
    .normalize('NFKD')
    // Strip combining marks left behind by the decomposition.
    .replace(/\p{M}/gu, '');

  const bytes = [];
  for (const char of folded) {
    const code = char.codePointAt(0);
    bytes.push(code >= 0x20 && code <= 0x7e ? code : 0x3f); // '?' fallback
  }
  return bytes;
}

/** Accumulates commands and text into one buffer. */
class Slip {
  constructor(columns) {
    this.columns = columns;
    this.bytes = [];
    // Width multiplier currently selected via GS ! -- double-width text fits
    // half as many characters per line, and wrapping has to know that.
    this.scale = 1;
  }

  cmd(...codes) {
    this.bytes.push(...codes.flat());
    return this;
  }

  /** Select character size AND keep the effective line width in sync. */
  size(width, height) {
    this.scale = width;
    return this.cmd(CMD.size(width, height));
  }

  /** Characters that actually fit on a line at the current size. */
  get width() {
    return Math.max(1, Math.floor(this.columns / this.scale));
  }

  /** Write text, wrapping at the paper width. */
  text(value) {
    for (const line of wrap(String(value), this.width)) {
      this.bytes.push(...encodeText(line), 0x0a);
    }
    return this;
  }

  /** left flush-left, right flush-right, on one line. */
  pair(left, right) {
    const rightStr = String(right);
    const room = this.width - rightStr.length;
    // A long name loses characters rather than pushing the amount onto its
    // own line -- the amount is the part that must stay readable.
    const leftStr = String(left).slice(0, Math.max(0, room - 1));
    const gap = ' '.repeat(Math.max(1, room - leftStr.length));
    this.bytes.push(...encodeText(leftStr + gap + rightStr), 0x0a);
    return this;
  }

  rule(char) {
    this.bytes.push(...encodeText((char || '-').repeat(this.width)), 0x0a);
    return this;
  }

  feed(lines) {
    for (let i = 0; i < (lines || 1); i += 1) this.bytes.push(0x0a);
    return this;
  }

  toBuffer() {
    return Buffer.from(this.bytes);
  }
}

function wrap(text, width) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph.length <= width) {
      lines.push(paragraph);
      continue;
    }
    let current = '';
    for (const word of paragraph.split(/\s+/)) {
      if (!current.length) {
        current = word;
      } else if (current.length + 1 + word.length <= width) {
        current += ' ' + word;
      } else {
        lines.push(current);
        current = word;
      }
      // A single word longer than the paper: hard-split it.
      while (current.length > width) {
        lines.push(current.slice(0, width));
        current = current.slice(width);
      }
    }
    if (current.length) lines.push(current);
  }
  return lines.length ? lines : [''];
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : '0.00';
}

function timestamp(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const day = date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  return day + '  ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

// --- Slips ------------------------------------------------------------------

function renderReceipt(payload, config) {
  const slip = new Slip(config.columns);
  const items = Array.isArray(payload.items) ? payload.items : [];

  slip.cmd(CMD.init, CMD.codepage);

  slip.cmd(CMD.alignCenter, CMD.boldOn).size(2, 2);
  slip.text(payload.shopName || 'Shop POS');
  slip.size(1, 1).cmd(CMD.boldOff);
  if (payload.shopAddress) slip.text(payload.shopAddress);
  if (payload.shopPhone) slip.text(payload.shopPhone);
  slip.feed(1);

  slip.cmd(CMD.alignLeft).rule('=');
  slip.text(('Order ' + (payload.orderNumber || '')).trim());
  if (payload.tableNumber) slip.text('Table ' + payload.tableNumber);
  slip.text(timestamp(payload.createdAt));
  slip.rule('=');

  // Items: name on its own line, then "qty x price" against the line total.
  for (const item of items) {
    slip.text(item.name || '');
    slip.pair(
      '  ' + item.quantity + ' x ' + money(item.unitPrice),
      money(item.lineTotal),
    );
  }

  slip.rule('-');
  slip.pair('Subtotal', money(payload.subtotal));
  if (Number(payload.discount) > 0) {
    slip.pair('Discount', '-' + money(payload.discount));
  }
  if (Number(payload.tax) > 0) {
    slip.pair('Tax', money(payload.tax));
  }

  slip.cmd(CMD.boldOn);
  slip.pair('TOTAL', money(payload.total));
  slip.cmd(CMD.boldOff);

  if (Number(payload.receivedAmount) > 0) {
    slip.pair('Received', money(payload.receivedAmount));
    slip.pair('Change', money(Math.max(0, payload.changeAmount || 0)));
  }

  slip.rule('-');
  slip.pair('Payment', String(payload.paymentMethod || ''));

  slip.feed(1).cmd(CMD.alignCenter);
  slip.text('*** Thank you, come again! ***');

  return finish(slip, config);
}

function renderKitchenTicket(payload, config) {
  const slip = new Slip(config.columns);
  const items = Array.isArray(payload.items) ? payload.items : [];

  slip.cmd(CMD.init, CMD.codepage);

  slip.cmd(CMD.alignCenter, CMD.boldOn);
  slip.text('KITCHEN ORDER');
  // The table is what the kitchen and the runner actually need, so it takes
  // the double-width line; the order number drops to a normal one.
  slip.size(2, 2);
  slip.text(
    payload.tableNumber
      ? 'TABLE ' + payload.tableNumber
      : String(payload.orderNumber || ''),
  );
  slip.size(1, 1).cmd(CMD.boldOff);
  if (payload.tableNumber) slip.text(String(payload.orderNumber || ''));
  slip.text(timestamp(payload.createdAt));

  slip.cmd(CMD.alignLeft).rule('=');

  // Bigger than the receipt: this is read at a glance across a hot kitchen.
  slip.cmd(CMD.boldOn).size(1, 2);
  for (const item of items) {
    slip.pair(item.name || '', 'x' + item.quantity);
  }
  slip.size(1, 1).cmd(CMD.boldOff);

  slip.rule('=');

  return finish(slip, config);
}

function finish(slip, config) {
  slip.cmd(CMD.alignLeft).feed(config.feedLines);
  if (config.hasCutter) slip.cmd(CMD.cut);
  return slip.toBuffer();
}

/** Render a job into printer bytes. Throws on an unknown job type. */
export function renderJob(job, config) {
  const payload = job.payload || {};
  switch (job.type) {
    case 'RECEIPT':
      return renderReceipt(payload, config);
    case 'KITCHEN':
      return renderKitchenTicket(payload, config);
    default:
      throw new Error('Unknown print job type: ' + job.type);
  }
}
