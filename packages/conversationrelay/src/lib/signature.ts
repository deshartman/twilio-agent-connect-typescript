/**
 * Shared Twilio signature-validation helpers for Fastify servers.
 *
 * Used by ConversationRelayServer (CR package) and TACServer (core package) to avoid
 * three copies of the same URL-reconstruction + twilio.validateRequest glue.
 *
 * Two exports:
 *   - registerSignatureValidation — preHandler hook for POST routes
 *   - validateWebSocketSignature  — inline check for WS upgrade requests
 *
 * Both rely on `getDefaultWebhookUrl` to reconstruct the URL Twilio signed
 * against. Twilio signs requests against the full public URL the caller
 * reached, which means proxy/tunnel headers (x-forwarded-*) must be honoured
 * while staying resistant to spoofing. See the per-function docs.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import twilio from 'twilio';

export interface RegisterSignatureValidationOptions {
  /** Twilio auth token (used as the signing key). */
  authToken: string;

  /**
   * Optional override for URL reconstruction. If omitted, the default
   * honours x-forwarded-proto / x-forwarded-host / host headers. Pass a
   * custom builder for deployments where your proxy setup differs.
   */
  getWebhookUrl?: (request: FastifyRequest) => string;

  /**
   * Paths to skip. Useful when a sub-route on the same app doesn't need
   * signature validation (e.g. a health check).
   */
  skipPaths?: string[];
}

/**
 * Register a global preHandler hook on `fastify` that validates the
 * `X-Twilio-Signature` header on every POST request before routing.
 *
 * GET requests are always skipped — WebSocket upgrades are validated by
 * `validateWebSocketSignature` in the route handler because Fastify does
 * not run preHandler hooks on upgrade requests.
 *
 * Form-encoded bodies validate via `twilio.validateRequest(url, params)`.
 * JSON bodies (signalled by a `?bodySHA256=...` query parameter) validate
 * via `twilio.validateRequestWithBody(url, rawBody)` — the raw body string
 * must be preserved on the request object as `rawBody` by a content-type
 * parser registered elsewhere.
 */
export function registerSignatureValidation(
  fastify: FastifyInstance,
  options: RegisterSignatureValidationOptions
): void {
  const { authToken, getWebhookUrl = getDefaultWebhookUrl, skipPaths = [] } = options;

  fastify.addHook('preHandler', (request, reply, done): void => {
    if (request.method === 'GET') {
      done();
      return;
    }

    if (skipPaths.includes(request.url.split('?')[0] ?? '')) {
      done();
      return;
    }

    const signature = request.headers['x-twilio-signature'] as string | undefined;
    const url = getWebhookUrl(request);

    let isValid: boolean;
    if (request.url.includes('bodySHA256=')) {
      const body = (request as FastifyRequest & { rawBody?: string }).rawBody ?? '';
      isValid = twilio.validateRequestWithBody(authToken, signature ?? '', url, body);
    } else {
      const params = (request.body as Record<string, string>) || {};
      isValid = twilio.validateRequest(authToken, signature ?? '', url, params);
    }

    if (!isValid) {
      fastify.log.warn({ url, hasSignature: !!signature }, 'Invalid Twilio webhook signature');
      void reply.code(403).send({ error: 'Invalid webhook signature' });
      done();
      return;
    }

    done();
  });
}

/**
 * Validate an incoming WebSocket upgrade request's signature.
 *
 * Call this at the top of the WS route handler. Returns `true` if the
 * signature is valid, `false` otherwise — the caller is responsible for
 * closing the socket with code 1008 on a false return.
 *
 * Twilio signs WebSocket upgrades against the `wss://` form of the URL
 * (even though the request method is GET), so this helper always forces
 * the protocol component to `wss` (or `ws` when the reconstructed URL
 * was http). Query-string parameters are extracted and passed to
 * `twilio.validateRequest` — Twilio includes them in the signature.
 */
export function validateWebSocketSignature(request: FastifyRequest, authToken: string): boolean {
  const signature = request.headers['x-twilio-signature'] as string | undefined;
  const httpUrl = getDefaultWebhookUrl(request);

  let wsUrl: URL;
  try {
    wsUrl = new URL(httpUrl);
  } catch {
    return false;
  }

  wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';

  const params: Record<string, string> = {};
  wsUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  const urlForValidation = wsUrl.origin + wsUrl.pathname;

  return twilio.validateRequest(authToken, signature ?? '', urlForValidation, params);
}

/**
 * Reconstructs the URL Twilio signed against.
 *
 * Ported from TACServer's getForwardedProto/getForwardedHost/getWebhookUrl
 * trio (packages/server/src/lib/server.ts). Honours x-forwarded-proto and
 * x-forwarded-host for proxy/tunnel scenarios; takes the first entry of
 * any comma-separated chain; defaults proto to 'https' when absent.
 *
 * Return shape: `<proto>://<host><path+query>`. Callers may rewrite the
 * protocol afterwards (e.g. `validateWebSocketSignature` forces `wss`).
 */
export function getDefaultWebhookUrl(request: FastifyRequest): string {
  const proto = getForwardedProto(request);
  const host = getForwardedHost(request);
  return `${proto}://${host}${request.url}`;
}

function getForwardedProto(request: FastifyRequest): string {
  const raw = request.headers['x-forwarded-proto'] as string | undefined;
  return raw?.split(',')[0]?.trim() || 'https';
}

function getForwardedHost(request: FastifyRequest): string {
  const raw = (request.headers['x-forwarded-host'] as string | undefined) || request.headers.host;
  return raw?.split(',')[0]?.trim() || '';
}

/**
 * Normalise a user-supplied public domain to a bare `host[:port]` string.
 *
 * Accepts forms like:
 *   - `example.com`
 *   - `https://example.com`
 *   - `http://example.com/`
 *   - `example.com:8001`
 *
 * Strips scheme, trailing slashes, and any path/query/fragment. Rejects empty
 * or whitespace-only input, and anything containing a path, query, or fragment
 * after the host (to catch mistakes like `https://example.com/webhook`).
 *
 * Used by `TACServer` and `ConversationRelayServer` constructors to validate
 * their respective `publicDomain` config and by the signature helpers to build
 * the URL Twilio signed against.
 */
export function normalizePublicDomain(input: string): string {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new Error('publicDomain is required (non-empty string)');
  }

  let value = input.trim();

  if (value.startsWith('https://')) {
    value = value.slice('https://'.length);
  } else if (value.startsWith('http://')) {
    value = value.slice('http://'.length);
  }

  // Strip trailing slashes only — a path, query, or fragment is a user error.
  while (value.endsWith('/')) {
    value = value.slice(0, -1);
  }

  if (value === '') {
    throw new Error(`publicDomain is invalid: "${input}" has no host component`);
  }

  if (value.includes('/') || value.includes('?') || value.includes('#')) {
    throw new Error(
      `publicDomain must be a bare host (optionally with port). ` +
        `Got "${input}" — remove any path, query, or fragment.`
    );
  }

  return value;
}
