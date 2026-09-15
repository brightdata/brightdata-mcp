'use strict'; /*jslint node:true es9:true*/
// What our tools hand back to the model must never include a credential or a
// debugging artefact. The rules themselves live in upstream_error.js and in
// browser_tools.js's error builder, each with its own unit tests; this file is
// the thin end-to-end confirmation that nothing escapes through a real call,
// plus a positive control proving the detector works at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve, join} from 'node:path';
import {with_server} from './helpers/spawn_server.js';

const test_dir = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(test_dir, '..');

const FORBIDDEN = [
    ['a bearer credential', /Bearer\s+\S+/],
    ['an authorization header', /"?authorization"?\s*:/i],
    ['a browser endpoint with credentials', /wss?:\/\/[^\s:@/]+:[^\s@/]+@/],
];

function offending(text){
    return FORBIDDEN.filter(([, pattern])=>pattern.test(text))
        .map(([name])=>name);
}

// The positive control comes first: an assertion that something is absent is
// worthless until you have watched it detect the thing present. This is the
// exact shape that leaked -- a rejected axios error serialised whole.
test('the detector fires on the shape that leaked', ()=>{
    const axios_like_error = {
        message: 'connect ECONNREFUSED 127.0.0.1:1',
        config: {
            url: 'https://api.brightdata.com/request',
            headers: {
                'user-agent': '@brightdata/mcp/2.11.1',
                authorization: 'Bearer a-real-looking-token-value',
            },
        },
    };
    const serialised = JSON.stringify([{status: 'rejected',
        reason: axios_like_error}]);
    assert.deepEqual(offending(serialised).sort(),
        ['a bearer credential', 'an authorization header'],
        'the patterns must match a serialised request config');
});

// Only the tools that genuinely build a request before failing are exercised
// here. Under network: 'none' the browser family fails at its zone lookup, so
// it can never construct a credentialed endpoint and a check here would pass
// without running the code that leaks -- its guarantee is unit-tested in
// test/browser-error.test.js instead. session_stats touches no network at all.
const BUILDS_A_REQUEST = [
    ['scrape_batch', {urls: ['https://example.com/a', 'https://example.com/b']}],
    ['search_engine_batch', {queries: [{query: 'example'}]}],
];

test('no credential escapes a real failing call', async()=>{
    await with_server(async({client})=>{
        for (const [name, args] of BUILDS_A_REQUEST)
        {
            const result = await client.callTool({name, arguments: args});
            const text = JSON.stringify(result);
            // The check is meaningless unless the call actually failed the way
            // we intended, so prove the path ran before asserting on it.
            assert.match(text, /ECONNREFUSED|refused|proxy|socket|network/i,
                `${name} should have failed with a connection error; if it did `
                +`not, this test is not exercising the leak path`);
            assert.deepEqual(offending(text), [],
                `${name} returned something it must not`);
            assert.ok(!text.includes('dummy-token'),
                `${name} returned the API token`);
        }
    }, {network: 'none', name: 'response-hygiene-test'});
});

// The one upstream message this task must not touch: the free-tier limit text
// is a crafted instruction telling the user how to upgrade. Guarded in source
// because reproducing a client_10100 response needs a real exhausted account,
// and the requirement is only that the string stays on that path.
test('the free-tier usage-limit instructions survive', ()=>{
    const source = readFileSync(join(repo_root, 'server.js'), 'utf8');
    const branch = source.indexOf("'client_10100'");
    assert.ok(branch>0, 'the usage-limit branch still exists');
    const after = source.slice(branch, branch+2000);
    assert.match(after, /5,000 request monthly/,
        'the limit message is still thrown from that branch');
    assert.match(after, /Unlocker zone/,
        'the upgrade instructions are still there');
});

test('errors are built through the shared helpers, not by hand', ()=>{
    const server = readFileSync(join(repo_root, 'server.js'), 'utf8');
    const browser = readFileSync(join(repo_root, 'browser_tools.js'), 'utf8');

    // The shape that produced the leak: serialising a settled array whole.
    assert.ok(!/allSettled[\s\S]{0,160}JSON\.stringify\(\s*(results|settled)/
        .test(server),
        'server.js serialises a raw Promise.allSettled result');

    // Every browser catch must route through the builder rather than
    // interpolating the caught value, which is what carried the zone password.
    const raw_interpolation = browser.match(/UserError\(`[^`]*\$\{e\}/g) || [];
    assert.deepEqual(raw_interpolation, [],
        'these browser catches interpolate the caught error directly');
    const builder_uses = (browser.match(/browser_error\(/g) || []).length;
    assert.ok(builder_uses>=13,
        `expected the browser error builder at every catch site, saw ${builder_uses}`);
});
