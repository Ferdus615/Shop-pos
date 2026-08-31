/**
 * Owns the serial connection to the thermal printer.
 *
 * On Windows a paired Bluetooth Classic printer appears as an outgoing COM
 * port, so from here it is an ordinary serial device -- no Bluetooth code
 * needed. On Linux the same is true once `rfcomm bind` has created
 * /dev/rfcomm0.
 *
 * The port is opened lazily and reopened on demand: these printers drop the
 * link whenever they sleep or go out of range, so "connected" is a fact with
 * a short shelf life and every write has to be prepared to reconnect.
 */
import { SerialPort } from 'serialport';

/** Bytes per chunk. Bluetooth serial buffers are small; big writes get lost. */
const CHUNK_SIZE = 128;

/** Pause between chunks, giving the printer time to consume them. */
const CHUNK_DELAY_MS = 20;

const OPEN_TIMEOUT_MS = 10_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class Printer {
  constructor(config, logger = console) {
    this.config = config;
    this.logger = logger;
    this.port = null;
    this.lastError = null;
    /** Serialises writes so two slips can never interleave on the wire. */
    this.queue = Promise.resolve();
  }

  get connected() {
    return !!this.port && this.port.isOpen;
  }

  /** Open the port if it is not already open. Safe to call repeatedly. */
  async connect() {
    if (this.connected) return;

    // Drop any half-dead handle before making a new one.
    await this.close();

    const port = new SerialPort({
      path: this.config.printerPort,
      baudRate: this.config.baudRate,
      autoOpen: false,
    });

    // Without a listener, an async serial error would crash the process.
    port.on('error', (err) => {
      this.lastError = err.message;
      this.logger.warn('[printer] ' + err.message);
    });
    port.on('close', () => {
      this.logger.warn('[printer] port closed');
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timed out opening ' + this.config.printerPort)),
        OPEN_TIMEOUT_MS,
      );
      port.open((err) => {
        clearTimeout(timer);
        if (err) reject(new Error(this.config.printerPort + ': ' + err.message));
        else resolve();
      });
    });

    this.port = port;
    this.lastError = null;
    this.logger.log(
      '[printer] connected on ' +
        this.config.printerPort +
        ' at ' +
        this.config.baudRate +
        ' baud',
    );
  }

  /**
   * Send one slip. Reconnects first if needed, and resolves only once the
   * bytes have actually left the machine -- so the caller can tell the
   * backend "printed" and mean it.
   */
  write(buffer) {
    this.queue = this.queue.then(
      () => this.writeNow(buffer),
      () => this.writeNow(buffer), // a previous failure must not block this one
    );
    return this.queue;
  }

  async writeNow(buffer) {
    await this.connect();

    try {
      for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
        const chunk = buffer.subarray(offset, offset + CHUNK_SIZE);
        await new Promise((resolve, reject) => {
          this.port.write(chunk, (err) => (err ? reject(err) : resolve()));
        });
        await new Promise((resolve, reject) => {
          this.port.drain((err) => (err ? reject(err) : resolve()));
        });
        await sleep(CHUNK_DELAY_MS);
      }
    } catch (err) {
      this.lastError = err.message;
      // Force a fresh port next time; a failed write usually means the link
      // dropped, and writing into the stale handle would fail the same way.
      await this.close();
      throw err;
    }
  }

  async close() {
    const port = this.port;
    this.port = null;
    if (!port || !port.isOpen) return;
    await new Promise((resolve) => port.close(() => resolve()));
  }

  /** Port names this machine can see -- used by `npm run probe`. */
  static async list() {
    return SerialPort.list();
  }
}
