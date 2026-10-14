'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const test_dir = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(test_dir, '..');

// scrape_as_html and extract's scrape stage used to call the unlocker /request
// endpoint with raw axios, silently ignoring BASE_TIMEOUT / BASE_MAX_RETRIES
// while their sibling tools honored both. Pin the invariant that closes the
// gap: every call to the /request endpoint goes through base_request. Keys on
// the endpoint string rather than line numbers so it survives unrelated edits,
// and fails if a new tool is pasted in with a raw axios /request call.
test('every unlocker /request call goes through base_request', ()=>{
    const src = readFileSync(resolve(repo_root, 'server.js'), 'utf8');
    const endpoint = "'https://api.brightdata.com/request'";
    let idx = 0, sites = 0;
    while ((idx = src.indexOf(endpoint, idx)) !== -1)
    {
        sites++;
        // the call head sits within the preceding ~80 chars, with
        // `base_request({` ending its line just above the url: line
        const head = src.slice(Math.max(0, idx-80), idx);
        assert.match(head, /base_request\(\{\s*$/m,
            `/request call site #${sites} must use base_request, not raw axios`);
        idx += endpoint.length;
    }
    assert.ok(sites>=6, `expected the known /request call sites, found ${sites}`);
});
