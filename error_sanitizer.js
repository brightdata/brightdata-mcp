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

export function redact_secrets(text, secrets=[]){
    text = String(text);
    for (const secret of secrets)
    {
        if (secret)
            text = text.split(secret).join('[REDACTED]');
    }
    return text;
}

export function sanitize_error(e, secrets=[]){
    let message;
    if (e?.response)
    {
        const status = e.response.status;
        const body = e.response.data;
        if (body?.length)
            message = `HTTP ${status}: ${body}`;
        else
        {
            const status_text = e.response.statusText;
            message = `HTTP ${status}${status_text ? `: ${status_text}` : ''}`;
        }
    }
    else if (e instanceof Error && typeof e.message == 'string')
        message = e.message;
    else
        message = 'Tool execution failed';
    return redact_secrets(message, secrets);
}

