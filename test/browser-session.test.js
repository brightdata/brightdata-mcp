'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {redact_endpoint} from '../browser_session.js';

const ENDPOINT = 'wss://brd-customer-hl_1234-zone-mcp_browser'
    +':super-secret-zone-password@brd.superproxy.io:9222';

test('redact_endpoint strips the CDP endpoint credentials from error text',
    ()=>{
        const message = `connect ECONNREFUSED ${ENDPOINT}`;
        const result = redact_endpoint(message, ENDPOINT);
        assert.doesNotMatch(result, /super-secret-zone-password/);
        assert.doesNotMatch(result, /brd-customer-hl_1234-zone-mcp_browser/);
        assert.match(result, /\[REDACTED\]/);
    });

test('redact_endpoint tolerates a missing or malformed endpoint', ()=>{
    assert.equal(redact_endpoint('plain message', undefined),
        'plain message');
    assert.equal(redact_endpoint('plain message', 'not-a-url'),
        'plain message');
});
