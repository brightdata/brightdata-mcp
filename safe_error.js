'use strict'; /*jslint node:true es9:true*/

const cred_url_re = /((?:wss?|https?):\/\/)[^/@\s]+@/gi;
const max_error_len = 500;

export const redact_url_creds = value=>
    (typeof value=='string' ? value : JSON.stringify(value) ?? '')
        .replace(cred_url_re, '$1[REDACTED]@');

export const redact_token = (value, api_token)=>{
    const text = String(value);
    return api_token ? text.split(api_token).join('[REDACTED]') : text;
};

export const safe_error = (e, api_token, warn = console.error)=>{
    try {
        const message = typeof e=='string' ? e
            : e instanceof Error && typeof e.message=='string' ? e.message
            : 'Tool execution failed';
        const text = redact_url_creds(redact_token(message, api_token));
        if (text.length>max_error_len)
            warn(`[error] truncated ${text.length} chars`);
        return text.slice(0, max_error_len);
    } catch(_e){
        return 'Tool execution failed';
    }
};
