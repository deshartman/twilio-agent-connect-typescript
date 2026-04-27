/**
 * Unit tests for normalizePublicDomain().
 *
 * The helper is the single source of truth for how `publicDomain` config
 * values are sanitised before being used in URL construction (signature
 * validation, WebSocket URLs, callback URLs). It must accept common shapes
 * users paste from ngrok / docs and reject shapes that would silently
 * break URL reconstruction.
 */
import { describe, it, expect } from 'vitest';
import { normalizePublicDomain } from '../src/lib/signature';

describe('normalizePublicDomain', () => {
  it('accepts a bare host unchanged', () => {
    expect(normalizePublicDomain('example.com')).toBe('example.com');
  });

  it('strips an https:// scheme', () => {
    expect(normalizePublicDomain('https://example.com')).toBe('example.com');
  });

  it('strips an http:// scheme', () => {
    expect(normalizePublicDomain('http://example.com')).toBe('example.com');
  });

  it('strips trailing slashes', () => {
    expect(normalizePublicDomain('https://example.com/')).toBe('example.com');
    expect(normalizePublicDomain('example.com///')).toBe('example.com');
  });

  it('preserves a port', () => {
    expect(normalizePublicDomain('example.com:8001')).toBe('example.com:8001');
    expect(normalizePublicDomain('https://example.com:8001/')).toBe('example.com:8001');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizePublicDomain('  https://example.com  ')).toBe('example.com');
  });

  it('rejects an empty string', () => {
    expect(() => normalizePublicDomain('')).toThrow(/required/i);
  });

  it('rejects whitespace-only input', () => {
    expect(() => normalizePublicDomain('   ')).toThrow(/required/i);
  });

  it('rejects a scheme-only input with no host', () => {
    expect(() => normalizePublicDomain('https://')).toThrow(/no host/i);
  });

  it('rejects a value containing a path', () => {
    expect(() => normalizePublicDomain('https://example.com/webhook')).toThrow(/bare host/i);
  });

  it('rejects a value containing a query string', () => {
    expect(() => normalizePublicDomain('example.com?foo=bar')).toThrow(/bare host/i);
  });

  it('rejects a value containing a fragment', () => {
    expect(() => normalizePublicDomain('example.com#frag')).toThrow(/bare host/i);
  });
});
