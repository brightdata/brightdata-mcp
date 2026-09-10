'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitize_error, redact_sensitive_headers}
    from '../error_sanitizer.js';

const SECRET = 'Bearer SECRET_TOKEN_CANARY_should_never_leak';

// Builds an object shaped like an AxiosError: a real Error instance with
// the extra axios-specific properties (code, config, request, response)
// attached, mirroring what axios actually throws.
function make_axios_error({message, code, status, statusText, data,
    responseHeaders}={}){
    const err = new Error(message || 'Request failed');
    err.name = 'AxiosError';
    err.isAxiosError = true;
    if (code)
        err.code = code;
    err.config = {
        url: 'https://api.brightdata.com/request',
        method: 'POST',
        headers: {authorization: SECRET, 'user-agent': 'test'},
    };
    err.request = {headers: {authorization: SECRET}};
    if (status)
    {
        err.response = {
            status,
            statusText,
            data,
            headers: responseHeaders || {},
            config: err.config,
        };
    }
    return err;
}

for (const [label, status, statusText, data] of [
    ['HTTP 400', 400, 'Bad Request', 'zone not found'],
    ['HTTP 401', 401, 'Unauthorized', 'Invalid token'],
    ['HTTP 403', 403, 'Forbidden', 'Access denied'],
    ['HTTP 429', 429, 'Too Many Requests', 'Rate limit exceeded'],
    ['HTTP 500', 500, 'Internal Server Error', 'upstream error'],
])
{
    test(`sanitize_error handles ${label} without leaking the token`,
        ()=>{
            const e = make_axios_error({status, statusText, data});
            const result = sanitize_error(e);
            assert.equal(result, `HTTP ${status}: ${data}`);
            assert.doesNotMatch(result, new RegExp(SECRET));
            assert.doesNotMatch(result, /authorization/i);
            assert.doesNotMatch(result, /config/i);
        });
}

test('sanitize_error falls back to statusText when the response body is '
    +'a non-string (e.g. parsed JSON object) without leaking the token',
    ()=>{
        const e = make_axios_error({status: 429, statusText:
            'Too Many Requests', data: {error: 'rate limited'}});
        const result = sanitize_error(e);
        assert.equal(result, 'HTTP 429: Too Many Requests');
        assert.doesNotMatch(result, new RegExp(SECRET));
    });

test('sanitize_error handles a timeout (no HTTP response) without '
    +'leaking the token', ()=>{
        const e = make_axios_error({message: 'timeout of 5000ms exceeded',
            code: 'ECONNABORTED'});
        const result = sanitize_error(e);
        assert.equal(result, 'timeout of 5000ms exceeded');
        assert.doesNotMatch(result, new RegExp(SECRET));
    });

test('sanitize_error handles a DNS resolution failure without leaking '
    +'the token', ()=>{
        const e = make_axios_error({
            message: 'getaddrinfo ENOTFOUND api.brightdata.com',
            code: 'ENOTFOUND'});
        const result = sanitize_error(e);
        assert.equal(result, 'getaddrinfo ENOTFOUND api.brightdata.com');
        assert.doesNotMatch(result, new RegExp(SECRET));
    });

test('sanitize_error handles a TLS failure without leaking the token',
    ()=>{
        const e = make_axios_error({
            message: 'certificate has expired', code: 'CERT_HAS_EXPIRED'});
        const result = sanitize_error(e);
        assert.equal(result, 'certificate has expired');
        assert.doesNotMatch(result, new RegExp(SECRET));
    });

test('sanitize_error handles a connection reset without leaking the '
    +'token', ()=>{
        const e = make_axios_error({message: 'socket hang up',
            code: 'ECONNRESET'});
        const result = sanitize_error(e);
        assert.equal(result, 'socket hang up');
        assert.doesNotMatch(result, new RegExp(SECRET));
    });

test('sanitize_error handles a non-Error rejection safely', ()=>{
    assert.equal(sanitize_error(`plain string with ${SECRET}`),
        'Tool execution failed');
    assert.equal(sanitize_error({message: `object with ${SECRET}`}),
        'Tool execution failed');
    assert.equal(sanitize_error(undefined), 'Tool execution failed');
    assert.equal(sanitize_error(null), 'Tool execution failed');
});

test('sanitize_error ignores a malicious custom toJSON() instead of '
    +'invoking it', ()=>{
        const e = make_axios_error({message: 'Request failed',
            status: 400, statusText: 'Bad Request', data: ''});
        // An attacker-controlled or buggy error object could define
        // toJSON() to smuggle the token past a naive JSON.stringify(e).
        // sanitize_error must never call JSON.stringify(e) or rely on
        // toJSON() at all.
        e.toJSON = ()=>({leaked: SECRET});
        const result = sanitize_error(e);
        assert.doesNotMatch(result, new RegExp(SECRET));
        assert.doesNotMatch(JSON.stringify({error: result}),
            new RegExp(SECRET));
    });

test('sanitize_error never leaks a canary secret placed anywhere on the '
    +'error object, regardless of failure cause', ()=>{
        const scenarios = [
            make_axios_error({status: 400, statusText: 'Bad Request',
                data: 'bad request'}),
            make_axios_error({message: 'timeout of 1000ms exceeded',
                code: 'ECONNABORTED'}),
            make_axios_error({message: 'getaddrinfo ENOTFOUND host',
                code: 'ENOTFOUND'}),
        ];
        for (const e of scenarios)
        {
            const result = sanitize_error(e);
            assert.doesNotMatch(result, new RegExp(SECRET),
                'sanitize_error output must never contain the token');
        }
    });

test('redact_sensitive_headers redacts known sensitive headers '
    +'case-insensitively', ()=>{
        const headers = {
            Authorization: `Bearer ${SECRET}`,
            'Proxy-Authorization': 'Basic abc',
            Cookie: 'session=abc',
            'Set-Cookie': 'session=abc',
            'X-Api-Key': 'abc',
            'user-agent': '@brightdata/mcp/1.0.0',
            'content-type': 'application/json',
        };
        redact_sensitive_headers(headers);
        assert.equal(headers.Authorization, '[REDACTED]');
        assert.equal(headers['Proxy-Authorization'], '[REDACTED]');
        assert.equal(headers.Cookie, '[REDACTED]');
        assert.equal(headers['Set-Cookie'], '[REDACTED]');
        assert.equal(headers['X-Api-Key'], '[REDACTED]');
        assert.equal(headers['user-agent'], '@brightdata/mcp/1.0.0');
        assert.equal(headers['content-type'], 'application/json');
    });

test('redact_sensitive_headers tolerates missing or non-object input',
    ()=>{
        assert.equal(redact_sensitive_headers(undefined), undefined);
        assert.equal(redact_sensitive_headers(null), null);
        assert.equal(redact_sensitive_headers('not-an-object'),
            'not-an-object');
    });
