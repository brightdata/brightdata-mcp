'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {clean_search_payload, parse_search_response, search_batch,
    search_timeout_error} from '../search_utils.js';

test('clean_search_payload keeps valid organic results', ()=>{
    const payload = clean_search_payload({
        organic: [
            {
                link: ' https://example.com ',
                title: ' Example ',
                description: ' Sample ',
            },
            {
                link: '',
                title: 'Missing link',
                description: 'Ignored',
            },
        ],
    });

    assert.deepEqual(payload, {
        organic: [{
            link: 'https://example.com',
            title: 'Example',
            description: 'Sample',
        }],
    });
});

test('parse_search_response throws service_unavailable on non-JSON', ()=>{
    assert.throws(()=>parse_search_response('<html>blocked</html>',
        'google'), /^UserError: service_unavailable: google search failed/);
});

const hang = (q, signal)=>new Promise((done, fail)=>
    signal.addEventListener('abort', ()=>fail(new Error('canceled'))));

test('search_batch returns ready results and times out the rest',
    async()=>{
    const run = (q, signal)=>q.query=='slow' ? hang(q, signal)
        : Promise.resolve({organic: []});
    const res = await search_batch({run, to_error: e=>e.message, ms: 50,
        queries: [{query: 'fast', engine: 'bing'},
            {query: 'slow', engine: 'google'}]});
    assert.deepEqual(res, [
        {query: 'fast', engine: 'bing', result: {organic: []}},
        {query: 'slow', engine: 'google', error: search_timeout_error},
    ]);
});

test('search_batch keeps a per-query error before the deadline', async()=>{
    const run = q=>q.query=='bad' ? Promise.reject(new Error('boom'))
        : Promise.resolve({organic: []});
    const res = await search_batch({run, to_error: e=>e.message, ms: 1000,
        queries: [{query: 'bad', engine: 'bing'},
            {query: 'ok', engine: 'bing'}]});
    assert.deepEqual(res.map(r=>r.error||'ok'), ['boom', 'ok']);
});
