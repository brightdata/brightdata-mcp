'use strict'; /*jslint node:true es9:true*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {batch_pages} from '../fetch_api.js';

const timing = {cancel_ms: 40, deadline_ms: 120, poll_ms: 5};
const urls = ['https://a.example/', 'https://b.example/'];
const page = url=>({url, input: {url}, page_title: 'T',
    markdown: '# Page\n\n'+'text '.repeat(30)});
const fake = (opt = {})=>{
    const calls = [];
    const runner = {
        trigger: async req=>{
            calls.push(['trigger', req.input]);
            if (opt.trigger_error)
                throw opt.trigger_error;
            return 'sd_1';
        },
        progress: async()=>{
            calls.push(['progress']);
            if (opt.progress_error && calls.length<4)
                throw new Error('poll failed');
            return {status: opt.status||'ready'};
        },
        cancel: async()=>{ calls.push(['cancel']); },
        results: async()=>{
            calls.push(['results']);
            return opt.results||{status: 'ready', data: urls.map(page)};
        },
    };
    return {runner, calls};
};
const run = (opt, list = urls)=>{
    const {runner, calls} = fake(opt);
    return batch_pages({runner, urls: list, timing}).then(items=>({items,
        calls}));
};

test('a ready batch returns every page in input order, one trigger', async()=>{
    const {items, calls} = await run({}, [urls[1], urls[0], urls[1]]);
    assert.deepEqual(items.map(i=>i.url), [urls[1], urls[0], urls[1]]);
    assert.ok(items.every(i=>i.content));
    assert.deepEqual(calls.filter(c=>c[0]=='trigger'),
        [['trigger', [{url: urls[1]}, {url: urls[0]}]]]);
    assert.equal(calls.some(c=>c[0]=='cancel'), false);
});

test('a slow batch is cancelled and keeps the finished pages', async()=>{
    const aborted = {url: urls[1], input: {url: urls[1]},
        error_code: 'aborted_page', error: 'Crawl aborted on job cancel'};
    const {items, calls} = await run({status: 'running',
        results: {status: 'ready', data: [page(urls[0]), aborted]}});
    assert.ok(calls.some(c=>c[0]=='cancel'));
    assert.ok(items[0].content);
    assert.match(items[1].error, /^timeout: https:\/\/b.example\/ did not/);
});

test('cancelled with nothing finished: every URL times out', async()=>{
    const {items} = await run({status: 'running',
        results: {status: 'canceled', data: []}});
    assert.ok(items.every(i=>/^timeout: /.test(i.error)));
});

test('not downloadable by the deadline: every URL times out', async()=>{
    const {items} = await run({status: 'running',
        results: {status: 'running'}});
    assert.ok(items.every(i=>/^timeout: /.test(i.error)));
});

test('a failed job fails every URL', async()=>{
    const {items} = await run({status: 'failed'});
    assert.ok(items.every(i=>/^fetch_failed: .* the batch job failed/
        .test(i.error)));
});

test('a failed progress poll is not fatal', async()=>{
    const {items} = await run({progress_error: true});
    assert.ok(items.every(i=>i.content));
});

test('a trigger error is one tool error, never retried', async()=>{
    const cause = Object.assign(new Error('x'), {isAxiosError: true,
        response: {status: 429}});
    const {runner, calls} = fake({trigger_error: Object.assign(
        new Error('trigger failed'), {cause})});
    await assert.rejects(batch_pages({runner, urls, timing}), /^UserError: rate_limited: /);
    assert.equal(calls.length, 1);
});
