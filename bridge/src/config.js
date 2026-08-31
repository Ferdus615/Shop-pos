/**
 * Configuration, read once at startup from .env (or the real environment).
 *
 * Deliberately dependency-free: this runs on a shop counter PC where the
 * fewer moving parts, the better.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Minimal .env reader — KEY=value, `#` comments, no interpolation. */
function loadDotEnv() {
  try {
    const raw = readFileSync(join(here, '..', '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      // Existing environment wins, so `set VAR=... && npm start` still works.
      if (process.env[key] === undefined) {
        process.env[key] = trimmed.slice(eq + 1).trim();
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    // No .env is fine as long as the real environment supplies the values.
  }
}

loadDotEnv();

function required(key) {
  const value = process.env[key];
  if (!value) {
    console.error(
      `[config] ${key} is not set. Copy .env.example to .env and fill it in.`,
    );
    process.exit(1);
  }
  return value;
}

function int(key, fallback) {
  const parsed = Number.parseInt(process.env[key] ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(key, fallback) {
  const value = process.env[key];
  if (value === undefined) return fallback;
  return /^(1|true|yes)$/i.test(value.trim());
}

export const config = {
  apiUrl: (process.env.API_URL ?? 'http://localhost:3000').replace(/\/+$/, ''),
  email: required('BRIDGE_EMAIL'),
  password: required('BRIDGE_PASSWORD'),

  printerPort: required('PRINTER_PORT'),
  baudRate: int('PRINTER_BAUD', 9600),
  columns: int('PRINTER_COLUMNS', 32),
  hasCutter: bool('PRINTER_HAS_CUTTER', false),
  feedLines: int('PRINTER_FEED_LINES', 4),

  pollIntervalMs: int('POLL_INTERVAL_MS', 1500),
  stationName: process.env.STATION_NAME ?? 'Counter PC',
  localPort: int('LOCAL_PORT', 9110),
};
