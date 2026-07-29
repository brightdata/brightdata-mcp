'use strict'; /*jslint node:true es9:true*/

// Pure, side-effect-free helpers for classifying Bright Data responses and
// computing retry/backoff delays. Extracted so the retry policy is testable in
// isolation and reusable across tools (search, scrape, batch, web_data).
// See issue #104 (intermittent 502/504 from the gateway, no retry guidance).

// Outcome taxonomy returned by classify_response. Each value tells the caller
// what to do next, independent of any particular transport library.
export const OUTCOME = {
    SUCCESS: 'success',         // 2xx - use the body
    REDIRECT: 'redirect',       // 3xx - follow the Location (not an error)
    RETRYABLE: 'retryable',     // transient - safe to retry after a backoff
    RATE_LIMITED: 'rate_limited', // 429 - retry, but honor Retry-After if given
    BLOCKED: 'blocked',         // target actively blocked us (403/451) - terminal
    CLIENT_ERROR: 'client_error', // 4xx caller mistake - terminal, do not retry
    FATAL: 'fatal',             // unexpected/unclassifiable - terminal
};

// Gateway/transport statuses that are safe to retry. 502/504 are the exact
// symptoms reported in issue #104; 408/425 are slow/early-data conditions and
// 500/503 are transient server states.
const RETRYABLE_STATUS = new Set([408, 425, 500, 502, 503, 504]);

// Statuses that mean "the target refused us"; retrying the same request will
// not help, so we surface them as a first-class BLOCKED outcome rather than
// burning retries or discarding the signal.
const BLOCKED_STATUS = new Set([403, 451]);

// Node/undici/axios network error codes with no HTTP status attached. These are
// transient connectivity failures and are safe to retry.
const RETRYABLE_NETWORK_CODES = new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'ECONNABORTED',
    'ETIMEDOUT',
    'EAI_AGAIN',
    'EPIPE',
    'ENETUNREACH',
    'ENETRESET',
    'EHOSTUNREACH',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_SOCKET',
]);

function is_finite_number(value){
    return typeof value=='number' && Number.isFinite(value);
}

// An HTTP-date per RFC 9110: IMF-fixdate ("Sun, 06 Nov 1994 08:49:37 GMT"),
// rfc850-date ("Sunday, 06-Nov-94 08:49:37 GMT"), or asctime
// ("Sun Nov  6 08:49:37 1994"). We require a recognizable day-name prefix so a
// bare number-like string ('1.5', '-3') is NEVER fed to the permissive
// Date.parse (which would read it as a past date and clamp to an immediate retry).
const HTTP_DATE_RE =
    /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*[,\s]/i;

// Parse a Retry-After header value (RFC 9110). It is either a non-negative
// integer number of seconds or an HTTP-date. Returns milliseconds, or null if
// absent/malformed/in the past. A malformed value (fractional '1.5', negative
// '-3', junk) returns null so the caller falls back to its computed backoff
// rather than retrying immediately. `now_ms` is injectable for deterministic tests.
export function parse_retry_after(value, now_ms = Date.now()){
    if (value===undefined || value===null)
        return null;
    const raw = String(value).trim();
    if (!raw)
        return null;
    // (a) a non-negative integer number of seconds.
    if (/^\d+$/.test(raw))
    {
        const seconds = parseInt(raw, 10);
        return seconds * 1000;
    }
    // (b) a valid HTTP-date. Reject anything that is not date-shaped up front so
    // permissive Date.parse never silently accepts numeric junk as a past date.
    if (!HTTP_DATE_RE.test(raw))
        return null;
    const when = Date.parse(raw);
    if (Number.isNaN(when))
        return null;
    const delta = when - now_ms;
    return delta > 0 ? delta : 0;
}

// Read a header case-insensitively from a plain object. Bright Data / undici may
// return header names in any case, so we never assume a fixed casing.
function get_header(headers, name){
    if (!headers || typeof headers!='object')
        return undefined;
    const target = name.toLowerCase();
    for (const key of Object.keys(headers))
    {
        if (key.toLowerCase()===target)
            return headers[key];
    }
    return undefined;
}

