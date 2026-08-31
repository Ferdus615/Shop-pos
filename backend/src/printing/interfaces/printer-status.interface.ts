/** What a till needs to decide between the bridge and the browser dialog. */
export interface PrinterStatus {
  /** A bridge checked in recently AND had its printer port open. */
  online: boolean;
  /** A bridge checked in recently, whatever the printer is doing. */
  stationOnline: boolean;
  stationName: string | null;
  lastSeenAt: string | null;
  lastError: string | null;
  /** Jobs still waiting to print. */
  pendingJobs: number;
}
