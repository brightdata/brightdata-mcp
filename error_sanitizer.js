'use strict'; /*jslint node:true es9:true*/

const SENSITIVE_HEADER_PATTERN =
    /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key)$/i;

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