// Classify a response or thrown error into a stable OUTCOME plus the metadata a
// retry loop needs. Accepts a normalized shape so it never depends on axios:
//   {status, headers}            - a completed HTTP response, or
//   {error: {code, response}}    - a thrown transport error (axios-style).
// Returns {outcome, status|null, retry_after_ms|null, retryable, reason}.
export function classify_response(input, now_ms = Date.now()){
    const obj = input && typeof input=='object' ? input : {};
    const err = obj.error && typeof obj.error=='object' ? obj.error : null;

    // A thrown error may carry an HTTP response (server replied with a status)
    // or only a network code (connection never completed).
    const response = err ? err.response : obj;
    const status = response && is_finite_number(response.status)
        ? response.status : null;
    const headers = response ? response.headers : undefined;
    const retry_after_ms = parse_retry_after(get_header(headers, 'retry-after'),
        now_ms);

    if (status===null)
    {
        const code = err && typeof err.code=='string' ? err.code : null;
        if (code && RETRYABLE_NETWORK_CODES.has(code))
        {
            return {outcome: OUTCOME.RETRYABLE, status: null,
                retry_after_ms: null, retryable: true,
                reason: `network error ${code}`};
        }
        return {outcome: OUTCOME.FATAL, status: null, retry_after_ms: null,
            retryable: false,
            reason: code ? `unhandled network error ${code}`
                : 'no status and no network code'};
    }

    if (status>=200 && status<300)
    {
        return {outcome: OUTCOME.SUCCESS, status, retry_after_ms: null,
            retryable: false, reason: `http ${status}`};
    }

    // 3xx: a redirect, not an error. axios follows these transparently, so one
    // surfacing here is a terminal-for-this-call signal to follow/report. It is
    // neither a retryable gateway error nor a hard fatal, hence its own outcome.
    if (status>=300 && status<400)
    {
        return {outcome: OUTCOME.REDIRECT, status, retry_after_ms: null,
            retryable: false, reason: `http ${status} redirect`};
    }

    if (status===429)
    {
        return {outcome: OUTCOME.RATE_LIMITED, status, retry_after_ms,
            retryable: true, reason: 'http 429 rate limited'};
    }

    if (BLOCKED_STATUS.has(status))
    {
        return {outcome: OUTCOME.BLOCKED, status, retry_after_ms: null,
            retryable: false, reason: `http ${status} target blocked request`};
    }

    if (RETRYABLE_STATUS.has(status))
    {
        return {outcome: OUTCOME.RETRYABLE, status, retry_after_ms,
            retryable: true, reason: `http ${status} transient gateway error`};
    }

    if (status>=400 && status<500)
    {
        return {outcome: OUTCOME.CLIENT_ERROR, status, retry_after_ms: null,
            retryable: false, reason: `http ${status} client error`};
    }

    // Any other 5xx we did not enumerate: treat as retryable (transient by
    // nature) rather than fatal, but cap via the caller's max_retries.
    if (status>=500)
    {
        return {outcome: OUTCOME.RETRYABLE, status, retry_after_ms,
            retryable: true, reason: `http ${status} server error`};
    }

    return {outcome: OUTCOME.FATAL, status, retry_after_ms: null,
        retryable: false, reason: `http ${status} unclassified`};
}

// Default exponential-backoff parameters. base_ms doubles each attempt up to
// max_ms, then full jitter is applied so concurrent callers (issue #104's burst
// of 50+ calls) do not retry in lockstep and re-overload the gateway.
export const DEFAULT_BACKOFF = {
    base_ms: 500,
    max_ms: 30000,
    factor: 2,
    jitter: 'full',
};

// Compute the delay (ms) before retry `attempt` (0-indexed: attempt 0 is the
// wait before the 2nd try). A server-supplied retry_after_ms always wins and is
// clamped to max_ms. `rng` is injectable (defaults to Math.random) so jittered
// delays are deterministic under test.
export function compute_backoff(attempt, opts = {}, rng = Math.random){
    const base_ms = is_finite_number(opts.base_ms) && opts.base_ms>=0
        ? opts.base_ms : DEFAULT_BACKOFF.base_ms;
    const max_ms = is_finite_number(opts.max_ms) && opts.max_ms>=0
        ? opts.max_ms : DEFAULT_BACKOFF.max_ms;
    const factor = is_finite_number(opts.factor) && opts.factor>=1
        ? opts.factor : DEFAULT_BACKOFF.factor;
    const jitter = opts.jitter===undefined ? DEFAULT_BACKOFF.jitter
        : opts.jitter;

    if (is_finite_number(opts.retry_after_ms) && opts.retry_after_ms>=0)
        return Math.min(opts.retry_after_ms, max_ms);

    const safe_attempt = is_finite_number(attempt) && attempt>0
        ? Math.floor(attempt) : 0;
    const exponential = base_ms * Math.pow(factor, safe_attempt);
    const capped = Math.min(exponential, max_ms);

    if (jitter==='none')
        return capped;
    if (jitter==='equal')
    {
        // AWS "equal jitter": half fixed, half random.
        const half = capped / 2;
        return Math.round(half + rng() * half);
    }
    // "full jitter" (default): uniform random in [0, capped].
    return Math.round(rng() * capped);
}

// Decide whether to retry given a classification and how many attempts remain.
// `attempt` is 0-indexed (0 = the first try just failed). Returns
// {retry, delay_ms, classification} so a loop has everything it needs.
export function should_retry(classification, attempt, max_retries,
    opts = {}, rng = Math.random){
    const safe_max = is_finite_number(max_retries) && max_retries>=0
        ? Math.floor(max_retries) : 0;
    if (!classification || !classification.retryable)
        return {retry: false, delay_ms: 0, classification};
    if (attempt>=safe_max)
        return {retry: false, delay_ms: 0, classification};
    const delay_ms = compute_backoff(attempt, {
        ...opts,
        retry_after_ms: classification.retry_after_ms ?? undefined,
    }, rng);
    return {retry: true, delay_ms, classification};
}
