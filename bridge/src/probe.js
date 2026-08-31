/**
 * Lists the serial ports this machine can see, so you can work out which one
 * the printer is on before filling in PRINTER_PORT.
 *
 *   npm run probe            list ports
 *   npm run probe -- COM3    list ports, then print a test slip on COM3
 */
import { Printer } from './printer.js';
import { renderJob } from './render.js';

const TEST_SLIP = {
  type: 'RECEIPT',
  payload: {
    shopName: 'Test Print',
    orderNumber: 'TEST-1',
    createdAt: new Date().toISOString(),
    paymentMethod: 'CASH',
    items: [{ name: 'Test item', quantity: 1, unitPrice: 1, lineTotal: 1 }],
    subtotal: 1,
    discount: 0,
    tax: 0,
    total: 1,
  },
};

const HINT = [
  'On Windows, pair the printer first, then look under',
  '  Settings, Bluetooth and devices, Devices, More Bluetooth settings, COM Ports',
  'and use the OUTGOING port.',
].join('\n');

const ports = await Printer.list();

if (!ports.length) {
  console.log('No serial ports found.');
  console.log(HINT);
} else {
  console.log('Serial ports on this machine:');
  console.log('');
  for (const port of ports) {
    const label = [port.manufacturer, port.friendlyName].filter(Boolean).join(' - ');
    console.log('  ' + port.path + (label ? '   (' + label + ')' : ''));
  }
}

const target = process.argv[2];
if (target) {
  console.log('');
  console.log('Printing a test slip on ' + target + ' ...');
  const config = {
    printerPort: target,
    baudRate: Number(process.env.PRINTER_BAUD || 9600),
    columns: Number(process.env.PRINTER_COLUMNS || 32),
    feedLines: Number(process.env.PRINTER_FEED_LINES || 4),
    hasCutter: false,
  };
  const printer = new Printer(config);
  try {
    await printer.write(renderJob(TEST_SLIP, config));
    console.log('Sent. Check the paper.');
  } catch (err) {
    console.error('Failed: ' + err.message);
    process.exitCode = 1;
  } finally {
    await printer.close();
  }
}
