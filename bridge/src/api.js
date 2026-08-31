/**
 * Talks to the POS backend.
 *
 * The bridge signs in as an ordinary shop user, so it inherits the same tenant
 * scoping as everything else: the JWT carries the shop id, and the backend
 * only ever hands back that shop's slips. No separate device-token scheme to
 * secure, rotate, or leak.
 */

const REQUEST_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export class Api {
  constructor(config, logger = console) {
    this.config = config;
    this.logger = logger;
    this.token = null;
  }

  async login() {
    const data = await this.request('POST', '/auth/login', {
      email: this.config.email,
      password: this.config.password,
    }, { anonymous: true });

    if (!data?.accessToken) {
      throw new ApiError('Login response contained no accessToken', 0);
    }
    this.token = data.accessToken;
    this.logger.log('[api] signed in as ' + this.config.email);
    return this.token;
  }

  /**
   * Ask for pending slips. Doubles as the station heartbeat, so the POS knows
   * the printer is reachable even when nothing is printing.
   */
  claim(status) {
    return this.authed('POST', '/print-jobs/claim', {
      name: this.config.stationName,
      printerConnected: status.printerConnected,
      lastError: status.lastError ?? undefined,
      limit: 5,
    });
  }

  ack(jobId, success, error) {
    return this.authed('POST', '/print-jobs/' + jobId + '/ack', {
      success,
      ...(error ? { error: String(error).slice(0, 500) } : {}),
    });
  }

  /** Perform a request, signing in again once if the token has expired. */
  async authed(method, path, body) {
    if (!this.token) await this.login();
    try {
      return await this.request(method, path, body);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        this.logger.warn('[api] token rejected, signing in again');
        this.token = null;
        await this.login();
        return this.request(method, path, body);
      }
      throw err;
    }
  }

  async request(method, path, body, { anonymous = false } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(this.config.apiUrl + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(anonymous || !this.token
            ? {}
            : { Authorization: 'Bearer ' + this.token }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await response.text();
      const data = text ? safeJson(text) : null;

      if (!response.ok) {
        throw new ApiError(
          messageFrom(data) ?? response.status + ' ' + response.statusText,
          response.status,
        );
      }
      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new ApiError('Request to ' + path + ' timed out', 0);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Nest sends `message` as a string or an array of validation errors. */
function messageFrom(data) {
  const message = data?.message;
  if (!message) return null;
  return Array.isArray(message) ? message.join(', ') : String(message);
}
