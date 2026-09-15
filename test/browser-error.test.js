'use strict'; /*jslint node:true es9:true*/
// The browser family's error path, tested where the leak actually lives.
//
// These tools do not pass through tool_fn, and under a refused network they
// fail at the zone lookup before a credentialed endpoint is ever built -- so an
// end-to-end test can never reach the code that leaks. The guarantee is a
// property of the redaction helper, so that is what is tested.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve, join} from 'node:path';
import {redact_credentials} from '../browser_session.js';

const repo_root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// What Playwright actually produces when it cannot reach the endpoint: the
// whole wss:// URL, password included, inside a multi-line message.
const REAL_SHAPED_ERROR =
    'browserType.connectOverCDP: WebSocket error: connect ECONNREFUSED\n'
    +'=========================== logs ===========================\n'
    +'<ws connecting> wss://brd-customer-hl_a1b2c3-zone-mcp_browser:'
    +'s3cr3tpassw0rd@brd.superproxy.io:9222\n'
    +'============================================================';

test('the zone password is removed from a real Playwright message', ()=>{
    const safe = redact_credentials(REAL_SHAPED_ERROR);
    assert.ok(!safe.includes('s3cr3tpassw0rd'), 'the password is gone');
    assert.match(safe, /wss:\/\/brd-customer-hl_a1b2c3-zone-mcp_browser:\*\*\*@/,
        'the endpoint is still recognisable, only the secret is masked');
});

test('a password containing regex-special characters is still removed', ()=>{
    for (const password of ['p.a$s^w[o]r*d', 'a+b(c)d|e', '$1$2\\1', 'a{2,3}'])
    {
        const message = `<ws connecting> wss://brd-customer-x-zone-y:`
            +`${password}@brd.superproxy.io:9222`;
        const safe = redact_credentials(message);
        assert.ok(!safe.includes(password),
            `password ${password} survived redaction`);
    }
});

test('both ws and wss, and repeated occurrences, are covered', ()=>{
    const message = 'ws://a:b@host:1 and wss://c:d@host:2 and ws://e:f@host:3';
    const safe = redact_credentials(message);
    assert.equal(safe, 'ws://a:***@host:1 and wss://c:***@host:2 '
        +'and ws://e:***@host:3');
});

test('text without an endpoint is untouched, and odd input does not throw', ()=>{
    assert.equal(redact_credentials('Error: element not found'),
        'Error: element not found');
    assert.equal(redact_credentials(''), '');
    assert.equal(redact_credentials(null), '');
    assert.equal(redact_credentials(undefined), '');
    assert.doesNotThrow(()=>redact_credentials({toString(){ return 'x'; }}));
});

// The builder itself is module-private, so its two guarantees are checked
// against the source: every catch routes through it, and it bounds as well as
// redacts. The bound matters because a Playwright message carries a full log
// dump, and nothing downstream will trim it.
test('every browser catch routes through the builder, which bounds and redacts',
    ()=>{
    const source = readFileSync(join(repo_root, 'browser_tools.js'), 'utf8');

    const raw = source.match(/UserError\(`[^`]*\$\{e\}/g) || [];
    assert.deepEqual(raw, [],
        'these catches interpolate the caught error directly');

    const calls = (source.match(/throw browser_error\(/g) || []).length;
    assert.ok(calls>=14,
        `expected the builder at every catch site, saw ${calls}`);

    const definition = source.slice(source.indexOf('function browser_error('),
        source.indexOf('function browser_error(')+600);
    assert.match(definition, /redact_credentials\(/,
        'the builder redacts');
    assert.match(definition, /slice\(0, MAX_BROWSER_ERROR/,
        'the builder bounds');
});

test('the bound is short enough to keep a log dump out of the model', ()=>{
    const source = readFileSync(join(repo_root, 'browser_tools.js'), 'utf8');
    const match = source.match(/const MAX_BROWSER_ERROR = (\d+);/);
    assert.ok(match, 'the bound is a named constant');
    assert.ok(Number(match[1])<=500, `bound is ${match[1]}, expected <= 500`);
});
