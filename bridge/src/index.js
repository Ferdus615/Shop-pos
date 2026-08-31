/**
 * Shop POS print bridge.
 *
 * Runs on the counter PC that the Bluetooth printer is paired to. Polls the
 * backend for slips its shop has queued, renders them to ESC/POS, and writes
 * them to the printer.
 *
 * Why a bridge at all: a browser cannot open a Bluetooth Classic serial port.
 * Chrome's Web Bluetooth only speaks BLE GATT, and iOS blocks non-MFi serial
 * outright -- so the tills (Windows, Android and iPad alike) queue a job and
 * this process does the printing.
 */
import { createServer } from 'node:http';
import { Api } from './api.js';
import { config } from './config.js';
import { Printer } from './printer.js';
import { renderJob } from './render.js';

/** Backoff bounds for when the backend is unreachable. */
const MIN_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 60000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const api = new Api(config);
const printer = new Printer(config);

let running = true;

/** Render and print one job. Throws if the slip did not make it to paper. */
async function printJob(job) {
  const bytes = renderJob(job, config);
  await printer.write(bytes);
}

/** One poll: claim whatever is waiting, print it, report back. */
async function pollOnce() {
  const jobs = await api.claim({
    printerConnected: printer.connected,
    lastError: printer.lastError,
  });

  if (!Array.isArray(jobs) || !jobs.length) return;

  console.log('[bridge] claimed ' + jobs.length + ' job(s)');

  for (const job of jobs) {
    try {
      await printJob(job);
      await api.ack(job.id, true);
      console.log('[bridge] printed ' + job.type + ' ' + job.id);
    } catch (err) {
      console.error('[bridge] job ' + job.id + ' failed: ' + err.message);
      // Report it so the backend can retry or surface it in the POS. If even
      // the ack fails, the job goes stale and is requeued server-side.
      try {
        await api.ack(job.id, false, err.message);
      } catch (ackErr) {
        console.error('[bridge] could not report failure: ' + ackErr.message);
      }
      // Stop this batch: if the printer is down the rest will fail too.
      break;
    }
  }
}

async function mainLoop() {
  let backoff = MIN_BACKOFF_MS;

  while (running) {
    try {
      await pollOnce();
      backoff = MIN_BACKOFF_MS;
      await sleep(config.pollIntervalMs);
    } catch (err) {
      console.error('[bridge] poll failed: ' + err.message);
      console.error('[bridge] retrying in ' + Math.round(backoff / 1000) + 's');
      await sleep(backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    }
  }
}

/**
 * Local fast path. A till running on this same machine can POST a slip
 * straight here, skipping the backend round trip.
 *
 * Bound to loopback only. Browsers treat http://127.0.0.1 as a secure origin
 * so an HTTPS page may call it, but Chrome requires the Private Network
 * Access header below on the preflight.
 */
function startLocalServer() {
  if (!config.localPort) return null;

  const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/status') {
      sendJson(res, 200, {
        station: config.stationName,
        printerConnected: printer.connected,
        lastError: printer.lastError,
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/print') {
      readBody(req)
        .then(async (body) => {
          await printJob({ type: body.type, payload: body.payload });
          sendJson(res, 200, { printed: true });
        })
        .catch((err) => {
          console.error('[local] ' + err.message);
          sendJson(res, 500, { printed: false, error: err.message });
        });
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  });

  server.listen(config.localPort, '127.0.0.1', () => {
    console.log('[bridge] local fast path on http://127.0.0.1:' + config.localPort);
  });
  return server;
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      // A receipt is a few KB; anything larger is not one.
      if (raw.length > 1000000) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        reject(new Error('Body was not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

async function main() {
  console.log('[bridge] starting; backend at ' + config.apiUrl);

  // Not fatal: the printer is often asleep at boot and wakes on first print.
  try {
    await printer.connect();
  } catch (err) {
    console.warn('[bridge] printer not ready yet: ' + err.message);
  }

  const server = startLocalServer();

  const shutdown = async (signal) => {
    console.log('[bridge] ' + signal + ' received, shutting down');
    running = false;
    if (server) server.close();
    await printer.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await mainLoop();
}

main().catch((err) => {
  console.error('[bridge] fatal: ' + err.message);
  process.exit(1);
});
