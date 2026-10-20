'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {safe_error, redact_url_creds} from '../safe_error.js';

test('safe_error redacts the token and URL credentials', ()=>{
    const e = new Error('tok-123 failed at wss://cust:pass-1@host:9222');
    assert.equal(safe_error(e, 'tok-123'),
        '[REDACTED] failed at wss://[REDACTED]@host:9222');
});

test('safe_error drops the stack and hides non-error values', ()=>{
    const e = new Error('boom');
    assert.equal(safe_error(e), 'boom');
    assert.equal(safe_error({secret: 1}), 'Tool execution failed');
    assert.equal(safe_error(undefined), 'Tool execution failed');
});

test('safe_error caps at 500 characters and warns', ()=>{
    const warnings = [];
    const text = safe_error('x'.repeat(900), null, w=>warnings.push(w));
    assert.equal(text.length, 500);
    assert.deepEqual(warnings, ['[error] truncated 900 chars']);
});

test('redact_url_creds serializes non-string values', ()=>{
    assert.equal(redact_url_creds({u: 'https://a:b@h'}),
        '{"u":"https://[REDACTED]@h"}');
    assert.equal(redact_url_creds(undefined), '');
});
