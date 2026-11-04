'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {ACCOUNT_RULES, DEFAULT_RULES, api_error, describe, read_error, read_record,
    tool_error} from '../errors.js';

const http = (status, data = '', headers = {})=>Object.assign(
    new Error(`Request failed with status code ${status}`),
    {isAxiosError: true, response: {status, data, headers}});
const title = text=>text.split(':')[0];

const cases = [
    ['canceled', Object.assign(new Error('canceled'),
        {code: 'ERR_CANCELED'}), 'Timed out'],
    ['playwright timeout', Object.assign(new Error('Timeout 30000ms'),
        {name: 'TimeoutError'}), 'Timed out'],
    ['no response', Object.assign(new Error('connect ECONNRESET'),
        {isAxiosError: true}), 'Connection failed'],
    ['quota', http(402, 'limit', {'x-brd-err-code': 'client_10100'}),
        'Usage limit reached'],
    ['zone', http(400, 'zone "mcp_serp" not found'), 'Zone not found'],
    ['401', http(401, 'Invalid token'), 'Sign-in failed'],
    ['407', http(407), 'Sign-in failed'],
    ['429', http(429), 'Rate limited'],
    ['400', http(400, 'bad'), 'Request rejected'],
    ['403', http(403, 'no'), 'Request refused'],
    ['502', http(502), 'Service unavailable'],
    ['plain error', new Error('boom'), 'Tool error'],
];

for (const [name, e, expected] of cases)
{
    test(`api_error: ${name} -> ${expected}`, ()=>{
        assert.equal(title(api_error(e)), expected);
    });
}

test('api_error builds the full line', ()=>{
    assert.equal(api_error(http(429, 'slow down')), 'Rate limited: Too many '
        +'requests right now. Wait a few seconds, then retry. Details: slow '
        +'down');
});

test('details fall back to the status, then the message', ()=>{
    assert.equal(read_error(http(502)).details, 'HTTP 502');
    assert.equal(read_error(new Error('boom')).details, 'boom');
});

test('details keep the readable parts of a JSON body', ()=>{
    const validation = {error: 'Request validation failed', details: [
        {message: '"url" must be a valid uri', path: ['url']}]};
    assert.equal(read_error(http(400, validation)).details,
        'Request validation failed: "url" must be a valid uri');
    const input = {error: 'Invalid input provided', errors: [
        ['nourl', 'not allowed'], ['url', 'Required field']]};
    assert.equal(read_error(http(400, input)).details,
        'Invalid input provided: nourl: not allowed; url: Required field');
});

test('details hide URL credentials and stop at 300 characters', ()=>{
    assert.equal(read_error(new Error('at wss://u:p@h')).details,
        'at wss://[REDACTED]@h');
    assert.equal(read_error(http(400, 'x'.repeat(900))).details.length, 300);
});

test('read_error finds the axios error in e.cause', ()=>{
    const e = Object.assign(new Error('trigger failed (HTTP 404): no'),
        {step: 'trigger', cause: http(404, 'no such dataset')});
    assert.deepEqual(read_error(e), {kind: 'http', status: 404,
        brd_code: undefined, step: 'trigger', reason: undefined,
        details: 'no such dataset'});
});

test('tool rules come first, the rest falls through to defaults', ()=>{
    const rules = [{status: 400, title: 'Search rejected',
        what: 'Bright Data rejected the search for "{query}"',
        todo: 'Check the query.'}];
    const vars = {query: 'pizza'};
    assert.equal(api_error(http(400, 'bad'), rules, vars), 'Search rejected: '
        +'Bright Data rejected the search for "pizza". Check the query. '
        +'Details: bad');
    assert.equal(title(api_error(http(429), rules, vars)), 'Rate limited');
});

test('account rules win over tool rules', ()=>{
    const rules = [{status: 400, title: 'Search rejected', what: 'w',
        todo: 't'}];
    assert.equal(title(api_error(http(400, 'zone "x" not found'), rules)),
        'Zone not found');
});

test('rules match on step, reason and page', ()=>{
    const rules = [
        {step: 'trigger', status: 404, title: 'A', what: 'a', todo: 'a'},
        {reason: 'ref_not_found', title: 'B', what: 'b', todo: 'b'},
        {page: 'dead_page', title: 'C', what: 'c', todo: 'c'},
    ];
    const e = Object.assign(new Error('x'), {step: 'trigger',
        cause: http(404)});
    assert.equal(title(api_error(e, rules)), 'A');
    assert.equal(title(api_error(Object.assign(new Error('x'),
        {reason: 'ref_not_found'}), rules)), 'B');
    assert.equal(title(describe(read_record({error_code: 'dead_page',
        error: '404'}), rules)), 'C');
});

test('tool_error fills {host} from {url}', ()=>{
    const rule = {title: 'T', what: '{host} is slow', todo: 'Wait.'};
    assert.equal(tool_error(rule, 'd', {url: 'https://a.com/x'}),
        'T: a.com is slow. Wait. Details: d');
});

test('default rules are well formed and name no tool input', ()=>{
    for (const rule of [...ACCOUNT_RULES, ...DEFAULT_RULES])
    {
        assert.ok(rule.title && rule.what && rule.todo, rule.title);
        assert.ok(!rule.what.endsWith('.'), rule.title);
        assert.ok(!/url|query/i.test(rule.what+rule.todo), rule.title);
    }
    assert.equal(Object.keys(DEFAULT_RULES.at(-1)).length, 3);
});
