'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {create_scraper_catalog} from '../scraper_catalog.js';

const DAY_MS = 24*60*60*1000;
const scrapers = [
    {dataset_id: 'gd_amz_prod', name: ' Amazon Products ',
        domain: 'amazon.com', collection_methods: ['collect_by_url']},
    {dataset_id: 'gd_amz_rev', name: 'Amazon Reviews', domain: 'amazon.com',
        collection_methods: ['collect_by_url', 'discover_by_keyword']},
    {dataset_id: 'gd_ebay', name: 'eBay Products', domain: 'ebay.com',
        collection_methods: ['collect_by_url']},
    {dataset_id: 'gd_jobs_a', name: 'Jobs', domain: 'a.com',
        collection_methods: ['collect_by_url']},
    {dataset_id: 'gd_jobs_b', name: 'Jobs', domain: 'b.com',
        collection_methods: ['discover_by_sietmap']},
];

const url_field = {name: 'url', type: 'url', required: true,
    description: 'Review URL', example: 'https://amazon.com/r/1'};
const details = {
    gd_amz_rev: {
        collect_by_url: {input_schema: [url_field],
            output_fields: [{name: 'rating', type: 'number', fill_rate: 99,
                description: 'Star rating'}],
            sample_input: [{url: 'https://amazon.com/r/1'}]},
        discover_by_keyword: {
            input_schema: [{name: 'keyword', type: 'text', required: false}],
            output_fields: [{name: 'rating', type: 'number'}],
            sample_input: []},
    },
    gd_jobs_b: {discover_by_sietmap: {input_schema: [], output_fields: [],
        sample_input: []}},
};

const send =(res, code, body)=>{
    res.writeHead(code, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(body));
};

const route = (state, req, res)=>{
    const url = new URL(req.url, 'http://x'), pathname = url.pathname;
    if (pathname=='/scrapers.json')
    {
        state.hits++;
        if (state.fail)
            return send(res, 500, {});
        return send(res, 200, {count: scrapers.length, scrapers});
    }
    if (pathname=='/datasets/v3/scrapers')
    {
        state.api_hits++;
        state.auth = req.headers.authorization;
        if (state.api_fail)
            return send(res, 500, {});
        const id = url.searchParams.get('dataset_id');
        return send(res, 200, details[id] ? [{id, description: `About ${id}`,
            scrapers: details[id]}]
            : []);
    }
    const m = pathname.match(/^\/scrapers\/(\w+)\.json$/);
    if (m && details[m[1]])
        return send(res, 200, {id: m[1], collection_methods: details[m[1]]});
    return send(res, 404, {});
};

const start_docs = ()=>new Promise(done=>{
    const state = {hits: 0, api_hits: 0, fail: false, api_fail: false};
    const server = http.createServer((req, res)=>route(state, req, res));
    server.listen(0, '127.0.0.1', ()=>done({server, state,
        url: `http://127.0.0.1:${server.address().port}`}));
});

const setup = async t=>{
    const docs = await start_docs();
    t.after(()=>docs.server.close());
    const clock = {ms: 1000};
    const catalog = create_scraper_catalog({docs_url: docs.url,
        api_url: docs.url, now: ()=>clock.ms});
    return {...docs, clock, catalog};
};

const ids = list=>list.map(s=>s.dataset_id);

test('search matches name, domain or id', async t=>{
    const {catalog} = await setup(t);
    assert.deepEqual(ids(await catalog.search('ebay products')),
        ['gd_ebay', 'gd_amz_prod']);
    assert.deepEqual(ids(await catalog.search('EBAY.COM')), ['gd_ebay']);
    assert.deepEqual(ids(await catalog.search('gd_amz_rev')), ['gd_amz_rev']);
});

test('search ignores ids unless the word starts with gd_', async t=>{
    const {catalog} = await setup(t);
    assert.deepEqual(await catalog.search('amz'), []);
    assert.deepEqual(ids(await catalog.search('gd_amz')),
        ['gd_amz_prod', 'gd_amz_rev']);
});

test('search ranks by matched words, trims names, honours limit',
async t=>{
    const {catalog} = await setup(t);
    const res = await catalog.search('amazon reviews');
    assert.deepEqual(ids(res), ['gd_amz_rev', 'gd_amz_prod']);
    assert.equal(res[1].name, 'Amazon Products');
    assert.equal((await catalog.search('amazon', 1)).length, 1);
    assert.deepEqual(await catalog.search('nothing here'), []);
});

test('search returns both scrapers sharing a name', async t=>{
    const {catalog} = await setup(t);
    const res = await catalog.search('jobs');
    assert.deepEqual(ids(res).sort(), ['gd_jobs_a', 'gd_jobs_b']);
    assert.deepEqual(res.find(s=>s.dataset_id=='gd_jobs_b')
        .collection_methods, ['discover_by_sietmap']);
});

