import { MissingCorsOriginsError, resolveCorsOrigins } from './cors-origins';

describe('resolveCorsOrigins', () => {
  describe('when CORS_ORIGINS is not set', () => {
    it('falls back to the local front ends outside production', () => {
      const rules = resolveCorsOrigins({ NODE_ENV: 'development' });

      expect(rules.isAllowed('http://localhost:5001')).toBe(true);
      expect(rules.isAllowed('http://localhost:3001')).toBe(true);
      expect(rules.isAllowed('https://somewhere-else.com')).toBe(false);
    });

    /**
     * The failure this replaces was a deployment that came up healthy, served
     * requests, and rejected every browser — visible only in a console the
     * person deploying was not looking at.
     */
    it('refuses to start in production', () => {
      expect(() => resolveCorsOrigins({ NODE_ENV: 'production' })).toThrow(
        MissingCorsOriginsError,
      );
    });

    it('names the variable and shows the format when it throws', () => {
      expect(() => resolveCorsOrigins({ NODE_ENV: 'production' })).toThrow(
        /CORS_ORIGINS/,
      );
    });

    it('treats a variable of only commas and spaces as unset', () => {
      expect(() =>
        resolveCorsOrigins({ NODE_ENV: 'production', CORS_ORIGINS: ' , , ' }),
      ).toThrow(MissingCorsOriginsError);
    });
  });

  describe('exact origins', () => {
    it('allows a configured origin and nothing else', () => {
      const rules = resolveCorsOrigins({
        CORS_ORIGINS: 'https://shop.example.com',
      });

      expect(rules.isAllowed('https://shop.example.com')).toBe(true);
      expect(rules.isAllowed('https://other.example.com')).toBe(false);
    });

    it('accepts several, comma-separated, with or without spaces', () => {
      const rules = resolveCorsOrigins({
        CORS_ORIGINS: 'https://a.example.com, https://b.example.com',
      });

      expect(rules.isAllowed('https://a.example.com')).toBe(true);
      expect(rules.isAllowed('https://b.example.com')).toBe(true);
    });

    /** An origin never has a trailing slash, but a person writing one does. */
    it('tolerates a trailing slash in the configuration', () => {
      const rules = resolveCorsOrigins({
        CORS_ORIGINS: 'https://shop.example.com/',
      });

      expect(rules.isAllowed('https://shop.example.com')).toBe(true);
    });

    it('does not treat the scheme as interchangeable', () => {
      const rules = resolveCorsOrigins({
        CORS_ORIGINS: 'https://shop.example.com',
      });

      expect(rules.isAllowed('http://shop.example.com')).toBe(false);
    });

    it('distinguishes a port', () => {
      const rules = resolveCorsOrigins({
        CORS_ORIGINS: 'http://localhost:5001',
      });

      expect(rules.isAllowed('http://localhost:5001')).toBe(true);
      expect(rules.isAllowed('http://localhost:3000')).toBe(false);
    });
  });

  describe('wildcards, for preview deployments', () => {
    const rules = resolveCorsOrigins({
      CORS_ORIGINS: 'https://shop-pos-*.vercel.app',
    });

    it('matches the previews it is meant to', () => {
      expect(
        rules.isAllowed('https://shop-pos-git-owner-dash-ferdus.vercel.app'),
      ).toBe(true);
      expect(rules.isAllowed('https://shop-pos-abc123.vercel.app')).toBe(true);
    });

    /**
     * The point of stopping at a dot. A wildcard for one project's previews
     * must not become a wildcard for every Vercel account's, and must not let
     * a hostname someone else controls be suffixed onto the pattern.
     */
    it('does not match another project on the same host', () => {
      expect(rules.isAllowed('https://someone-elses-app.vercel.app')).toBe(
        false,
      );
    });

    it('does not cross a label boundary', () => {
      expect(rules.isAllowed('https://shop-pos-x.attacker.vercel.app')).toBe(
        false,
      );
    });

    it('does not match a lookalike domain that merely contains the pattern', () => {
      expect(rules.isAllowed('https://shop-pos-x.vercel.app.evil.com')).toBe(
        false,
      );
      expect(rules.isAllowed('https://evil.com/shop-pos-x.vercel.app')).toBe(
        false,
      );
    });

    it('is not fooled by regex characters in the configured value', () => {
      const dotted = resolveCorsOrigins({
        CORS_ORIGINS: 'https://a.example.com',
      });

      // A '.' in the pattern must be a literal dot, not "any character".
      expect(dotted.isAllowed('https://aXexample.com')).toBe(false);
    });

    it('still allows an exact origin listed alongside a wildcard', () => {
      const mixed = resolveCorsOrigins({
        CORS_ORIGINS: 'https://shop.example.com,https://shop-pos-*.vercel.app',
      });

      expect(mixed.isAllowed('https://shop.example.com')).toBe(true);
      expect(mixed.isAllowed('https://shop-pos-preview.vercel.app')).toBe(true);
      expect(mixed.isAllowed('https://elsewhere.com')).toBe(false);
    });
  });

  it('reports what was configured, for the boot log', () => {
    const rules = resolveCorsOrigins({
      CORS_ORIGINS: 'https://a.example.com,https://b.example.com',
    });

    expect(rules.configured).toEqual([
      'https://a.example.com',
      'https://b.example.com',
    ]);
  });
});
