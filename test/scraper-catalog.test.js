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

const start_docs = ()=>new Promise(done=>{
    const state = {hits: 0, fail: false};
    const server = http.createServer((req, res)=>{
        state.hits++;
        if (state.fail)
        {
            res.writeHead(500);
            return void res.end();
        }
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({count: scrapers.length, scrapers}));
    });
    server.listen(0, '127.0.0.1', ()=>done({server, state,
        url: `http://127.0.0.1:${server.address().port}/scrapers.json`}));
});

const setup = async t=>{
    const docs = await start_docs();
    t.after(()=>docs.server.close());
    const clock = {ms: 1000};
    const catalog = create_scraper_catalog({url: docs.url,
        now: ()=>clock.ms});
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

test('failed first load reaches the caller', async t=>{
    const {catalog, state} = await setup(t);
    state.fail = true;
    await assert.rejects(catalog.search('amazon'), /status code 500/);
});
