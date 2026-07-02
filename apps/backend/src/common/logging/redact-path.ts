/**
 * M-PAY-1: redact secret-bearing dynamic path segments before anything is
 * written to the application logs.
 *
 * `TableSession.token` is a bearer-equivalent credential embedded directly in
 * routes such as `GET /payments/session/<token>/bill`. Possession of that token
 * is authorization for the public bill/payment paths, so it must never be
 * persisted in request/interceptor/exception logs where an operator (or a log
 * sink) could read it back.
 *
 * The token always sits in the segment immediately after `.../session/`, and
 * every token-bearing route has a trailing action segment
 * (`session/<token>/bill`, `session/<token>/close`, ...). The static
 * `session/force-open` route and the `POST session` create route have no
 * trailing action, so requiring a trailing `/` keeps them untouched while
 * templating only the real secret.
 */
const SESSION_TOKEN_PATH = /(\/session\/)([^/?#]+)(?=\/)/g;

export function redactSensitivePath(path: unknown): string {
  if (typeof path !== 'string' || path.length === 0) {
    return typeof path === 'string' ? path : '';
  }
  return path.replace(SESSION_TOKEN_PATH, '$1:token');
}