test('catalog is cached within the TTL', async t=>{
    const {catalog, state} = await setup(t);
    await catalog.search('amazon');
    await catalog.search('ebay');
    assert.equal(state.hits, 1);
});

test('catalog is refetched after the TTL', async t=>{
    const {catalog, state, clock} = await setup(t);
    await catalog.load_catalog();
    clock.ms += DAY_MS;
    await catalog.load_catalog();
    assert.equal(state.hits, 2);
});

test('force refetches a fresh catalog', async t=>{
    const {catalog, state} = await setup(t);
    await catalog.load_catalog();
    await catalog.load_catalog({force: true});
    assert.equal(state.hits, 2);
});

test('failed refresh keeps serving the old catalog', async t=>{
    const {catalog, state, clock} = await setup(t);
    await catalog.load_catalog();
    state.fail = true;
    clock.ms += DAY_MS;
    assert.equal((await catalog.load_catalog()).length, scrapers.length);
    assert.equal(state.hits, 2);
    assert.deepEqual(ids(await catalog.search('ebay')), ['gd_ebay']);
});

test('failed forced refresh reaches the caller, old catalog stays',
async t=>{
    const {catalog, state} = await setup(t);
    await catalog.load_catalog();
    state.fail = true;
    await assert.rejects(catalog.load_catalog({force: true}),
        /status code 500/);
    assert.deepEqual(ids(await catalog.search('ebay')), ['gd_ebay']);
});

test('failed first load reaches the caller', async t=>{
    const {catalog, state} = await setup(t);
    state.fail = true;
    await assert.rejects(catalog.search('amazon'), /status code 500/);
});

const auth = {Authorization: 'Bearer k'};

test('details from the API include the example input', async t=>{
    const {catalog, state} = await setup(t);
    const d = await catalog.get_details('gd_amz_rev', 'collect_by_url',
        auth);
    assert.equal(state.auth, 'Bearer k');
    assert.deepEqual(d, {dataset_id: 'gd_amz_rev', name: 'Amazon Reviews',
        domain: 'amazon.com', description: 'About gd_amz_rev',
        method: 'collect_by_url', source: 'api',
        input_fields: [{name: 'url', type: 'url', required: true,
            description: 'Review URL'}],
        output_fields: [{name: 'rating', description: 'Star rating'}],
        sample_input: [{url: 'https://amazon.com/r/1'}], notes: []});
});

test('details say when there is no example or required field',
async t=>{
    const {catalog} = await setup(t);
    const d = await catalog.get_details('gd_amz_rev', 'discover_by_keyword',
        auth);
    assert.equal(d.sample_input, null);
    assert.deepEqual(d.notes, ['No example input for this method.',
        'This method has no required input fields.']);
});

test('details say when the schema is empty', async t=>{
    const {catalog} = await setup(t);
    const d = await catalog.get_details('gd_jobs_b', 'discover_by_sietmap',
        auth);
    assert.deepEqual(d.input_fields, []);
    assert.deepEqual(d.notes, ['No example input for this method.',
        'This method has no documented input fields.']);
});

test('details fall back to docs when the API fails', async t=>{
    const {catalog, state} = await setup(t);
    state.api_fail = true;
    const d = await catalog.get_details('gd_amz_rev', 'collect_by_url',
        auth);
    assert.equal(d.source, 'docs');
    assert.equal(d.description, null);
    assert.equal(d.sample_input, null);
    assert.deepEqual(d.input_fields.map(f=>f.name), ['url']);
    assert.deepEqual(d.notes,
        ['Example input unavailable: details API failed.']);
});

test('API details are cached per id, docs fallback is not', async t=>{
    const {catalog, state, clock} = await setup(t);
    state.api_fail = true;
    await catalog.get_details('gd_amz_rev', 'collect_by_url', auth);
    state.api_fail = false;
    await catalog.get_details('gd_amz_rev', 'collect_by_url', auth);
    await catalog.get_details('gd_amz_rev', 'discover_by_keyword', auth);
    assert.equal(state.api_hits, 2);
    clock.ms += DAY_MS;
    await catalog.get_details('gd_amz_rev', 'collect_by_url', auth);
    assert.equal(state.api_hits, 3);
});

test('details reject unknown ids and methods', async t=>{
    const {catalog, state} = await setup(t);
    await assert.rejects(catalog.get_details('gd_nope', 'collect_by_url'),
        /Unknown dataset_id gd_nope/);
    await assert.rejects(catalog.get_details('gd_amz_rev', 'discover_by_x'),
        /no method discover_by_x, available: collect_by_url, discover_by/);
    assert.equal(state.api_hits, 1);
});

test('details fail when API and docs both fail', async t=>{
    const {catalog, state} = await setup(t);
    state.api_fail = true;
    await assert.rejects(catalog.get_details('gd_ebay', 'collect_by_url'),
        /status code 404/);
});
