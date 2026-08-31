export enum PrintJobStatus {
  /** Waiting for a station to claim it. */
  PENDING = 'PENDING',
  /** Claimed by a station; not yet confirmed printed. */
  PRINTING = 'PRINTING',
  DONE = 'DONE',
  /** Gave up after MAX_ATTEMPTS. `error` holds the last failure. */
  FAILED = 'FAILED',
}
