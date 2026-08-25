import { redactSensitivePath } from './redact-path';

/**
 * Free-text redaction for anything that leaves the process as diagnostics.
 *
 * `redactSensitivePath` covers secrets that appear as *path segments* in a
 * known route shape. This module covers the rest: the credentials, tokens and
 * keys that end up inside error *messages*, which is where they escape once a
 * failure is reported rather than logged as a structured request line.
 *
 * The concrete cases seen in this backend:
 *
 * - Prisma and ioredis put the whole connection URI in their error text, so a
 *   pool-exhaustion or connect failure carries the database/Redis password.
 * - An axios/undici failure quotes the request URL, which for DeepL, Stripe and
 *   the SMS gateway can carry the API key as a query parameter.
 * - An auth failure can quote the `Authorization` header or a raw JWT.
 *
 * Redaction is deliberately structural (URI userinfo, known query keys, JWT
 * shape) rather than a list of secret values: nothing here needs the actual
 * secrets to be in scope, so it cannot be defeated by rotation.
 */

/** `scheme://user:password@host` — the userinfo half of any connection URI. */
const CREDENTIAL_URI = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;

/** `?api_key=...`, `&token=...` and friends, in a URL or an error quoting one. */
const SECRET_QUERY_PARAM =
  /([?&](?:token|auth_key|api[_-]?key|apikey|secret|signature|password|access[_-]?token|refresh[_-]?token)=)[^&\s#"']+/gi;

/** A bearer credential quoted out of a header. */
const BEARER_CREDENTIAL = /\b(Bearer\s+)[\w.~+/=-]{8,}/gi;

/** A three-segment JWT, wherever it surfaces. */
const JWT = /\beyJ[\w-]{4,}\.[\w-]{4,}\.[\w-]{4,}/g;

export function redactSecrets(text: unknown): string {
  if (typeof text !== 'string' || text.length === 0) {
    return typeof text === 'string' ? text : '';
  }
  return text
    .replace(CREDENTIAL_URI, '$1:redacted@')
    .replace(SECRET_QUERY_PARAM, '$1:redacted')
    .replace(BEARER_CREDENTIAL, '$1:redacted')
    .replace(JWT, ':redacted');
}

/**
 * The single entry point for diagnostic text: path-shaped secrets first, then
 * message-shaped ones. Both are cheap and idempotent, so callers never have to
 * reason about which kind of secret a given string might hold.
 */
export function redactDiagnosticText(text: unknown): string {
  return redactSecrets(redactSensitivePath(text));
}
