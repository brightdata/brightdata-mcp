'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {redact_credentials, Browser_session} from '../browser_session.js';

// (a) The format-based net, against the real captured connectOverCDP error text.
const PW_ERROR = `browserType.connectOverCDP: WebSocket error: connect ECONNREFUSED 127.0.0.1:1
Call log:
  - <ws connecting> wss://brd-customer-hl_x-zone-mcp_browser-country-us:SECRETpw123@brd.superproxy.io:9222/`;

test('redact_credentials removes the password from a real connectOverCDP error',
    ()=>{
    const out = redact_credentials(PW_ERROR);
    assert.ok(!out.includes('SECRETpw123'), 'password removed');
    assert.match(out, /:\*\*\*@brd\.superproxy\.io/, 'replaced with ***');
    assert.ok(out.includes('brd-customer-hl_x-zone-mcp_browser'),
        'customer/zone kept for debugging');
    assert.ok(out.includes('ECONNREFUSED'), 'diagnostic text kept');
});

test('redact_credentials is idempotent and a no-op on clean/nullish input', ()=>{
    const once = redact_credentials(PW_ERROR);
    assert.equal(redact_credentials(once), once);
    assert.equal(redact_credentials('nothing sensitive'), 'nothing sensitive');
    assert.equal(redact_credentials(null), '');
    assert.equal(redact_credentials(undefined), '');
});

// (b) Exotic charset: a password with '/' and '@' would be fragmented by the
// regex alone; _sanitize must scrub it exactly (from this session's endpoint).
test('_sanitize scrubs a password containing / and @ (charset-proof)', ()=>{
    const pw = 'pa/ss@word';
    const s = new Browser_session({cdp_endpoint:
        `wss://brd-customer-c-zone-mcp_browser:${pw}@brd.superproxy.io:9222`});
    const dirty = `boom wss://brd-customer-c-zone-mcp_browser:${pw}`
        + `@brd.superproxy.io:9222 raw=${pw}`;
    const out = s._sanitize(dirty);
    assert.ok(!out.includes(pw), 'exact password removed');
    assert.ok(!out.includes('pa/ss'), 'not even a fragment');
});

// (c) The guarantee: a real connection failure (127.0.0.1:1 refuses instantly,
// offline) must propagate an error with no password in message, stack, OR any
// enumerable property -- and no Playwright `log` array carried through.
test('get_browser propagates a password-free error on connection failure',
    async()=>{
    const pw = 'SECRETpw/with@slash';
    const s = new Browser_session({cdp_endpoint:
        `wss://brd-customer-c-zone-mcp_browser:${pw}@127.0.0.1:1`});
    await assert.rejects(s.get_browser({domain: 'x'}), err=>{
        const blob = String(err.message) + String(err.stack)
            + JSON.stringify(err, Object.getOwnPropertyNames(err));
        assert.ok(!blob.includes(pw) && !blob.includes('SECRETpw'),
            'no password or fragment anywhere in the propagated error');
        assert.ok(!('log' in err), 'no Playwright log array carried through');
        return true;
    });
});
