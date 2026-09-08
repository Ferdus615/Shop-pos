/**
 * Works out which browser origins may call this API.
 *
 * `origin: true` used to reflect whatever origin asked, which let any website
 * on the internet make browser requests against a deployment. The allowlist
 * comes from CORS_ORIGINS instead, comma-separated.
 *
 * Two things the plain list could not express:
 *
 * - **Preview deployments.** Vercel gives every preview its own hostname, and
 *   it changes on each deploy, so no fixed list can cover them. An entry may
 *   contain `*` as a wildcard for one hostname label.
 * - **A missing variable in production.** Falling back to localhost there
 *   produces a deployment that looks healthy while every browser request
 *   fails, which is a slow and confusing way to find out. In production the
 *   variable is required, and its absence stops the process at boot.
 */

/** Origins allowed when CORS_ORIGINS is unset, outside production. */
const DEVELOPMENT_ORIGINS = ['http://localhost:5001', 'http://localhost:3001'];

export class MissingCorsOriginsError extends Error {
  constructor() {
    super(
      'CORS_ORIGINS is not set. In production it has to list the origins the ' +
        'front ends are served from, or no browser can call this API.\n' +
        '  CORS_ORIGINS=https://your-project.vercel.app\n' +
        'Separate several with commas. One label may be a "*" wildcard, for ' +
        'preview deployments:\n' +
        '  CORS_ORIGINS=https://shop.example.com,https://shop-pos-*.vercel.app',
    );
    this.name = 'MissingCorsOriginsError';
  }
}

/**
 * Turns one configured entry into a test for an incoming origin.
 *
 * A `*` stands for part of a single hostname label and deliberately does not
 * match a dot: `https://shop-pos-*.vercel.app` accepts
 * `https://shop-pos-git-main-someone.vercel.app` but not
 * `https://shop-pos-anything.evil.com.vercel.app` — nor, more importantly,
 * anything ending `.vercel.app` that belongs to somebody else's project. Every
 * other character is matched literally, so a normal entry stays an exact test.
 */
function toMatcher(entry: string): (origin: string) => boolean {
  if (!entry.includes('*')) {
    return (origin) => origin === entry;
  }

  const pattern = entry
    .split('*')
    .map((literal) => literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^.]*');
  const regex = new RegExp(`^${pattern}$`);
  return (origin) => regex.test(origin);
}

export interface CorsOriginRules {
  /** What was configured, for logging. */
  readonly configured: string[];
  /** Whether a given `Origin` header is allowed. */
  readonly isAllowed: (origin: string) => boolean;
}

/**
 * @param env the process environment; injected so this is testable.
 * @throws MissingCorsOriginsError in production with no CORS_ORIGINS set.
 */
export function resolveCorsOrigins(
  env: NodeJS.ProcessEnv = process.env,
): CorsOriginRules {
  const configured = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    // A trailing slash is the easiest way to get this wrong, and an origin
    // never has one — the browser sends "https://host", never "https://host/".
    .map((origin) => origin.replace(/\/+$/, ''))
    .filter(Boolean);

  if (configured.length === 0) {
    if (env.NODE_ENV === 'production') {
      throw new MissingCorsOriginsError();
    }
    return {
      configured: DEVELOPMENT_ORIGINS,
      isAllowed: (origin) => DEVELOPMENT_ORIGINS.includes(origin),
    };
  }

  const matchers = configured.map(toMatcher);
  return {
    configured,
    isAllowed: (origin) => matchers.some((matches) => matches(origin)),
  };
}
