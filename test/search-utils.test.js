'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {clean_search_payload, parse_search_response, search_batch,
    search_timeout_error, search_request, search_schema}
    from '../search_utils.js';

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

const parse = args=>search_schema.safeParse(args);
const issue = args=>parse(args).error.issues[0].message;

test('search_schema defaults to bing, page 0, any time', ()=>{
    assert.deepEqual(parse({query: 'x'}).data,
        {query: 'x', engine: 'bing', page: 0, time_range: 'any'});
});

test('search_schema rejects the old argument names', ()=>{
    assert.match(issue({query: 'x', geo_location: 'us'}),
        /^invalid_input: geo_location was renamed to country\./);
    assert.match(issue({query: 'x', cursor: '1'}),
        /^invalid_input: cursor was renamed to page/);
    assert.match(issue({query: 'x', foo: 1}),
        /^invalid_input: Unknown argument foo\./);
});

test('search_schema rejects yandex and a negative page', ()=>{
    assert.equal(parse({query: 'x', engine: 'yandex'}).success, false);
    assert.equal(parse({query: 'x', page: -1}).success, false);
});

test('search_schema allows on bing only day, week, year and any', ()=>{
    for (const time_range of ['hour', 'month'])
    {
        assert.match(issue({query: 'x', time_range}), new RegExp(
            `^invalid_input: time_range ${time_range} is not supported`));
    }
    for (const time_range of ['day', 'week', 'year', 'any'])
        assert.equal(parse({query: 'x', time_range}).success, true);
    for (const time_range of ['hour', 'month'])
    {
        assert.equal(parse({query: 'x', engine: 'google', time_range})
            .success, true);
    }
});

test('search_request builds the bing request', ()=>{
    const req = search_request({query: 'a b', engine: 'bing', page: 2,
        country: 'fr', time_range: 'year'});
    const url = new URL(req.url);
    assert.equal(url.origin+url.pathname, 'https://www.bing.com/search');
    assert.equal(url.searchParams.get('q'), 'a b');
    assert.equal(url.searchParams.get('first'), '21');
    assert.equal(url.searchParams.get('cc'), 'fr');
    assert.equal(url.searchParams.get('filters'), 'ex1:"ez3"');
    assert.equal(req.data_format, 'parsed_bing');
    assert.equal(req.country, 'fr');
});

test('search_request builds the google request', ()=>{
    const req = search_request({query: 'a b', engine: 'google', page: 1,
        country: 'de', time_range: 'hour'});
    const url = new URL(req.url);
    assert.equal(url.origin+url.pathname, 'https://www.google.com/search');
    assert.equal(url.searchParams.get('brd_json'), '1');
    assert.equal(url.searchParams.get('start'), '10');
    assert.equal(url.searchParams.get('gl'), 'de');
    assert.equal(url.searchParams.get('tbs'), 'qdr:h');
    assert.equal(req.data_format, 'parsed_light');
    assert.equal(req.country, undefined);
});

test('search_request leaves out unset options', ()=>{
    for (const engine of ['bing', 'google'])
    {
        const req = search_request({query: 'x', engine, page: 0,
            time_range: 'any'});
        const params = new URL(req.url).searchParams;
        for (const key of ['cc', 'gl', 'filters', 'tbs'])
            assert.equal(params.has(key), false, `${engine} ${key}`);
        assert.equal(req.country, undefined);
    }
});

test('parse_search_response cleans a parsed bing answer', ()=>{
    const res = parse_search_response(JSON.stringify({general: {},
        organic: [{link: 'https://a.example', title: 'A', rank: '1',
            description: 'd', tracking_link: 'x'}]}), 'bing');
    assert.deepEqual(res, {organic: [{link: 'https://a.example',
        title: 'A', description: 'd'}]});
});

test('parse_search_response treats an empty body as a failure', ()=>{
    assert.throws(()=>parse_search_response('', 'bing'),
        /service_unavailable: bing search failed.*about 30 seconds\.$/);
});
