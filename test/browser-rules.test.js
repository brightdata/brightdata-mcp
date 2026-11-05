'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {BROWSER_RULES} from '../browser_rules.js';
import {api_error} from '../errors.js';

const title = (e, vars)=>api_error(e, BROWSER_RULES, vars).split(':')[0];
const err = (message, extra)=>Object.assign(new Error(message), extra);

test('browser errors get their own titles', ()=>{
    assert.equal(title(err('Ref e9 not found', {reason: 'ref_not_found'})),
        'Element not found');
    assert.equal(title(err('twice', {reason: 'ref_ambiguous'})),
        'Element ambiguous');
    assert.equal(title(err('locator.click: Timeout 5000ms exceeded.',
        {name: 'TimeoutError'})), 'Browser timed out');
    assert.equal(title(err('page.goto: net::ERR_CONNECTION_RESET')),
        'Browser action failed');
    assert.equal(title(err('Browser zone "mcp_browser" not found')),
        'Zone not found');
});

test('an unknown domain names the host', ()=>{
    assert.equal(api_error(err('page.goto: Could not resolve host '
        +'nx.example'), BROWSER_RULES, {url: 'https://nx.example/'}),
        'Site not found: nx.example doesn\'t resolve. Check the URL '
        +'spelling; retrying won\'t help. Details: page.goto: Could not '
        +'resolve host nx.example');
});

test('the element message names the ref', ()=>{
    assert.match(api_error(err('x', {reason: 'ref_not_found'}),
        BROWSER_RULES, {ref: 'e9'}), /^Element not found: Ref e9 isn't/);
});
