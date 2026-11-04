'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {clean_search_payload, parse_search_response, search_batch,
    search_request, search_schema, SEARCH_RULES} from '../search_utils.js';
import {api_error} from '../errors.js';

const to_error = (e, q)=>api_error(e, SEARCH_RULES, q);

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

test('a non-JSON answer is a search failure, google suggests bing', ()=>{
    let err;
    try { parse_search_response('<html>blocked</html>', 'google'); }
    catch(e){ err = e; }
    assert.equal(to_error(err, {query: 'pizza'}), 'Search failed: Google '
        +'search failed for "pizza". Try again in about 30 seconds, or use '
        +'engine bing. Details: the search engine answer was not JSON');
});

const hang = (q, signal)=>new Promise((done, fail)=>
    signal.addEventListener('abort', ()=>fail(new Error('canceled'))));

test('search_batch returns ready results and times out the rest',
    async()=>{
    const run = (q, signal)=>q.query=='slow' ? hang(q, signal)
        : Promise.resolve({organic: []});
    const res = await search_batch({run, to_error, ms: 50,
        queries: [{query: 'fast', engine: 'bing'},
            {query: 'slow', engine: 'google'}]});
    assert.deepEqual(res, [
        {query: 'fast', engine: 'bing', result: {organic: []}},
        {query: 'slow', engine: 'google', error: 'Search timed out: The '
            +'search for "slow" didn\'t finish within 45 s. Retry this '
            +'query. Details: no answer within 0.05 s'},
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

test('search_batch: the same failure on every query is one error', async()=>{
    const denied = Object.assign(new Error('401'), {isAxiosError: true,
        response: {status: 401, data: 'Invalid token'}});
    await assert.rejects(search_batch({run: ()=>Promise.reject(denied),
        to_error, queries: [{query: 'a'}, {query: 'b'}]}),
        /^UserError: Sign-in failed: .* Details: Invalid token$/);
});

test('search_batch: different failures stay per query', async()=>{
    const rejected = Object.assign(new Error('400'), {isAxiosError: true,
        response: {status: 400, data: 'bad'}});
    const res = await search_batch({run: ()=>Promise.reject(rejected),
        to_error, queries: [{query: 'a'}, {query: 'b'}]});
    assert.deepEqual(res.map(r=>r.error.split('.')[0]), ['Search rejected: '
        +'Bright Data rejected the search for "a"', 'Search rejected: '
        +'Bright Data rejected the search for "b"']);
});

const parse = args=>search_schema.safeParse(args);
const issue = args=>parse(args).error.issues[0].message;

test('search_schema defaults to bing, page 0, any time', ()=>{
    assert.deepEqual(parse({query: 'x'}).data,
        {query: 'x', engine: 'bing', page: 0, time_range: 'any'});
});

test('search_schema rejects the old argument names', ()=>{
    assert.match(issue({query: 'x', geo_location: 'us'}),
        /^Invalid argument: geo_location was renamed to country\. .* got/);
    assert.match(issue({query: 'x', cursor: '1'}),
        /^Invalid argument: cursor was renamed to page/);
    assert.match(issue({query: 'x', foo: 1}),
        /^Invalid argument: Unknown argument foo\./);
});

test('search_schema rejects yandex and a negative page', ()=>{
    assert.equal(parse({query: 'x', engine: 'yandex'}).success, false);
    assert.equal(parse({query: 'x', page: -1}).success, false);
});

test('search_schema allows on bing only day, week, year and any', ()=>{
    for (const time_range of ['hour', 'month'])
    {
        assert.match(issue({query: 'x', time_range}), new RegExp(
            `^Invalid argument: time_range ${time_range} is not supported`));
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
        e=>e.reason=='bing_failed');
});

test('search errors never mention a URL', ()=>{
    for (const rule of SEARCH_RULES)
        assert.ok(!/url/i.test(rule.what+rule.todo), rule.title);
});
