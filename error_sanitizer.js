'use strict'; /*jslint node:true es9:true*/

// Header names that must never reach a tool result, a log line, or any
// other observer. Matched case-insensitively.
const SENSITIVE_HEADER_PATTERN =
    /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key)$/i;

// Defense in depth only: redacts sensitive headers in place on a headers
// object (e.g. AxiosError#config.headers / #request.headers). This must
// never be relied upon as the only safeguard, since it depends on the
// headers being a plain enumerable object. sanitize_error() below is the
// primary boundary and does not depend on this function at all.
export function redact_sensitive_headers(headers){
    if (!headers || typeof headers != 'object')
        return headers;
    for (const key of Object.keys(headers))
    {
        if (SENSITIVE_HEADER_PATTERN.test(key))
            headers[key] = '[REDACTED]';
    }
    return headers;
}

// Centralized error boundary: builds an allowlisted, safe message from an
// arbitrary rejection (AxiosError, Error, or any non-Error thrown value).
// Never passes through a raw Error/AxiosError or any of its enumerable
// properties (`config`, `request`, `response.headers`, custom `toJSON()`,
// etc.), so a mistake in an individual tool can't turn into a credential
// leak. Only `.message` and the already-public `.response.status` /
// `.response.data` (the API's own response body, not the request we sent)
// are ever read.
export function sanitize_error(e){
    if (e?.response)
    {
        const status = e.response.status;
        const body = e.response.data;
        if (body?.length)
            return `HTTP ${status}: ${body}`;
        const status_text = e.response.statusText;
        return `HTTP ${status}${status_text ? `: ${status_text}` : ''}`;
    }
    if (e instanceof Error && typeof e.message == 'string')
        return e.message;
    return 'Tool execution failed';
}
